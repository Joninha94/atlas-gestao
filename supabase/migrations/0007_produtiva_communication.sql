-- Caixa de atendimento manual ligada ao cadastro central de clientes.
create table if not exists public.produtiva_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  subject text not null check (length(trim(subject)) > 0),
  channel text not null default 'MANUAL'
    check (channel in ('MANUAL', 'WHATSAPP', 'EMAIL', 'TELEFONE', 'APP')),
  status text not null default 'ABERTA'
    check (status in ('ABERTA', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_EQUIPE', 'ENCERRADA')),
  priority text not null default 'NORMAL'
    check (priority in ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (client_id, user_id)
    references public.produtiva_clients(id, user_id) on delete cascade
);

create table if not exists public.produtiva_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND', 'INTERNAL')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.produtiva_conversations(id, user_id) on delete cascade
);

alter table public.produtiva_conversations enable row level security;
alter table public.produtiva_messages enable row level security;

create policy "produtiva_conversations_owner" on public.produtiva_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "produtiva_messages_owner" on public.produtiva_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_produtiva_conversations_user_status_updated
  on public.produtiva_conversations(user_id, status, updated_at desc);
create index if not exists idx_produtiva_conversations_client
  on public.produtiva_conversations(client_id, updated_at desc);
create index if not exists idx_produtiva_messages_conversation_created
  on public.produtiva_messages(conversation_id, created_at);

create or replace function public.produtiva_touch_conversation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.produtiva_conversations
  set updated_at = new.created_at
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;

create trigger produtiva_message_touches_conversation
after insert on public.produtiva_messages
for each row execute function public.produtiva_touch_conversation();
