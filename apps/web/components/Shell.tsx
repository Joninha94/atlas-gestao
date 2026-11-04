'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Bell, Building2, FileText, FolderOpen, Gauge, ListChecks, LogOut, MessagesSquare, Radar, Settings } from 'lucide-react';
import { io } from 'socket.io-client';
import { API_URL, api, apiPost, getSession, setSession } from '../lib/api';
import { useApi, toast } from '../lib/hooks';
import { dateTime } from '../lib/format';
import { Toaster } from './ui';

const NAV = [
  { href: '/', label: 'Painel', icon: Gauge },
  { href: '/monitor', label: 'Monitor Fiscal', icon: Radar },
  { href: '/comunicacao', label: 'Comunicação', icon: MessagesSquare },
  { href: '/notas', label: 'Notas Fiscais', icon: FileText },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
  { href: '/drive', label: 'Drive', icon: FolderOpen },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

/** Moldura do painel: verifica sessão, menu lateral, sino de alertas em tempo real. */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ name: string; tenant?: string } | null>(null);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string | null } | null>(null);

  // Logo e nome do escritório (atualiza na hora quando trocados em Configurações)
  useEffect(() => {
    if (path === '/login' || !getSession()) return;
    const load = () => api<{ name: string; logoUrl: string | null }>('/settings/branding').then(setBrand).catch(() => undefined);
    load();
    window.addEventListener('produtiva:branding', load);
    return () => window.removeEventListener('produtiva:branding', load);
  }, [path === '/login']);

  useEffect(() => {
    if (path === '/login') return setReady(true);
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setUser(s.user);
    setReady(true);
  }, [path, router]);

  if (path === '/login') return (<>{children}<Toaster /></>);
  if (!ready) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {brand?.logoUrl ? (
          <div className="px-5 py-4">
            <img src={brand.logoUrl} alt={brand.name} className="max-h-12 max-w-[190px] object-contain" />
            <div className="mt-1 text-[11px] text-ink-muted">Produtiva Gestão</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-brand-700 text-sm font-bold text-white">P</div>
            <div>
              <div className="text-sm font-semibold leading-tight">Produtiva Gestão</div>
              <div className="text-[11px] text-ink-muted">{brand?.name ?? user?.tenant ?? 'Escritório'}</div>
            </div>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? path === '/' : path.startsWith(href);
            return (
              <Link key={href} href={href} className={clsx('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition', active ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-soft hover:bg-slate-50')}>
                <Icon size={17} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-ink-muted">
          <div className="truncate font-medium text-ink">{user?.name}</div>
          <button
            className="mt-1 inline-flex items-center gap-1 hover:text-ink"
            onClick={async () => {
              const s = getSession();
              if (s) await apiPost('/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
              setSession(null);
              router.replace('/login');
            }}
          >
            <LogOut size={13} /> Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

function TopBar() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<any[]>('/notifications', { refreshMs: 30_000 });
  const unread = (data ?? []).filter((n) => !n.readAt);

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    const socket = io(API_URL, { auth: { token: s.accessToken }, transports: ['websocket'] });
    socket.on('notification', (n: any) => {
      toast(n.title);
      reload();
    });
    return () => {
      socket.disconnect();
    };
  }, [reload]);

  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-ink-soft hover:bg-slate-100" aria-label="Alertas">
          <Bell size={18} />
          {unread.length > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread.length}</span>}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <span className="text-sm font-semibold">Alertas</span>
              {unread.length > 0 && (
                <button className="text-xs text-brand-700 hover:underline" onClick={async () => { await apiPost('/notifications/read', { ids: unread.map((n) => n.id) }); reload(); }}>
                  Marcar como lidos
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {(data ?? []).length === 0 && <div className="px-4 py-6 text-center text-sm text-ink-muted">Sem alertas.</div>}
              {(data ?? []).map((n) => (
                <a key={n.id} href={n.link ?? '#'} target={n.link?.startsWith('http') ? '_blank' : undefined} className={clsx('block border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}>
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="truncate text-xs text-ink-muted">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-ink-muted">{dateTime(n.createdAt)}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
