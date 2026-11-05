'use client';

/**
 * Cliente HTTP do painel. Access token curto em memória/localStorage + refresh rotativo.
 * Em 401, tenta renovar uma vez e repete; se falhar, volta para o login.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const KEY = 'produtiva.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; role: string; tenant?: string };
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const s = getSession();
  if (!s) return false;
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json();
      setSession({ ...s, accessToken: d.accessToken, refreshToken: d.refreshToken });
      return true;
    })
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data?: unknown) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const s = getSession();
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: {
      ...(init.json !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(s ? { Authorization: `Bearer ${s.accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && retry && s) {
    if (await refresh()) return api<T>(path, init, false);
    setSession(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : ct.startsWith('text/') ? await res.text() : await res.blob();
  if (!res.ok) {
    const msg = (data as any)?.message;
    const issues: { message: string }[] = Array.isArray((data as any)?.issues) ? (data as any).issues : [];
    // Erros de validação: mostra o motivo de cada campo (ex.: "CPF do contador inválido.")
    const text = issues.length ? issues.map((i) => i.message).join(' ') : Array.isArray(msg) ? msg.join(', ') : msg ?? `Erro ${res.status}`;
    throw new ApiError(text, res.status, data);
  }
  return data as T;
}

export const apiGet = <T = any>(p: string) => api<T>(p);
export const apiPost = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json: json ?? {} });
export const apiPut = <T = any>(p: string, json?: unknown) => api<T>(p, { method: 'PUT', json });
export const apiDelete = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

/** Upload de arquivos (multipart). Retorna as referências com texto extraído dos PDFs. */
export function uploadFiles(files: File[] | FileList, extra: Record<string, string> = {}) {
  const fd = new FormData();
  Array.from(files).forEach((f) => fd.append('files', f));
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return api<{ fileKey: string; fileName: string; size: number; mime: string; text?: string; fileId?: string }[]>('/files', { method: 'POST', body: fd });
}

/** Baixa um arquivo autenticado (Excel, PDF assinado) e dispara o download no navegador. */
export async function download(path: string, fileName: string) {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function openSigned(path: string) {
  const { url } = await apiGet<{ url: string | null }>(path);
  if (url) window.open(url, '_blank', 'noopener');
}
