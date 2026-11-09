#!/usr/bin/env bash
# Volta o banco da Produtiva Gestão para um backup salvo em ~/.produtiva/backups.
cd "$(dirname "$0")"
C="docker compose -f docker-compose.local.yml"
DEST="$HOME/.produtiva/backups"
mapfile_compat() { ls -1t "$DEST"/produtiva-*.sql.gz 2>/dev/null; }
LISTA=$(mapfile_compat)
[ -n "$LISTA" ] || { echo "Nenhum backup encontrado em $DEST."; exit 1; }
echo "Backups disponíveis (o mais novo primeiro):"
i=0; while read -r f; do i=$((i+1)); echo "  $i) $(basename "$f")"; done <<< "$LISTA"
read -r -p "Número do backup para restaurar (Enter = cancelar): " n
[ -n "$n" ] || exit 0
ARQ=$(sed -n "${n}p" <<< "$LISTA")
[ -f "$ARQ" ] || { echo "Opção inválida."; exit 1; }
read -r -p "Isso substitui os dados atuais pelos de $(basename "$ARQ"). Confirmar? [s/N] " r
[ "$r" = "s" ] || [ "$r" = "S" ] || exit 0
bash scripts/backup.sh >/dev/null 2>&1 || true   # guarda o estado atual antes, por segurança
$C stop api worker >/dev/null 2>&1
$C up -d postgres >/dev/null 2>&1; sleep 3
gzip -dc "$ARQ" | $C exec -T postgres psql -q -U produtiva produtiva >/dev/null 2>&1 && echo "✅ Banco restaurado." || echo "⚠️  Houve avisos na restauração; confira o sistema."
$C up -d api worker >/dev/null 2>&1
echo "Sistema religado: http://localhost:3000"
