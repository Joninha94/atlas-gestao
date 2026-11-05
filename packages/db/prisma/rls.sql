-- =============================================================================
-- Row-Level Security: um escritório nunca enxerga dados de outro.
-- Rodar depois de cada migração (é idempotente), como o dono das tabelas.
--
-- A API (papel produtiva_app) abre cada operação numa transação que executa
-- set_config('app.tenant_id', <id>, true) — ver apps/api/src/common/prisma.service.ts.
-- Sem tenant na sessão, as tabelas abaixo retornam ZERO linhas.
-- Tabelas-filhas sem tenantId (contatos, itens de nota, tarefas de processo, mensagens...)
-- só são alcançadas pela API através do registro-pai filtrado.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO produtiva_app, produtiva_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO produtiva_app, produtiva_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO produtiva_app, produtiva_system;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User','Department','ClientCompany','Certificate','AuditLog','MonitorSchedule',
    'FiscalGuide','Declaration','Installment','FiscalSituation','Certidao','PaymentReceipt',
    'MailboxMessage','WhatsappNumber','Conversation','Broadcast','InternalChannel',
    'FiscalDocument','ExportJob','Process','ServiceOrder','Folder',
    'RefreshToken','LoginCode','Notification','AgentDevice','JobFailure','ClientObligation',
    'TemplateSetting','TaskGroup','ClientGroup','BoardStage','TaskFlow','DocumentTemplate','ClientNotification'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;

  -- Modelos e formulários globais (tenantId nulo) são visíveis a todos, editáveis só pelo próprio escritório.
  FOREACH t IN ARRAY ARRAY['ProcessTemplate','ServiceForm','Pop','MessageTemplate']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_or_global ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_write ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_or_global ON %I FOR SELECT USING ("tenantId" IS NULL OR "tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
    EXECUTE format(
      'CREATE POLICY tenant_write ON %I FOR ALL USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;
END $$;
