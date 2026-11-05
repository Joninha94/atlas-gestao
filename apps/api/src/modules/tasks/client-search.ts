/** Busca de empresa por razão social, nome fantasia ou CNPJ/CPF (com ou sem pontuação). */
export function clientSearch(q?: string) {
  const t = q?.trim();
  if (!t) return {};
  const digits = t.replace(/\D/g, '');
  return {
    OR: [
      { legalName: { contains: t, mode: 'insensitive' as const } },
      { tradeName: { contains: t, mode: 'insensitive' as const } },
      ...(digits.length >= 3 ? [{ document: { contains: digits } }] : []),
    ],
  };
}
