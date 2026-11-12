# Atlas Gestão

Plataforma web com módulos de gestão financeira, processos e área
contábil/tributária. Frontend em React + Vite; dados no Supabase (Postgres)
com login por e-mail/senha e Row Level Security: cada usuário só acessa os
próprios dados.

Depois do login, a tela inicial (`src/ModuleHome.jsx`) lista os módulos.
O último módulo aberto fica salvo no `localStorage` e reabre na próxima visita.

| # | Módulo | O que faz | Código |
|---|--------|-----------|--------|
| 01 | **Financeiro** | Receitas, despesas (parceladas/fixas), cartões, bancos, transferências, projeção dos próximos meses, relatórios. Importa Excel, OFX e fatura de cartão em PDF; exporta Excel. | `src/components/`, `src/hooks/`, `src/utils/` |
| 02 | **Processos** | Kanban: quadros, listas, cartões, etiquetas, checklists, comentários e histórico de atividade. | `src/modules/board/` |
| 03 | **Tributário** | Duas áreas: **Simples Nacional** (empresas, histórico, cálculo do DAS, importação de PGDAS-D em PDF, híbrido da reforma) e **Planejamento Tributário** (Simples × Presumido × Real, encargos, retenções, simulador e projeção da reforma). | `src/modules/simplesNacional/`, `src/modules/planejamentoFiscal/` |
| 04 | **Consulta CNPJ** | Dados públicos da Receita Federal pela API [publica.cnpj.ws](https://publica.cnpj.ws). | `src/modules/cnpjConsulta/` |
| 05 | **Produtiva** | Gestão contábil: clientes, Monitor de guias (manual), tarefas com catálogo de obrigações por regime, comunicação, NF-e por XML, Drive por cliente (lixeira de 20 dias, envio em lote de PDFs identificando o cliente pelo CNPJ/CPF) e configurações do escritório. | `src/modules/produtiva/` |

## Rodando localmente

Pré-requisitos: Node.js 18+ e acesso a um projeto Supabase com o schema aplicado.

```bash
npm install
cp .env.example .env.local   # depois preencha os valores
npm run dev                  # http://localhost:5173
```

O `.env.local` (ignorado pelo git) precisa de:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

A anon key pode ficar no frontend. Os dados ficam protegidos pelas políticas
de RLS das tabelas.

Na primeira vez, crie a conta na própria tela de login. Se a confirmação de
e-mail estiver ativa no Supabase, clique no link recebido antes de entrar.

O servidor de desenvolvimento escuta em `0.0.0.0:5173` com `strictPort`. Se a
porta estiver ocupada, ele falha em vez de trocar de porta.

## Scripts

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # build de produção em dist/
npm run preview   # serve o build em http://localhost:4173
```

Testes unitários usam o runner nativo do Node (não há script no `package.json`):

```bash
node --test src/modules/planejamentoFiscal/utils/*.test.js src/modules/produtiva/utils/*.test.js
```

## Estrutura

```
src/
  App.jsx            # AuthGate + roteamento entre módulos
  ModuleHome.jsx     # tela inicial com os módulos
  auth/              # login/cadastro e gate de sessão
  lib/               # cliente Supabase, conversão camelCase <-> snake_case
  constants/         # categorias, cores, opções fixas
  utils/             # funções puras: datas, parcelas, formatação, Excel, OFX, PDF de cartão
  hooks/             # useFinanceData / useEntitySync (CRUD + sync do Financeiro)
  styles/            # CSS global e estilos compartilhados
  components/        # módulo Financeiro
    AtlasApp.jsx     #   orquestrador: estado de UI + handlers
    layout/          #   menu lateral, blocos arrastáveis
    views/           #   Agora, Próximos meses, Cartões, Bancos, Categorias, Relatórios
    ui/              #   modais (importação OFX/PDF, recorrência...) e campos de formulário
    charts/          #   gráficos (recharts)
  modules/
    board/               # Processos (kanban)
    TributarioWorkspace.jsx
    simplesNacional/     # tabelas, CNAEs, cálculo e parser de PGDAS
    planejamentoFiscal/  # parâmetros 2026, cálculos por regime, views
    cnpjConsulta/
    produtiva/
public/
  pdf.worker.min.mjs, cmaps/, standard_fonts/   # arquivos do pdf.js para ler PDFs no navegador
  data/cnaeReductions.json                      # reduções por CNAE (reforma tributária)
supabase/migrations/  # schema versionado (tabelas + RLS)
```

## Banco de dados

As migrations em `supabase/migrations/` rodam em ordem numérica:

| Migration | Conteúdo |
|-----------|----------|
| `0001_init.sql` | Financeiro: `banks`, `cards`, `card_items`, `incomes`, `expenses`, `custom_categories`, `user_settings` |
| `0002_add_received_date.sql` | Data de recebimento das receitas |
| `0003`–`0008_produtiva_*.sql` | Produtiva: clientes, guias, tarefas e modelos recorrentes, conversas/mensagens, notas fiscais |
| `0009_produtiva_drive_settings.sql` | Produtiva: Drive (pastas, arquivos, bucket `produtiva-drive` no Storage), configurações do escritório, recorrência trimestral e prazo no mês seguinte |
| `0010_simples_cbs_reference_rate.sql` / `0011_simples_ibs_reference_rate.sql` | Simples Nacional: alíquotas de referência da CBS e do IBS por empresa (vazio = referência estimada do ano) |

Para montar um projeto novo, aplique as migrations pela Supabase CLI
(`supabase db push`), pelo SQL Editor do dashboard ou via MCP.

> **Atenção:** o código também usa tabelas que ainda **não estão** nas
> migrations: `bank_transfers`, `card_subscriptions`, `boards`, `board_lists`,
> `board_cards`, `board_labels`, `board_card_labels`, `board_checklists`,
> `board_checklist_items`, `board_comments`, `board_activity`,
> `simples_empresas`, `simples_atividades` e `simples_historico`. Elas existem
> só no projeto Supabase atual. Num projeto novo, os módulos Processos e
> Simples Nacional (e as transferências/assinaturas do Financeiro) vão falhar
> até essas tabelas serem exportadas para uma migration.

## Serviços externos

- **Supabase**: autenticação e banco.
- **publica.cnpj.ws**: consulta de CNPJ (módulo 04 e preenchimento automático
  no Tributário). É uma API pública com limite de requisições por minuto.
