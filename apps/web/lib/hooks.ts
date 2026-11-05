'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api';

/** Busca com recarga manual e polling opcional. `path = null` não busca. */
export function useApi<T = any>(path: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    if (!pathRef.current) return;
    setLoading(true);
    try {
      setData(await apiGet<T>(pathRef.current));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    reload();
    if (!opts.refreshMs) return;
    const t = setInterval(reload, opts.refreshMs);
    return () => clearInterval(t);
  }, [path, opts.refreshMs, reload]);

  return { data, error, loading, reload, setData };
}

/** Executa uma ação com estado de carregamento e mensagem de erro/sucesso. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok, 'ok');
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

type ToastKind = 'ok' | 'error' | 'info';
const listeners = new Set<(t: { id: number; text: string; kind: ToastKind }) => void>();
export function toast(text: string, kind: ToastKind = 'info') {
  const t = { id: Date.now() + Math.random(), text, kind };
  listeners.forEach((l) => l(t));
}
export function onToast(fn: (t: { id: number; text: string; kind: ToastKind }) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Valor com atraso (para busca enquanto digita, sem uma chamada por tecla). */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
