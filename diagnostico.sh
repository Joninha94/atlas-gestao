#!/usr/bin/env bash
# Junta em diagnostico.txt tudo o que ajuda a descobrir por que o sistema não abre.
cd "$(dirname "$0")"
C="docker compose -f docker-compose.local.yml"
{
  echo "=== $(date) · $(uname -a)"
  echo "=== docker"; docker version --format '{{.Server.Version}} ({{.Server.Arch}})' 2>&1; docker compose version 2>&1
  echo "=== serviços"; $C ps -a 2>&1
  echo "=== portas"; for p in 3000 3333 8081; do echo "--- $p"; lsof -nP -iTCP:$p -sTCP:LISTEN 2>&1 | head -3; curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:$p/" 2>&1; done
  echo "=== health"; curl -s http://localhost:3333/health 2>&1; echo
  for s in setup api worker web app-web postgres; do echo "=== logs $s"; $C logs --no-color --tail 60 "$s" 2>&1; done
} > diagnostico.txt 2>&1
echo "Pronto: $(pwd)/diagnostico.txt — envie este arquivo no chat."
