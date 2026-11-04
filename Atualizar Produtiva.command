#!/bin/bash
# Dê dois cliques para baixar a versão mais nova e religar (seus dados são mantidos).
cd "$(dirname "$0")"
bash atualizar.sh
echo; read -n 1 -s -r -p "Pode fechar esta janela (ou aperte qualquer tecla)."
