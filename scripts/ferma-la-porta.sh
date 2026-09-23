#!/usr/bin/env bash
# Ferma chi ascolta su una porta, **per numero**.
#
# Perche' esiste, ed e' l'unico motivo: `pkill -f <modello>` trova anche la
# riga di comando che lo contiene, quindi uccide la shell che lo sta
# eseguendo -- e con lei tutto quello che veniva dopo nella stessa riga. In
# questo progetto e' successo **quattro volte**, l'ultima il 22/09/2026
# fermando `next start`. La regola contro questa famiglia e' scritta due volte
# in AGENTS.md e non e' scattata nessuna delle quattro: il verdetto e' sulla
# regola, non su chi l'ha dimenticata, e la risposta non e' una quinta
# stesura -- e' togliere l'occasione di sbagliare.
#
#   scripts/ferma-la-porta.sh 3000
#
# Stampa cosa sta per fermare prima di fermarlo, perche' un elenco guardato
# vale piu' di un filtro scritto bene.
set -euo pipefail

porta="${1:-3000}"

if ! [[ "$porta" =~ ^[0-9]+$ ]]; then
  echo "Serve un numero di porta. Esempio: scripts/ferma-la-porta.sh 3000" >&2
  exit 2
fi

pid="$(ss -lptn "sport = :$porta" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"

if [ -z "$pid" ]; then
  echo "Sulla porta $porta non ascolta nessuno."
  exit 0
fi

echo "Sulla porta $porta:"
ps -o pid=,cmd= -p "$pid" | sed 's/^/  /'
kill "$pid"

# Un `kill` che torna non vuol dire che il processo sia morto: chiede, non
# impone. Si guarda, e solo se resiste si insiste.
for _ in $(seq 1 20); do
  kill -0 "$pid" 2>/dev/null || { echo "Fermato."; exit 0; }
  sleep 0.25
done

echo "Non si e' fermato in cinque secondi: insisto."
kill -9 "$pid" 2>/dev/null || true
echo "Fermato."
