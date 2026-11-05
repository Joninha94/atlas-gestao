'use client';
import clsx from 'clsx';
import { InputHTMLAttributes, useState } from 'react';
import { TipoDocumento, erroDocumento, formatCnpj, formatCpf, formatDocumento, onlyDigits } from '../lib/documentos';

/**
 * Campo de CPF/CNPJ com máscara da Receita (00.000.000/0000-00 · 000.000.000-00) e validação
 * dos dígitos verificadores. Mostra o erro ao sair do campo e um ✓ quando o documento é válido.
 */
export function DocInput({ tipo = 'auto', value, onChange, className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  tipo?: TipoDocumento; value: string; onChange: (masked: string, valido: boolean) => void;
}) {
  const [tocado, setTocado] = useState(false);
  const fmt = tipo === 'cnpj' ? formatCnpj : tipo === 'cpf' ? formatCpf : formatDocumento;
  const erro = erroDocumento(value, tipo);
  const completo = onlyDigits(value).length === (tipo === 'cpf' ? 11 : tipo === 'cnpj' ? 14 : onlyDigits(value).length > 11 ? 14 : 11);
  const ok = !!value && !erro;
  return (
    <div>
      <div className="relative">
        <input
          {...p}
          inputMode="numeric"
          autoComplete="off"
          maxLength={tipo === 'cpf' ? 14 : 18}
          placeholder={p.placeholder ?? (tipo === 'cpf' ? '000.000.000-00' : tipo === 'cnpj' ? '00.000.000/0000-00' : 'CPF ou CNPJ')}
          className={clsx('input pr-8 tabular-nums', (tocado || completo) && erro && 'border-red-400 focus:border-red-500 focus:ring-red-200', className)}
          value={value}
          onChange={(e) => {
            const m = fmt(e.target.value);
            onChange(m, !erroDocumento(m, tipo) && !!onlyDigits(m));
          }}
          onBlur={(e) => { setTocado(true); p.onBlur?.(e); }}
          aria-invalid={!!erro}
        />
        {ok && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-600" aria-label="válido">✓</span>}
      </div>
      {(tocado || completo) && erro && <span className="mt-1 block text-xs text-red-600">{erro}</span>}
    </div>
  );
}
