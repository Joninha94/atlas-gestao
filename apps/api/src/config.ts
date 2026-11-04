/** Validação de configuração na subida: falha cedo, com mensagem clara. */
export function assertSafeConfig() {
  const missing = ['DATABASE_URL', 'SYSTEM_DATABASE_URL', 'JWT_SECRET', 'VAULT_MASTER_KEY', 'PUBLIC_API_URL'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Variáveis de ambiente faltando: ${missing.join(', ')}`);
  if ((process.env.JWT_SECRET ?? '').length < 32) throw new Error('JWT_SECRET precisa de pelo menos 32 caracteres.');
  if (process.env.NODE_ENV === 'production' && process.env.INTEGRATIONS_MODE === 'sandbox') {
    throw new Error('INTEGRATIONS_MODE=sandbox não é permitido em produção.');
  }
}
