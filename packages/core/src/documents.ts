/**
 * Documentos brasileiros: validação e extração de CPF/CNPJ em texto livre.
 * Usado pelo "arrasta-e-solta inteligente" (Tarefas) e pelo envio em lote (Comunicação)
 * para descobrir de qual cliente é um PDF.
 */

export const onlyDigits = (v: string): string => v.replace(/\D/g, '');

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function formatDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value;
}

/**
 * Extrai todos os CNPJs e CPFs válidos de um texto (ex.: texto extraído de um PDF).
 * Retorna só dígitos, sem duplicatas, CNPJs primeiro (mais específicos para empresa).
 */
export function extractDocuments(text: string): { cnpjs: string[]; cpfs: string[] } {
  const cnpjRe = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const cpfRe = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const cnpjs = [...new Set((text.match(cnpjRe) ?? []).map(onlyDigits).filter(isValidCnpj))];
  const cpfs = [...new Set((text.match(cpfRe) ?? []).map(onlyDigits).filter(isValidCpf))];
  return { cnpjs, cpfs };
}

/**
 * Decide o cliente de um documento: o primeiro CNPJ/CPF encontrado que existe na carteira.
 * `known` = documentos dos clientes do escritório (só dígitos).
 * Ignora o CNPJ do próprio escritório, que costuma aparecer em cabeçalhos e rodapés.
 */
export function matchClientDocument(text: string, known: Set<string>, officeCnpj?: string): string | null {
  const { cnpjs, cpfs } = extractDocuments(text);
  const office = officeCnpj ? onlyDigits(officeCnpj) : undefined;
  for (const doc of [...cnpjs, ...cpfs]) {
    if (doc !== office && known.has(doc)) return doc;
  }
  return null;
}
