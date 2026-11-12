-- Alíquota de referência do IBS ajustável por empresa, separada da CBS.
-- Valor armazenado como fração (ex.: 0.177 representa 17,7%); null usa a referência anual.
alter table public.simples_empresas
  add column if not exists aliq_ibs_referencia numeric(8, 6)
  check (aliq_ibs_referencia is null or aliq_ibs_referencia between 0 and 1);
