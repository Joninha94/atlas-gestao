-- =============================================================================
-- Papéis do banco (rodar UMA vez como superusuário, antes da migração).
--   produtiva         → dono das tabelas; só para migrações.
--   produtiva_app     → API HTTP. Sem posse e sem BYPASSRLS: o RLS sempre vale.
--   produtiva_system  → workers, login e jobs que varrem todos os escritórios (BYPASSRLS).
-- Troque as senhas em produção (ou use autenticação IAM do provedor).
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'produtiva_app') THEN
    CREATE ROLE produtiva_app LOGIN PASSWORD 'produtiva_app';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'produtiva_system') THEN
    CREATE ROLE produtiva_system LOGIN PASSWORD 'produtiva_system' BYPASSRLS;
  END IF;
END $$;
