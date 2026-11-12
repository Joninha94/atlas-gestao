-- Alíquota de referência da CBS ajustável por empresa na simulação IBS/CBS.
-- Valor armazenado como fração (ex.: 0.088 representa 8,8%); null usa a referência anual.
alter table public.simples_empresas
  add column if not exists aliq_cbs_referencia numeric(8, 6)
  check (aliq_cbs_referencia is null or aliq_cbs_referencia between 0 and 1);
