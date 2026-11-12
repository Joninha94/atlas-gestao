-- Tarefas e obrigações vinculadas ao cadastro compartilhado de clientes.
create table if not exists public.produtiva_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid,
  title text not null check (length(trim(title)) > 0),
  description text,
  task_type text not null default 'FISCAL'
    check (task_type in ('FISCAL', 'CONTABIL', 'PESSOAL', 'SOCIETARIO', 'OUTRA')),
  due_date date,
  priority text not null default 'NORMAL'
    check (priority in ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')),
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'CONCLUIDA', 'CANCELADA')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade
);

alter table public.produtiva_tasks enable row level security;

create policy "produtiva_tasks_owner" on public.produtiva_tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_produtiva_tasks_user_status_due
  on public.produtiva_tasks(user_id, status, due_date);
create index if not exists idx_produtiva_tasks_client_due
  on public.produtiva_tasks(client_id, due_date);
