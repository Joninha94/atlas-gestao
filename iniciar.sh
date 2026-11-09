#!/usr/bin/env bash
# Sobe a Produtiva Gestão no seu computador (modo sandbox). Requer Docker Desktop aberto.
#   bash iniciar.sh            → sobe tudo
#   bash iniciar.sh --demo     → sobe tudo e carrega clientes de demonstração
set -uo pipefail
cd "$(dirname "$0")"
C="docker compose -f docker-compose.local.yml"

falhou() {
  echo; echo "❌ $1"
  echo "   Gerando diagnóstico em diagnostico.txt (mande este arquivo para o suporte/Claude)..."
  bash ./diagnostico.sh >/dev/null 2>&1 || true
  exit 1
}

command -v docker >/dev/null 2>&1 || { echo "❌ Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1; }
docker info >/dev/null 2>&1 || { echo "❌ O Docker Desktop está fechado ou iniciando. Abra o Docker Desktop, espere a baleia ficar verde e rode de novo."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ Seu Docker não tem o 'docker compose'. Atualize o Docker Desktop."; exit 1; }

# Portas que o sistema usa no seu computador
for porta in 3000 3333 8081; do
  dono=$( (lsof -nP -iTCP:$porta -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1}') || true)
  if [ -n "$dono" ] && ! docker ps --format '{{.Ports}}' | grep -q ":$porta->"; then
    echo "❌ A porta $porta já está em uso pelo programa \"$dono\". Feche-o e rode de novo."; exit 1
  fi
done

# Segredos gerados uma vez por computador e guardados também em ~/.produtiva
# (assim uma pasta nova/atualizada continua lendo os mesmos dados)
# A cópia em ~/.produtiva é a oficial: qualquer pasta (nova, atualizada ou duplicada) usa sempre as mesmas chaves,
# senão senhas salvas (e-mail, certificados) deixam de abrir e todo mundo é deslogado.
mkdir -p "$HOME/.produtiva"
if [ -f "$HOME/.produtiva/env-local-docker" ] && ! cmp -s "$HOME/.produtiva/env-local-docker" .env.local-docker 2>/dev/null; then
  cp "$HOME/.produtiva/env-local-docker" .env.local-docker
fi
if [ ! -f .env.local-docker ]; then
  rnd() { LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c "$1"; }
  printf 'JWT_SECRET=%s\nVAULT_MASTER_KEY=%s\nSEED_ADMIN_PASSWORD=Produtiva@2026\n' "$(rnd 64)" "$(rnd 64)" > .env.local-docker
  echo "🔐 Segredos locais criados"
fi
[ -f "$HOME/.produtiva/env-local-docker" ] || cp .env.local-docker "$HOME/.produtiva/env-local-docker"
chmod 600 .env.local-docker "$HOME/.produtiva/env-local-docker" 2>/dev/null || true

# Arruma a pasta: tira cópias duplicadas e sobras de versões antigas (vão para ~/.produtiva/arquivos-removidos)
bash scripts/limpar.sh || true

# Backup automático do banco antes de subir (as migrações nunca apagam dados, mas por garantia)
if [ -z "${PRODUTIVA_BACKUP_FEITO:-}" ]; then bash scripts/backup.sh || echo "⚠️  Backup não foi feito (o sistema sobe mesmo assim)."; fi

echo "🏗️  Construindo e subindo (a primeira vez leva de 5 a 15 minutos — não feche o Terminal)..."
$C up -d --build || falhou "O Docker não conseguiu construir ou subir os serviços (veja as mensagens acima)."

espera() { # $1 = url, $2 = nome, $3 = tentativas (x3 s)
  echo -n "⏳ Aguardando $2"
  for _ in $(seq 1 "$3"); do
    curl -sf -o /dev/null "$1" && { echo " ✔"; return 0; }
    if $C ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' 2>/dev/null | awk '$1=="setup" && $2=="exited" && $3!="0"{f=1} END{exit !f}'; then
      falhou "A preparação do banco falhou."
    fi
    echo -n "."; sleep 3
  done
  echo; return 1
}
espera http://localhost:3333/health "a API" 200 || falhou "A API não respondeu em 10 minutos."
espera http://localhost:3000/login "o painel" 60 || falhou "O painel (porta 3000) não respondeu."
espera http://localhost:8081/ "o app do cliente" 40 || echo "⚠️  O app do cliente (8081) ainda não respondeu; o painel já pode ser usado."

# Base de demonstração: só uma vez por computador e só se o sistema ainda estiver vazio (nunca mexe nos seus dados)
if [ "${1:-}" = "--demo" ] && [ ! -f "$HOME/.produtiva/demo-carregada" ]; then
  echo "🧪 Carregando base de demonstração (só na primeira vez)..."
  $C --profile demo run --rm demo && touch "$HOME/.produtiva/demo-carregada" || echo "⚠️  Demonstração falhou (o sistema continua funcionando)."
fi

cat <<MSG

✅ Produtiva Gestão no ar!

   Painel do escritório  →  http://localhost:3000
      CNPJ do escritório: 11444777000161
      E-mail:             admin@produtiva.local
      Senha:              Produtiva@2026   (troque em Configurações → Usuários)

   App do cliente (web)  →  http://localhost:8081

   Parar: bash parar.sh     ·     Problemas: bash diagnostico.sh
   Backups automáticos: ~/.produtiva/backups  (voltar: Restaurar Backup Produtiva.command)
MSG
command -v open >/dev/null 2>&1 && open http://localhost:3000 || true
