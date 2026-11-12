-- Perfil de cliente compartilhado pelos módulos da Produtiva.
alter table public.produtiva_clients
  add column if not exists trade_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists cnae text,
  add column if not exists notes text;
