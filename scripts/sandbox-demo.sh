#!/usr/bin/env bash
# Sobe a Produtiva Gestão inteira numa máquina Linux limpa (ex.: Vercel Sandbox / Amazon Linux 2023),
# em modo sandbox, com base de demonstração. Uso:
#   API_PUBLIC=https://<url-da-porta-3333> WEB_PUBLIC=https://<url-3000> APP_PUBLIC=https://<url-8081> bash scripts/sandbox-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
LOG=$ROOT/.demo-logs; mkdir -p "$LOG"
: "${API_PUBLIC:?defina API_PUBLIC}" "${WEB_PUBLIC:?defina WEB_PUBLIC}" "${APP_PUBLIC:?defina APP_PUBLIC}"
step() { echo; echo "==> $*"; }

step "Postgres e Redis"
if ! command -v pg_ctl >/dev/null && ! ls /usr/bin/postgresql-setup >/dev/null 2>&1; then
  sudo dnf install -y -q postgresql16-server postgresql16 redis6 >/dev/null
fi
if [ ! -d /var/lib/pgsql/data/base ]; then
  sudo postgresql-setup --initdb >/dev/null
  sudo sed -i 's/^\(host.*\)ident$/\1md5/; s/^\(local.*\)peer$/\1md5/' /var/lib/pgsql/data/pg_hba.conf
fi
sudo systemctl start postgresql 2>/dev/null || sudo -u postgres pg_ctl -D /var/lib/pgsql/data -l /var/lib/pgsql/pg.log start -w
(sudo systemctl start redis6 2>/dev/null || redis6-server --daemonize yes >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null)
sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='produtiva'" | grep -q 1 || sudo -u postgres psql -qc "CREATE ROLE produtiva LOGIN PASSWORD 'produtiva' CREATEDB"
sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='produtiva'" | grep -q 1 || sudo -u postgres psql -qc "CREATE DATABASE produtiva OWNER produtiva"
export PGPASSWORD=produtiva

step "Dependências"
corepack enable >/dev/null 2>&1 || sudo corepack enable
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm install --filter '@produtiva/api...' --no-frozen-lockfile --reporter=silent
pnpm --filter @produtiva/core build >/dev/null
pnpm --filter @produtiva/db build >/dev/null
pnpm --filter @produtiva/api build >/dev/null

step "Banco: papéis, migrações, RLS e catálogo"
M=postgresql://produtiva:produtiva@localhost:5432/produtiva
sudo -u postgres psql -q -d produtiva -f "$ROOT/packages/db/prisma/roles.sql"
(cd packages/db && DATABASE_URL=$M node scripts/migrate-offline.mjs deploy && psql "$M" -q -f prisma/rls.sql >/dev/null 2>&1 && \
  SYSTEM_DATABASE_URL=postgresql://produtiva_system:produtiva_system@localhost:5432/produtiva SEED_TENANT_CNPJ=11444777000161 SEED_ADMIN_PASSWORD='Produtiva@2026' pnpm seed)

cat > apps/api/.env.local <<ENV
INTEGRATIONS_MODE=sandbox
DATABASE_URL=postgresql://produtiva_app:produtiva_app@localhost:5432/produtiva
SYSTEM_DATABASE_URL=postgresql://produtiva_system:produtiva_system@localhost:5432/produtiva
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -hex 32)
VAULT_MASTER_KEY=$(openssl rand -hex 32)
PUBLIC_API_URL=$API_PUBLIC
WEB_ORIGIN=$WEB_PUBLIC,$APP_PUBLIC
STORAGE_DRIVER=local
STORAGE_DIR=$ROOT/.storage
BROADCAST_DELAY_MS=300
PORT=3333
ENV

step "API e worker"
(cd apps/api && set -a && . ./.env.local && set +a && nohup node dist/main.js > "$LOG/api.log" 2>&1 & )
(cd apps/api && set -a && . ./.env.local && set +a && SCHEDULER=on nohup node dist/worker.js > "$LOG/worker.log" 2>&1 & )
for i in $(seq 1 60); do curl -sf localhost:3333/health >/dev/null && break; sleep 2; done
curl -sf localhost:3333/health

step "Painel do escritório (Next.js)"
(cd apps/web && npm install --no-audit --no-fund --loglevel=error && NEXT_PUBLIC_API_URL=$API_PUBLIC npx next build >/dev/null && PORT=3000 nohup npx next start -p 3000 > "$LOG/web.log" 2>&1 & ) &
WEBPID=$!

step "App do cliente (Expo web)"
(cd apps/mobile && npm install --no-audit --no-fund --loglevel=error && CI=1 EXPO_PUBLIC_API_URL=$API_PUBLIC EXPO_PUBLIC_OFFICE_CNPJ=11444777000161 npx expo export -p web >/dev/null)
cat > "$LOG/spa.mjs" <<'JS'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2]; const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(8081);
JS
nohup node "$LOG/spa.mjs" "$ROOT/apps/mobile/dist" > "$LOG/app.log" 2>&1 &
wait $WEBPID
for i in $(seq 1 60); do curl -sf -o /dev/null localhost:3000/login && break; sleep 2; done

step "Base de demonstração"
(cd apps/api && API_URL=http://localhost:3333 node test/demo.mjs | tail -1)

echo; echo "PRONTO"; echo "Painel: $WEB_PUBLIC"; echo "App:    $APP_PUBLIC"
