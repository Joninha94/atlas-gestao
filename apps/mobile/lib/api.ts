import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; officeCnpj?: string };
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:3333').replace(/\/$/, '');
export const OFFICE_CNPJ = process.env.EXPO_PUBLIC_OFFICE_CNPJ ?? extra.officeCnpj ?? '';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; company: string; appPlus?: boolean };
}

const KEY = 'produtiva.client.session';

/** SecureStore no Android/iOS (Keychain/Keystore); localStorage no navegador. */
const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') { try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(KEY);
  },
  async set(v: string | null) {
    if (Platform.OS === 'web') {
      try { v === null ? globalThis.localStorage?.removeItem(KEY) : globalThis.localStorage?.setItem(KEY, v); } catch { /* modo privado */ }
      return;
    }
    if (v === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, v);
  },
};

let current: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

export async function loadSession() {
  const raw = await store.get();
  current = raw ? (JSON.parse(raw) as Session) : null;
  return current;
}
export function getSession() { return current; }
export async function setSession(s: Session | null) {
  current = s;
  await store.set(s ? JSON.stringify(s) : null);
  listeners.forEach((l) => l(s));
}
export function onSession(l: (s: Session | null) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!current) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current!.refreshToken }) });
      if (!r.ok) { await setSession(null); return false; }
      const s = (await r.json()) as Session;
      await setSession({ ...current!, ...s, user: { ...current!.user, ...s.user } });
      return true;
    } catch { return false; }
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (current) headers.Authorization = `Bearer ${current.accessToken}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
    headers,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  if (r.status === 401 && retry && current && (await refresh())) return api<T>(path, init, false);
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? `Erro ${r.status}`;
    throw new ApiError(r.status, msg);
  }
  return data as T;
}

export async function logout() {
  if (current) await api('/auth/logout', { body: { refreshToken: current.refreshToken } }).catch(() => undefined);
  await setSession(null);
}
