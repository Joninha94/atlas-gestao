-- O app usa "receivedDate" como campo próprio (distinto da data de
-- competência da receita) para registrar quando o dinheiro efetivamente
-- caiu na conta — visto em vários pontos da UI ("recebido em ...").
alter table public.incomes add column if not exists received_date date;
