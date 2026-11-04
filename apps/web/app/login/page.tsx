'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, setSession } from '../../lib/api';
import { Button, Field } from '../../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ cnpj: '', email: '', password: '', totp: '' });
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<any>('/auth/login', { method: 'POST', json: { ...form, totp: form.totp || undefined } });
      if (r.requiresTotp) {
        setNeedTotp(true);
        return;
      }
      setSession({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user });
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-700 text-lg font-bold text-white">P</div>
          <div>
            <div className="font-semibold">Produtiva Gestão</div>
            <div className="text-xs text-ink-muted">Acesso do escritório</div>
          </div>
        </div>
        <div className="space-y-3.5">
          <Field label="CNPJ do escritório">
            <input className="input" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" required autoFocus />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="username" />
          </Field>
          <Field label="Senha">
            <input className="input" type="password" value={form.password} onChange={set('password')} required autoComplete="current-password" />
          </Field>
          {needTotp && (
            <Field label="Código do autenticador (2FA)">
              <input className="input tracking-widest" inputMode="numeric" maxLength={6} value={form.totp} onChange={set('totp')} autoFocus />
            </Field>
          )}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
        </div>
      </form>
    </div>
  );
}
