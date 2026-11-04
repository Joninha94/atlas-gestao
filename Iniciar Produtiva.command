#!/bin/bash
# Dê dois cliques para ligar a Produtiva Gestão (Mac). Na 1ª vez: botão direito → Abrir.
cd "$(dirname "$0")"
bash iniciar.sh --demo
echo; read -n 1 -s -r -p "Pode fechar esta janela (ou aperte qualquer tecla)."
