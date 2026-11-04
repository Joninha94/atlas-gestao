#!/bin/bash
# Dê dois cliques para desligar a Produtiva Gestão (os dados ficam guardados).
cd "$(dirname "$0")"
bash parar.sh
echo "Produtiva Gestão desligada."; read -n 1 -s -r -p "Pode fechar esta janela."
