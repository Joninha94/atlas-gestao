#!/usr/bin/env bash
# Tira da pasta do sistema o que não faz parte da versão atual (cópias duplicadas "arquivo 2", sobras de versões antigas).
# Nada é apagado de vez: vai para ~/.produtiva/arquivos-removidos/<data>.
cd "$(dirname "$0")/.."
[ -f .manifesto ] || exit 0
GUARDA="${1:-$HOME/.produtiva/arquivos-removidos/$(date +%Y-%m-%d_%H%M%S)}"
n=0
while IFS= read -r -d '' f; do
  f="${f#./}"
  case "$f" in .env.local-docker|.demo-carregada|diagnostico.txt|.DS_Store|*/.DS_Store|.manifesto) continue ;; esac
  if ! grep -qxF -- "$f" .manifesto; then
    mkdir -p "$GUARDA/$(dirname "$f")" && mv "$f" "$GUARDA/$f" && n=$((n+1))
  fi
done < <(find . -type f -not -path './.git/*' -print0)
find . -type d -empty -not -path './.git*' -delete 2>/dev/null || true
[ "$n" -gt 0 ] && echo "🧹 $n arquivo(s) que não são mais usados foram guardados em $GUARDA"
exit 0
