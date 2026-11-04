#!/usr/bin/env bash
# Atualiza a Produtiva Gestão para a versão mais nova (do GitHub) sem perder os dados.
set -euo pipefail
cd "$(dirname "$0")"
URL="https://github.com/Joninha94/atlas-gestao/archive/refs/heads/produtiva-demo.zip"
TMP=$(mktemp -d)
echo "⬇️  Baixando a versão mais nova..."
curl -fsSL "$URL" -o "$TMP/nova.zip" || { echo "❌ Não consegui baixar. Confira a internet e tente de novo."; exit 1; }
unzip -q "$TMP/nova.zip" -d "$TMP"
SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
# Copia por cima, preservando segredos e marcadores locais
( cd "$SRC" && tar cf - --exclude=.env.local-docker --exclude=.demo-carregada . ) | tar xf -
chmod +x ./*.sh ./*.command 2>/dev/null || true
rm -rf "$TMP"
echo "✅ Arquivos atualizados. Religando com a versão nova (pode levar alguns minutos)..."
bash iniciar.sh --demo
