#!/usr/bin/env bash
# Ricostruisce lo schema da zero applicando tutte le migration in ordine.
#
# Non usa la CLI di Supabase di proposito: quella tiene un quaderno delle
# migration applicate, e i file di giugno hanno identificativi ripetuti
# (20260627 compare sette volte) che lo fanno fallire con "chiave duplicata".
# Applicandoli uno per uno con psql quel problema non si pone.
#
# Uso:  scripts/ricostruisci-schema.sh "postgresql://..."
set -euo pipefail

CONNESSIONE="${1:?Serve la stringa di connessione al Postgres vuoto}"
CARTELLA="$(cd "$(dirname "$0")/.." && pwd)"

psql "$CONNESSIONE" -q -v ON_ERROR_STOP=1 -f "$CARTELLA/scripts/impalcatura-supabase.sql"

fallite=0
for file in $(ls "$CARTELLA"/supabase/migrations/*.sql | xargs -n1 basename | sort); do
  if ! psql "$CONNESSIONE" -q -v ON_ERROR_STOP=1 -f "$CARTELLA/supabase/migrations/$file" >/dev/null 2>"/tmp/errore-$$.log"; then
    fallite=$((fallite + 1))
    echo "MIGRATION FALLITA: $file"
    sed 's/^/    /' "/tmp/errore-$$.log" | head -3
  fi
done
rm -f "/tmp/errore-$$.log"

# Il ruolo di servizio deve avere i permessi anche sulle tabelle create dopo
# l'impalcatura: i privilegi predefiniti valgono solo per il futuro.
psql "$CONNESSIONE" -q -c "grant all on all tables in schema public to service_role" >/dev/null

if [ "$fallite" -gt 0 ]; then
  echo "Ricostruzione non riuscita: $fallite migration si sono fermate."
  exit 1
fi

echo "Ricostruzione riuscita: tutte le migration applicate."
