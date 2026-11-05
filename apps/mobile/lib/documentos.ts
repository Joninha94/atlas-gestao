/**
 * CPF/CNPJ no padrão da Receita Federal: máscara enquanto digita e validação dos dígitos verificadores.
 * (Mesmas regras de packages/core/src/documents.ts e cnpjws.ts.)
 */
export const onlyDigits = (v: string) => (v ?? '').replace(/\D/g, '');

export function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}
export function formatCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export const formatDocumento = (v: string) => (onlyDigits(v).length > 11 ? formatCnpj(v) : formatCpf(v));
export const formatCep = (v: string) => onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * w[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export type TipoDocumento = 'cnpj' | 'cpf' | 'auto';

/** Mensagem de erro (ou null) para o valor digitado. Vazio não é erro aqui: use `required` no formulário. */
export function erroDocumento(v: string, tipo: TipoDocumento): string | null {
  const d = onlyDigits(v);
  if (!d) return null;
  if (tipo === 'cnpj' || (tipo === 'auto' && d.length > 11)) {
    if (d.length < 14) return 'CNPJ incompleto: são 14 dígitos.';
    return isValidCnpj(d) ? null : 'CNPJ inválido: os dígitos verificadores não conferem.';
  }
  if (d.length < 11) return tipo === 'auto' ? 'Digite os 11 dígitos do CPF ou os 14 do CNPJ.' : 'CPF incompleto: são 11 dígitos.';
  return isValidCpf(d) ? null : 'CPF inválido: os dígitos verificadores não conferem.';
}
