#!/usr/bin/env bash
# Atualiza a Produtiva Gestão para a versão mais nova (do GitHub) SEM perder os dados.
#  - faz backup do banco e dos arquivos antes (em ~/.produtiva/backups)
#  - troca os arquivos do programa pelos da versão nova e remove os que não são mais usados
#    (o que for removido vai para ~/.produtiva/arquivos-removidos, nada é apagado de vez)
#  - religa o sistema; o banco é só migrado (nunca recriado)
# Tudo fica dentro de { } para o bash ler o script inteiro antes de os arquivos serem trocados.
{
set -euo pipefail
cd "$(dirname "$0")"
URL="https://github.com/Joninha94/atlas-gestao/archive/refs/heads/produtiva-demo.zip"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if docker info >/dev/null 2>&1; then
  echo "💾 Fazendo backup dos seus dados antes de atualizar..."
  bash scripts/backup.sh || { echo "❌ O backup falhou; atualização cancelada para não arriscar seus dados."; exit 1; }
else
  echo "❌ Abra o Docker Desktop (baleia verde) antes de atualizar — preciso dele para fazer o backup."; exit 1
fi

echo "⬇️  Baixando a versão mais nova..."
curl -fsSL "$URL" -o "$TMP/nova.zip" || { echo "❌ Não consegui baixar. Confira a internet e tente de novo."; exit 1; }
unzip -q "$TMP/nova.zip" -d "$TMP/x"
SRC=$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -1)
[ -f "$SRC/docker-compose.local.yml" ] || { echo "❌ O arquivo baixado veio incompleto. Tente de novo."; exit 1; }

echo "🔄 Trocando os arquivos do programa..."
GUARDA="$HOME/.produtiva/arquivos-removidos/$(date +%Y-%m-%d_%H%M%S)"
PROTEGE=(--exclude=.env.local-docker --exclude=.demo-carregada --exclude=diagnostico.txt --exclude=.DS_Store)
( cd "$SRC" && tar cf - "${PROTEGE[@]}" . ) | tar xf -
bash scripts/limpar.sh "$GUARDA" || true
chmod +x ./*.sh ./*.command scripts/*.sh 2>/dev/null || true

echo "✅ Arquivos atualizados. Religando com a versão nova (pode levar alguns minutos)..."
PRODUTIVA_BACKUP_FEITO=1 exec bash iniciar.sh
}
