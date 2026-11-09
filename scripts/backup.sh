#!/usr/bin/env bash
# Cópia de segurança do banco da Produtiva Gestão em ~/.produtiva/backups (guarda as 20 mais novas).
#   bash scripts/backup.sh            → faz o backup (sobe o banco se estiver parado)
# Usado automaticamente antes de cada atualização e a cada vez que o sistema é iniciado.
cd "$(dirname "$0")/.."
C="docker compose -f docker-compose.local.yml"
DEST="$HOME/.produtiva/backups"
mkdir -p "$DEST"

# Só faz sentido se já existe um banco (instalação nova não tem o que salvar)
docker volume inspect produtiva-gestao_pg >/dev/null 2>&1 || { echo "ℹ️  Ainda não há banco para copiar (primeira instalação)."; exit 0; }

$C up -d postgres >/dev/null 2>&1 || { echo "⚠️  Não consegui ligar o banco para o backup."; exit 1; }
for _ in $(seq 1 40); do $C exec -T postgres pg_isready -U produtiva >/dev/null 2>&1 && break; sleep 2; done

ARQ="$DEST/produtiva-$(date +%Y-%m-%d_%H%M%S).sql.gz"
if $C exec -T postgres pg_dump -U produtiva --clean --if-exists produtiva 2>/dev/null | gzip > "$ARQ" && [ "$(gzip -dc "$ARQ" | head -c 100 | wc -c)" -gt 50 ]; then
  echo "💾 Backup do banco salvo em $ARQ"
else
  rm -f "$ARQ"; echo "⚠️  O backup do banco falhou."; exit 1
fi
# Arquivos enviados (anexos, guias, logo)
docker run --rm -v produtiva-gestao_arquivos:/d -v "$DEST":/b alpine sh -c "cd /d && tar czf /b/arquivos-$(date +%Y-%m-%d_%H%M%S).tar.gz ." >/dev/null 2>&1 \
  && echo "💾 Backup dos arquivos enviados salvo em $DEST" || true
# Mantém só os 20 mais recentes de cada tipo
ls -1t "$DEST"/produtiva-*.sql.gz 2>/dev/null | tail -n +21 | while read -r f; do rm -f "$f"; done
ls -1t "$DEST"/arquivos-*.tar.gz 2>/dev/null | tail -n +21 | while read -r f; do rm -f "$f"; done
exit 0
