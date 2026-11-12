-- Modelos de obrigações recorrentes e vínculo idempotente às tarefas geradas.
create table if not exists public.produtiva_task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid,
  title text not null check (length(trim(title)) > 0),
  description text,
  task_type text not null default 'FISCAL'
    check (task_type in ('FISCAL', 'CONTABIL', 'PESSOAL', 'SOCIETARIO', 'OUTRA')),
  priority text not null default 'NORMAL'
    check (priority in ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')),
  cadence text not null default 'MENSAL'
    check (cadence in ('MENSAL', 'ANUAL')),
  due_day smallint not null check (due_day between 1 and 31),
  due_month smallint check (due_month between 1 and 12),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((cadence = 'MENSAL' and due_month is null) or (cadence = 'ANUAL' and due_month is not null)),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade
);

alter table public.produtiva_task_templates enable row level security;

create policy "produtiva_task_templates_owner" on public.produtiva_task_templates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.produtiva_tasks
  add column if not exists template_id uuid,
  add column if not exists competence text;

alter table public.produtiva_tasks
  add constraint produtiva_tasks_template_owner_fk
  foreign key (template_id, user_id)
  references public.produtiva_task_templates(id, user_id);

create unique index if not exists idx_produtiva_tasks_template_competence
  on public.produtiva_tasks(template_id, competence);
create index if not exists idx_produtiva_task_templates_user_active
  on public.produtiva_task_templates(user_id, active, cadence);
