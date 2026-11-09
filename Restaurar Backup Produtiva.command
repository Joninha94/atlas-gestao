#!/bin/bash
# Dê dois cliques para voltar o sistema para um backup (os backups são feitos sozinhos a cada atualização).
cd "$(dirname "$0")"
bash restaurar.sh
echo; read -n 1 -s -r -p "Pode fechar esta janela (ou aperte qualquer tecla)."
