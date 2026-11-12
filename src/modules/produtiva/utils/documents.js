// CPF/CNPJ em texto livre: descobre de qual cliente é um PDF no envio em lote
// do Drive. Portado de produtiva-gestao/packages/core/src/documents.ts.

export const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function formatDocument(value) {
  const d = onlyDigits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value;
}

// Todos os CNPJs e CPFs válidos do texto, só dígitos, sem duplicatas.
export function extractDocuments(text) {
  const cnpjRe = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const cpfRe = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const cnpjs = [...new Set((text.match(cnpjRe) ?? []).map(onlyDigits).filter(isValidCnpj))];
  const cpfs = [...new Set((text.match(cpfRe) ?? []).map(onlyDigits).filter(isValidCpf))];
  return { cnpjs, cpfs };
}

// Primeiro CNPJ/CPF do texto que existe na carteira (CNPJs antes de CPFs).
// Ignora o documento do escritório, que aparece em cabeçalhos e rodapés.
export function matchClientDocument(text, known, officeDocument) {
  const { cnpjs, cpfs } = extractDocuments(text);
  const office = officeDocument ? onlyDigits(officeDocument) : undefined;
  for (const doc of [...cnpjs, ...cpfs]) {
    if (doc !== office && known.has(doc)) return doc;
  }
  return null;
}
