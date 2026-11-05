# Produtiva Gestão

Plataforma única de gestão do escritório **Produtiva Contabilidade** (Maceió/AL): monitoramento fiscal automático, comunicação com o cliente (WhatsApp + app), captura de notas, tarefas e obrigações, drive e app do cliente — tudo sobre **um cadastro de cliente**, **um banco** e **um login**.

| Peça | Tecnologia | Porta |
| --- | --- | --- |
| `apps/api` — API REST + WebSocket | NestJS 10, Prisma 7 (sem motor Rust), Postgres 16 com RLS | 3333 |
| `apps/api` — worker (mesma imagem, `dist/worker.js`) | BullMQ + Redis: Monitor, XML, comunicação, tarefas, drive | — |
| `apps/rpa` — robôs | Playwright: portais sem API (FGTS Digital, PGFN, certidões estaduais) | — |
| `apps/agent` — agente local | Node (ou `agente.exe`): entrega os XML na pasta de importação do Domínio/Alterdata | — |
| `apps/web` — painel do escritório | Next.js 14, Tailwind, Recharts | 3000 |
| `apps/mobile` — app do cliente | Expo SDK 58 / expo-router: **Android, iOS e web** com o mesmo código | 8081 (web) |
| `packages/core` — regras de negócio puras | TypeScript sem I/O, testado | — |
| `packages/db` — schema, migração, RLS, seed | Prisma 7 + `@prisma/adapter-pg` | — |

---

## 0. Jeito mais fácil: um comando (Docker Desktop)

```bash
./iniciar.sh --demo      # Mac/Linux  ·  no Windows: iniciar.bat
```

Sobe banco, filas, API, worker, painel (:3000) e app do cliente (:8081) em modo sandbox, com clientes de demonstração.
Passo a passo para quem não é desenvolvedor: **[COMECE-AQUI.md](COMECE-AQUI.md)**.

## 1. Rodar em desenvolvimento (modo sandbox)

O **modo sandbox** (`INTEGRATIONS_MODE=sandbox`) simula SERPRO Integra Contador, SEFAZ DistDFe, NFS-e Nacional, WhatsApp, e-mail, push, consulta de CNPJ e IA. O sistema inteiro funciona sem nenhuma credencial; tudo o que "sairia" para fora vai para uma caixa de saída visível em **Configurações → Sandbox**.

```bash
cp .env.example apps/api/.env.local     # preencha VAULT_MASTER_KEY (openssl rand -hex 32) e JWT_SECRET
docker compose up -d                    # Postgres 16, Redis, MinIO, LiveKit
pnpm install
pnpm --filter @produtiva/core build

# Banco: papéis (1x), migração, RLS (rodar após cada migração), seed
psql "$MIGRATION_DATABASE_URL" -f packages/db/prisma/roles.sql
pnpm --filter @produtiva/db build
pnpm --filter @produtiva/db migrate            # ou: migrate:offline deploy (sem baixar binários do Prisma)
psql "$MIGRATION_DATABASE_URL" -f packages/db/prisma/rls.sql
SEED_TENANT_CNPJ=11444777000161 SEED_ADMIN_PASSWORD='Produtiva@2026' pnpm --filter @produtiva/db seed

pnpm --filter @produtiva/api build
(cd apps/api && node dist/main.js)                  # API :3333
(cd apps/api && SCHEDULER=on node dist/worker.js)   # workers + agenda (outro terminal)
pnpm --filter @produtiva/web dev                    # painel :3000
(cd apps/mobile && npm install && npx expo start)   # app: QR Code no celular (Expo Go) ou "w" para web

# Opcional: base de demonstração com 6 clientes realistas, Monitor rodado, notas, atendimentos
(cd apps/api && node test/demo.mjs)
```

**Login do painel:** CNPJ do escritório `11444777000161`, `admin@produtiva.local`, senha do seed.
**Login do app do cliente:** CNPJ da empresa + e-mail/WhatsApp do contato → código de 6 dígitos (em sandbox o código já vem preenchido).

## 2. Produção

```bash
cp .env.example .env    # INTEGRATIONS_MODE=live, credenciais reais, senhas fortes
docker compose -f docker-compose.prod.yml up -d --build
```

Sobe Postgres, Redis (AOF), MinIO (+ criação do bucket), **migrate** (papéis + migração + RLS, roda uma vez e sai), API, worker (`SCHEDULER=on` — mantenha **uma** réplica com agenda), robôs, painel e a versão web do app. Imagens em `docker/*.Dockerfile`; o CI (`.github/workflows/ci.yml`) testa tudo contra Postgres/Redis reais e publica as imagens no GHCR a cada push na `main`.

**App nas lojas:** `cd apps/mobile && npx eas build -p android` / `-p ios` (perfis em `eas.json`; troque `EXPO_PUBLIC_API_URL` e preencha `extra.eas.projectId` em `app.json`). O app é white-label: um build por escritório (`EXPO_PUBLIC_OFFICE_CNPJ`).

### Agente local (Domínio/Alterdata)

1. No painel: **Configurações → Agente local → Novo agente**. O token aparece uma única vez.
2. No computador do sistema contábil: copie a pasta `apps/agent` (ou o `agente.exe` gerado com `npm run build:exe`), crie `agente.config.json` a partir do exemplo (URL da API, token, pasta de importação, layout de pastas) e rode `node agente.mjs --teste`.
3. Agende: `powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Minutos 15` (Agendador de Tarefas do Windows).
O painel mostra quando cada agente apareceu pela última vez e o que foi entregue; revogar o token desliga o computador na hora.

### Para ligar as integrações reais (checklist)

| Integração | O que é preciso | Onde configurar |
| --- | --- | --- |
| SERPRO Integra Contador | Contrato na Loja Serpro, consumer key/secret, e-CNPJ A1 do escritório, procuração e-CAC de cada cliente | `.env` + Configurações → Certificado |
| SEFAZ DistDFe / manifestação | Certificado A1 de cada cliente (cadastro do cliente) | Clientes → Certificado e procuração |
| NFS-e Nacional (App+) | Certificado do cliente, código de serviço e alíquota | Clientes → Aplicativo |
| WhatsApp Cloud API | App na Meta, número verificado, modelo `envio_guia` aprovado, webhook `/webhooks/whatsapp` | Comunicação → Números e URA |
| E-mail | SMTP do escritório | Configurações → Disparos |
| Push | Projeto EAS (Expo Push) | `app.json` |
| IA | `ANTHROPIC_API_KEY` | `.env` |
| Chamadas do chat interno | LiveKit (self-hosted ou cloud) | `.env` |

⚠️ **Antes de ir para produção, confira no catálogo vigente do Integra Contador os `idServico` em `apps/api/src/integrations/serpro/integra-contador.client.ts` (`SERPRO_SERVICES`)** — principalmente os de parcelamento (PARCSN/PARCMEI), que estão marcados "a confirmar".

---

## 3. Estrutura e mapa de funcionalidades

```
apps/
  api/        src/modules/{auth,clients,monitor,communication,xml,tasks,drive,files,client-app,settings}
              src/integrations/{serpro,sefaz,nfse,whatsapp,mail,storage,cnpj,ai,rpa}  ← tudo que fala com fora
              src/jobs (processadores BullMQ) · src/scheduler.service.ts · test/{e2e,demo,xmldsig}
  web/        app/{page(Painel),monitor,comunicacao,notas,tarefas,drive,clientes,configuracoes,login}
  mobile/     app/(tabs)/{index,guias,notas,documentos,mais} + chat, servicos, impostos, certificado,
              caixa-postal, nfse, relatorios, login
  rpa/        src/worker.ts (fila "rpa" → "rpa.result") · src/fgts-digital.robot.ts
  agent/      agente.mjs · instalar.ps1 (Agendador de Tarefas do Windows) · scripts/build-exe.mjs
packages/
  core/       documents, simples, dctfweb, schedule, recurrence, communication, reforma, drive, xml, cnpjws, tarefas
  db/         prisma/schema.prisma, migrations (0001–0009), roles.sql, rls.sql, seed.ts, obrigacoes.ts (catálogo), src/padroes-tarefas.ts (POPs, mensagens, quadro, fluxos)
docker/       api, web, rpa, mobile-web Dockerfiles
```

| Funcionalidade | Backend | Tela |
| --- | --- | --- |
| Painel do ecossistema (guias, tarefas, atendimentos, notas, certificados) | `GET /dashboard` | Painel |
| **Monitor** — DAS Simples, DAS-MEI, DCTFWeb (unificada/INSS/transmissão), FGTS Digital, parcelamentos (SN, MEI, PGFN, RFB) | `MonitorService.run*` · agenda por dia do mês (`core/schedule.ts`) · 1 job por cliente | Monitor |
| Monitor — envio por e-mail/WhatsApp/app com rastreio de entrega e visualização | `dispatch.service.ts` · `GET /t/:token` | Monitor → guias |
| Monitor — recálculo de guia (escritório ou o próprio cliente no app) | `MonitorService.recalc` · `POST /app/guides/:id/recalc` | Monitor / App → Guias |
| Monitor — comprovantes e baixa automática, declarações ausentes, situação fiscal, certidões, caixa postal (ciência **só** ao abrir, com registro de quem abriu) | `MonitorSyncService` | Monitor do cliente |
| Monitor — sublimite do Simples, faturamento 12 meses (PDF assinado PAdES) | `core/simples.ts` · `pdf.util.ts` | Clientes → Checkup 360 |
| **Comunicação** — WhatsApp multiatendente, URA com horário e IA que roteia (não responde o cliente), assinatura, nota interna, transferência, encerramento e pesquisa | `modules/communication` · `core/communication.ts` | Comunicação → Atendimentos |
| Comunicação — IA: reescrever, resumir, satisfação inferida | `AiGatewayService` | Comunicação |
| Comunicação — listas de transmissão (máx. 100), envio em lote de PDFs por CPF/CNPJ lido do PDF | `validateBroadcast` · `PdfTextService` · `core/documents.ts` | Comunicação → Listas / Envio em lote |
| Comunicação — chat interno com chamadas e tela compartilhada | Socket.IO `realtime.gateway.ts` + LiveKit | Comunicação → Chat interno |
| **Notas** — NF-e entrada (DistDFe), saídas por nota de referência, NFS-e prestadas/tomadas, manifestação (XMLDSig), etiquetas, Excel, exportação diária 11h (Domínio/Alterdata/ZIP) | `modules/xml` · `integrations/sefaz` · `xmldsig.ts` | Notas |
| Notas — painéis (receita, custo, frete, melhores clientes, fornecedores, produtos, concentração), reforma tributária e oportunidades | `core/xml.ts` · `core/reforma.ts` | Notas → Painel / Reforma |
| **Tarefas** — catálogo de 83 obrigações (federais, estaduais, municipais, trabalhistas, contábeis, PF e avulsas) com prazo em dia útil, N-ésimo dia útil, UF e base legal; recorrência, prazos com feriados, multa, cascata, anexo obrigatório, conclusão automática pelo Monitor, arrasta-e-solta inteligente, modelos e formulários por IA, dispensa com justificativa, edição em lote, calendário | `modules/tasks` · `core/recurrence.ts` | Tarefas |
| **Obrigações por cliente** — o padrão vem do regime/UF; o time ativa as opcionais (IPI, DIMOB, DMED, VT…) e desliga o que não se aplica; ativar já cria a tarefa do mês | `TasksService.clientObligations/setClientObligation` · `PUT /tasks/clients/:id/obligations/:templateId` | Clientes → Obrigações |
| **Tarefas → Configurar** — hub com Dados da empresa (regimes, agrupadores de clientes e de tarefas, horários de acesso, geração), recorrentes, solicitações de serviço, fluxos, templates de documentos, usuários (funcionários e do app), responsabilidades em lote, adequação de agrupadores, templates de envio, endereço customizado e auditoria do domínio (SPF/DKIM/DMARC/MX) | `task-config.controller.ts` · `task-config.service.ts` · `core/tarefas.ts` | Tarefas → Configurar |
| **POP na tarefa** — checklist copiado do modelo para o processo; marca/desmarca com autor e hora; a última etapa (e a coluna Concluído do quadro) só fecha com todos os itens marcados | `PUT /tasks/processes/:id/pop/:itemId` · `assertPopComplete` | Tarefas → Processos (detalhe) |
| **Tela da tarefa** — arquivos para entregar (colocar/tirar), POP logo abaixo, etapas marcar/desmarcar; status **Aberta → Concluída** (envia ao cliente) / **Impedimento** (motivo, avisa o escritório) / **Desconsiderada** (motivo) → **Reabrir**; histórico na própria tarefa | `TasksService.concludeProcess/setImpediment/dismiss/reopen/addFiles/removeFile` | Tarefas → Processos / Quadro (abrir tarefa) |
| **Modelos de obrigações como central** — editar qualquer modelo (o padrão vira "versão do escritório" e leva junto tarefas, ajustes por cliente e fluxos; excluir volta ao padrão), duplicar para criar outro, e no próprio modelo: POP (escolher, criar ou editar itens), aplicar o POP nas tarefas abertas, agrupador e envio ao cliente | `TasksService.saveTemplate/deleteTemplate/applyPopToOpen` · `PUT /tasks/templates/:id` | Tarefas → Modelos de obrigações |
| **Anexos da tarefa** — cada modelo define os anexos (ex.: PGDAS-D e DAS → DAS, Recibo, Extrato do Simples, Declaração), obrigatórios e/ou enviados ao cliente; na tarefa cada anexo tem o seu lugar, outros arquivos podem ser marcados como "enviar" ou "só interno", e dá para criar um anexo exigido na própria tarefa; só conclui com todos os obrigatórios | `ProcessTemplate.documents` · `Process.documents` · `ProcessFile.slotId/sendToClient` · `PUT /tasks/processes/:id/documents` | Modelos de obrigações → Anexos da tarefa · tela da tarefa |
| **Geração mensal no dia 25** — gera as tarefas que vencem no mês seguinte (dia configurável); botão "Gerar tarefas" antecipa ou gera um mês específico, sem duplicar | `TasksService.generateForMonth` · `core/recurrence.ts competencesDueInMonth` · `POST /tasks/generate` | Tarefas → Gerar tarefas · Configurar → Geração |
| **Tarefa avulsa, transferência e histórico completo** — avulsa para qualquer mês (com ou sem modelo, POP, exige anexo); transferir para outro colaborador (aviso no sino); histórico com tudo o que foi feito, envios por canal, e-mail aberto, WhatsApp entregue/lido e **download pelo cliente com nome, dia e hora** (links rastreados `/d/:token`); trazer conversa do atendimento para os comentários | `createManual/transfer/timeline/importConversation` · `delivery-tracking.controller.ts` | Tarefas → Nova tarefa · tela da tarefa |
| **Nota de envio (protocolo de entrega)** — numerada por escritório, PDF no papel timbrado com arquivos, mensagem e destinatários; arquivos vão para o Drive do cliente (pasta Entregas, visível no app); escritório vê quando o cliente abriu | `TaskConfigService.deliver` · `GET /app/deliveries/:id` | Tarefa → Notas de envio · App → Entrega |
| **Aviso de conclusão ao cliente** — todos os e-mails do contato (separados por `;`), WhatsApp com os anexos, aviso no app + push; modelos editáveis por canal; reenviar aviso | `TaskConfigService.notifyCompletion` · `GET /app/notifications` | Configurar → Templates de envio · App → sino/Avisos (banner estilo WhatsApp) |
| **Quadro (Kanban) e fluxos encadeados** — colunas do escritório; ao concluir um passo do fluxo, o próximo nasce para o responsável | `TasksService.board/moveStage/advanceFlow` | Tarefas → Quadro · Configurar → Fluxo de tarefas |
| Ordens de serviço — cliente preenche no app → processo para o responsável | `ClientAppService.submitServiceForm` | App → Solicitar serviço / Tarefas → Formulários |
| **Drive** — pasta por cliente, pastas de sistema (PGDAS/ano/mês…), compartilhar com o cliente, permissão de envio, lixeira 20 dias | `modules/drive` · `core/drive.ts` | Drive / App → Documentos |
| **Clientes** — cadastro pelo CNPJ (QSA), importação por planilha, carteira por UF/região/regime/natureza, certificado e procuração, Checkup 360 (PDF) | `modules/clients` | Clientes |
| **Consulta CNPJ** — API pública CNPJ.ws (reserva BrasilAPI, cache de 24 h): resumo, todos os campos do JSON renderizados automaticamente, JSON bruto/copiar; máscara e validação de CPF/CNPJ no padrão da Receita em todos os campos | `integrations/cnpj/cnpj.service.ts` · `core/src/cnpjws.ts` · `GET /cnpj/:cnpj` · `components/DocInput.tsx` | Consulta CNPJ · Clientes → Novo cliente |
| **App do cliente** — guias + recálculo, notas (tags, manifestação, XML), relatórios, documentos + upload, chat, OS, certidões, certificado + senha (auditado), caixa postal, **App+** NFS-e com tomadores e recorrência, push | `/app/*` (token CLIENTE preso ao `clientId`) | `apps/mobile` |
| **Agente local** — baixa as exportações diárias de XML e grava na pasta de importação do Domínio/Alterdata (token por computador, revogável, log de entrega) | `modules/system` (`/agent/*`) · `apps/agent` | Configurações → Agente local · Notas → Exportações |
| **Saúde do sistema** — job que esgota as tentativas vira alerta no painel, com reprocessar/resolver; Sentry opcional (`SENTRY_DSN`) | `common/observability.ts` · `/system/health`, `/system/failures` | Configurações → Saúde do sistema |
| Segurança — RLS por escritório, cofre de segredos (envelope AES-256-GCM), refresh token com detecção de reuso, 2FA TOTP, perfis e permissões, auditoria | `common/*` · `rls.sql` | Configurações → Usuários / Segurança |

---

## 4. Decisões que o time precisa conhecer

1. **Receita Federal pelo canal oficial** (SERPRO Integra Contador). Robôs só onde não há API, isolados atrás de `integrations/rpa/ports.ts`, seletores centralizados. **CAPTCHA não se burla**: o robô devolve `requiresManual` e vira notificação/tarefa.
2. **Isolamento entre escritórios no banco**: a API conecta como `produtiva_app` (sem BYPASSRLS) e cada operação roda numa transação com `app.tenant_id`. Workers, login e webhooks usam `produtiva_system` e entram no contexto do escritório antes de qualquer escrita. Há teste e2e provando que outro escritório não vê nada.
3. **Um job por cliente** (BullMQ, `jobId` idempotente): falha de um cliente não derruba o lote; retry por cliente.
4. **Caixa postal nunca recebe ciência automática.**
5. **WhatsApp**: Cloud API oficial por padrão; QR Code (Evolution API) existe mas pode banir o número. Fora da janela de 24 h, guias saem por modelo aprovado.
6. **Certificados e senhas** só existem decifrados em memória no processo que vai usá-los; nunca vão para a IA nem para logs.
7. **Regras fiscais em `packages/core`**, puras e testadas. Mudou uma regra? Muda lá e no teste.
8. **Prisma 7 sem motor Rust** (driver adapter `pg`): imagem menor e sem download de binários em produção. `migrate:offline` aplica as migrações só com `pg`.

---

## 5. Verificação desta entrega

Executado de verdade, contra **Postgres 16 e Redis reais**, em modo sandbox:

- `packages/core`: **19/19** testes unitários (inclui prazos em N-ésimo dia útil, POP, horário de acesso no fuso de Maceió e auditoria de domínio).
- `apps/api/test/xmldsig.test.mjs`: **2/2** (assinatura XMLDSig validada).
- `apps/agent`: **3/3** testes (inclusive proteção contra caminho malicioso dentro do ZIP).
- `apps/api/test/e2e.mjs`: **46/46** cenários ponta a ponta — login/2FA/refresh, RLS entre escritórios, cadastro por CNPJ, Monitor completo (DAS, MEI, DCTFWeb, FGTS, parcelamentos, recálculo, rastreio, comprovantes, caixa postal), WhatsApp + URA + IA, listas e lote, chat interno, notas (captura, manifestação, exportação, painéis), tarefas (geração, cascata, conclusão automática, OS), drive, app do cliente e App+, obrigações por cliente, agente local entregando XML numa pasta, alerta de job com falha, consulta CNPJ, papel timbrado, POP travando a conclusão + aviso ao cliente por e-mail/WhatsApp/app, fluxo encadeado, quadro, agrupadores, horário de acesso e domínio de e-mail.
- Pacote de produção da API (`pnpm deploy`) montado e executado: sobe, autentica e responde.
- Painel web: `next build` sem erros, todas as telas renderizadas e revisadas com dados de demonstração.
- App do cliente: TypeScript sem erros, `expo export -p web` gerado e todas as 11 telas abertas num viewport de celular contra a API real (0 erros de console/rede).
- Robôs: worker compila e conecta à fila.

**Não testado** (exige credenciais/ambiente que não existem aqui): chamadas reais a SERPRO, SEFAZ, NFS-e Nacional, Meta/WhatsApp, SMTP, Expo Push, LiveKit; build das imagens Docker (o registro de imagens estava inacessível no ambiente de construção — os passos de build foram executados fora do Docker); builds nativos Android/iOS (EAS).

## 6. Próximos passos (backlog)

- [ ] Homologação SERPRO: conferir `idServico`, rodar Monitor em 3–5 clientes reais e comparar com o e-CAC.
- [ ] Mapear no portal real os robôs FGTS Digital (guias, empregados, caixa postal), PGFN/Regularize e certidões estaduais de AL/PE/SE (o FGTS já tem esqueleto e contrato; os demais devolvem `requiresManual`).
- [ ] Gerar o `agente.exe` (`npm run build:exe` no Windows) e instalar no servidor do Domínio/Alterdata.
- [ ] Revisar o catálogo de obrigações com o time fiscal (prazos estaduais/municipais das UFs dos clientes além de AL) e repetir a revisão todo ano.
- [ ] Ligar o Sentry em produção (`SENTRY_DSN`) e, se quiser métricas de fila em Grafana, exportar OpenTelemetry.
- [ ] Publicar o app nas lojas (conta Apple/Google, ícone e textos da loja).
