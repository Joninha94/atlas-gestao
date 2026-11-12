-- Atlas — schema inicial
-- Todas as tabelas são isoladas por usuário via Row Level Security (RLS):
-- cada linha só é visível/gravável pelo dono (auth.uid() = user_id).

create extension if not exists "pgcrypto";

-- ---------- banks ----------
create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  initial_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- cards ----------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  due_day int not null default 10,
  billing_start_month text not null,
  auto_expense boolean not null default false,
  auto_expense_payments jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- card_items ----------
create table if not exists public.card_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  description text not null,
  amount numeric not null,
  date date not null,
  installments int not null default 1,
  paid_installments int[] not null default '{}',
  paid_installment_banks jsonb not null default '{}'::jsonb,
  paid_installment_dates jsonb not null default '{}'::jsonb,
  paid_installment_late_fees jsonb not null default '{}'::jsonb,
  paid_installment_was_late jsonb not null default '{}'::jsonb,
  partial_payments jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- incomes ----------
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null,
  amount numeric not null,
  date date not null,
  kind text not null check (kind in ('fixa', 'variavel')),
  category text not null,
  received boolean not null default false,
  bank_id uuid references public.banks(id) on delete set null,
  partial_payments jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- expenses ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  category text not null,
  amount numeric not null,
  date date not null,
  installments int not null default 1,
  current_installment int not null default 1,
  kind text not null check (kind in ('fixa', 'parcelado')),
  frequency text check (frequency in ('mensal', 'quinzenal', 'semestral', 'anual')),
  paid_installments int[] not null default '{}',
  paid_installment_banks jsonb not null default '{}'::jsonb,
  paid_installment_dates jsonb not null default '{}'::jsonb,
  paid_installment_late_fees jsonb not null default '{}'::jsonb,
  paid_installment_was_late jsonb not null default '{}'::jsonb,
  partial_payments jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- custom_categories ----------
create table if not exists public.custom_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  group_name text not null,
  icon text not null default '🏷️',
  color text not null,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

-- ---------- user_settings ----------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  block_order text[] not null default '{}',
  hidden_blocks text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.banks enable row level security;
alter table public.cards enable row level security;
alter table public.card_items enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.custom_categories enable row level security;
alter table public.user_settings enable row level security;

create policy "banks_owner" on public.banks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cards_owner" on public.cards for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "card_items_owner" on public.card_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "incomes_owner" on public.incomes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "expenses_owner" on public.expenses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "custom_categories_owner" on public.custom_categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_settings_owner" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- indexes ----------
create index if not exists idx_card_items_card_id on public.card_items(card_id);
create index if not exists idx_card_items_user_id on public.card_items(user_id);
create index if not exists idx_incomes_user_id on public.incomes(user_id);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_custom_categories_user_id on public.custom_categories(user_id);
