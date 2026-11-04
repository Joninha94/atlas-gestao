#!/bin/bash
# Dê dois cliques se algo der errado: gera o arquivo diagnostico.txt para mandar no chat.
cd "$(dirname "$0")"
bash diagnostico.sh
open -R diagnostico.txt 2>/dev/null
read -n 1 -s -r -p "Mande o arquivo diagnostico.txt no chat. Pode fechar esta janela."
