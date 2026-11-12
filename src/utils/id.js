// Gera um id no formato UUID v4 — mesmo formato das colunas `uuid` do
// Postgres/Supabase, então um registro criado no cliente já nasce com um id
// válido para ser gravado direto, sem round-trip pro servidor antes de poder
// referenciá-lo (ex.: cardItem precisa do id do card no mesmo clique).
export function uid() {
  return crypto.randomUUID();
}
