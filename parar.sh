#!/usr/bin/env bash
# Para a Produtiva Gestão. Os dados ficam guardados (volumes do Docker).
#   ./parar.sh            → para
#   ./parar.sh --apagar   → para e APAGA banco, arquivos e filas (começa do zero)
cd "$(dirname "$0")"
if [ "${1:-}" = "--apagar" ]; then
  read -r -p "Apagar TODOS os dados locais da Produtiva Gestão? [s/N] " r
  [ "$r" = "s" ] || [ "$r" = "S" ] || exit 0
  docker compose -f docker-compose.local.yml --profile demo down -v
else
  docker compose -f docker-compose.local.yml --profile demo down
fi
