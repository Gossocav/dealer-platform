#!/usr/bin/env bash
# Libera il disco del Codespace dalle cose che si rifanno da sole.
#
#   scripts/libera-il-disco.sh           guarda: stampa cosa toglierebbe, e non toglie niente
#   scripts/libera-il-disco.sh --togli   stampa lo stesso elenco, poi lo toglie
#
# Uscita:
#   0  fatto (guardando: elenco completo)
#   1  un percorso e' stato rifiutato: non e' stato tolto niente
#   2  fermato prima di cominciare (casa, repository, argomenti)
#   3  una parte non si e' potuta guardare (cartella illeggibile, Docker che non
#      risponde): l'elenco e' incompleto, e lo dice
#   4  qualcosa non si e' potuto togliere
#
# Perche' esiste: il 23/09/2026 il disco era al 90% e una pulizia a mano l'ha
# riportato all'85%; il 26/09 era di nuovo all'89%. Tre giorni. Il limite
# dichiarato quel giorno -- "lo script non lo facciamo" -- e' stato riaperto
# dai fatti: supabase/MIGRAZIONI.md, "Il disco del Codespace si riempie da
# solo".
#
# Cosa toglie, e solo questo:
#   1. le versioni di Claude Code da terminale tranne la piu' recente, quella a
#      cui punta il comando `claude` e ogni versione che un processo sta usando;
#      dell'estensione di VS Code solo le versioni che VS Code stesso ha
#      dichiarato obsolete, e che nessun processo sta usando;
#   2. i trascritti di sessione in ~/.claude/projects piu' vecchi di trenta
#      giorni, con la cartella della stessa sessione. Il 26/09/2026 non ce
#      n'era nessuno: qualcosa li toglie gia' -- probabilmente Claude Code, che
#      di serie tiene trenta giorni (cleanupPeriodDays), ma non spiega tutto:
#      mancavano anche due sessioni di sedici giorni prima. Questa e' la rete.
#      Mai una cartella della memoria;
#   3. le cache: npm, npx, i browser di Playwright (`npx playwright install
#      chromium` li riporta);
#   4. i volumi Docker ANONIMI che nessun contenitore usa. Sono la voce piu'
#      grossa: ogni prova su Postgres avviata senza `--rm` ne lascia uno da
#      40 MB, e il 26/09/2026 erano 150, 6,3 GB. Un volume con un nome (quello
#      del database locale di Supabase, per esempio) non si tocca mai.
#
# Cosa non tocca mai, e lo controlla da se' prima di ogni cancellazione:
# niente sotto il repository (nemmeno .next o node_modules), niente fuori
# dalla casa dell'utente, nessuna cartella della memoria (una cartella memory/
# con dentro MEMORY.md), nessun contenitore e nessuna immagine Docker. E con
# --togli, se anche un solo percorso viene rifiutato, non toglie niente: un
# rifiuto vuol dire che sul disco c'e' qualcosa di inatteso, ed e' proprio il
# momento in cui una cancellazione in blocco non deve partire.
#
# Il test e' src/lib/libera-il-disco.test.ts: una casa finta con le trappole,
# e ogni serratura provata rossa togliendola.

set -euo pipefail

ferma() {
  echo "FERMATO: $1" >&2
  exit 2
}

TOGLI=0
case "${1:-}" in
  --togli) TOGLI=1 ;;
  "" | --guarda) ;;
  *)
    echo "uso: scripts/libera-il-disco.sh [--togli]" >&2
    exit 2
    ;;
esac

# Il repository si ricava da dove sta davvero lo script, seguendo i
# collegamenti. Lanciato da standard input non si sa dove sia, e senza il
# repository manca una serratura: allora non si parte.
if [[ -z "${BASH_SOURCE[0]:-}" || ! -f "${BASH_SOURCE[0]}" ]]; then
  ferma "lo script va lanciato come file (scripts/libera-il-disco.sh), non da standard input."
fi
SCRIPT="$(readlink -f -- "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname -- "$SCRIPT")/.." && pwd -P)"
if [[ ! -e "$REPO/.git" || "$(readlink -f -- "$REPO/scripts/libera-il-disco.sh")" != "$SCRIPT" ]]; then
  ferma "non trovo il repository intorno allo script ($REPO)."
fi

# La casa si controlla dopo averla risolta: "/.", "//" e "/tmp/.." sono "/".
if [[ -z "${HOME:-}" || ! -d "${HOME:-}" ]]; then
  ferma "la casa dell'utente (\$HOME='${HOME:-}') non e' una cartella."
fi
CASA="$(readlink -f -- "$HOME")"
if [[ "$CASA" == "/" || "$CASA" == "$REPO" || "$CASA" == "$REPO"/* ]]; then
  ferma "la casa dell'utente ($CASA) non e' una cartella utilizzabile."
fi
GIORNI=30
DOCKER="${LIBERA_DOCKER:-docker}"

ERRORI="$(mktemp)"
trap 'rm -f -- "$ERRORI"' EXIT

# Cio' che non si e' potuto guardare. Non e' "niente da togliere": e' "non lo
# so", e si dice, con la sua uscita.
NON_GUARDATI=()
non_guardato() {
  NON_GUARDATI+=("$1")
}
# Dopo un `find` che ha scritto errori su $ERRORI: la cartella non si e' letta
# per intero.
controlla_lettura() {
  if [[ -s "$ERRORI" ]]; then
    non_guardato "$1: $(head -n 1 "$ERRORI")"
  fi
  : >"$ERRORI"
}

# Cosa stanno usando i processi vivi: riga di comando, eseguibile, cartella di
# lavoro, file aperti e -- per l'estensione di VS Code, che viene caricata come
# libreria -- le mappe di memoria. Ogni comando legge un elenco di /proc espanso
# dalla shell prima che il comando stesso esista, quindi non puo' leggere se
# stesso; e nessuno porta un percorso della casa nella propria riga di comando:
# altrimenti lo strumento troverebbe se stesso, e ogni versione risulterebbe
# "in uso".
prendi_in_uso() {
  {
    cat /proc/[0-9]*/cmdline 2>/dev/null | tr '\0' '\n'
    find /proc/[0-9]*/exe /proc/[0-9]*/cwd -maxdepth 0 -printf '%l\n' 2>/dev/null
    find /proc/[0-9]*/fd -mindepth 1 -maxdepth 1 -type l -printf '%l\n' 2>/dev/null
    # cat e poi awk, non awk sui file: awk si ferma al primo file che non puo'
    # aprire (le mappe dei processi di root), e il 26/09/2026 leggeva cosi'
    # 139 righe su 1.336, senza l'estensione in uso.
    cat /proc/[0-9]*/maps 2>/dev/null | awk '$6 ~ /^\// {print $6}'
  } | sort -u || true
}
IN_USO="$(prendi_in_uso)"

in_uso() {
  [[ "$IN_USO" == *"$1"* ]]
}

CANDIDATI=()
MOTIVI=()
DA_RICONTROLLARE=()
RIFIUTATI=0

rifiuta() {
  echo "RIFIUTATO ($1): $2" >&2
  RIFIUTATI=$((RIFIUTATI + 1))
}

# L'ultima serratura, uguale per tutti: qualunque regola abbia proposto un
# percorso, entra nell'elenco solo se passa di qui. Si guarda il percorso vero,
# dopo aver seguito i collegamenti.
aggiungi() {
  local percorso="$1" motivo="$2" ricontrolla="${3:-no}" vero nome
  nome="${percorso##*/}"
  if [[ -z "$percorso" || "$percorso" != /* || "$percorso" == */ || -z "$nome" || "$nome" == "." || "$nome" == ".." || "$percorso" == *$'\n'* ]]; then
    rifiuta "percorso non valido" "'$percorso'"
    return
  fi
  vero="$(readlink -f -- "$percorso" 2>/dev/null || true)"
  if [[ -z "$vero" || "$vero" == "/" || "$vero" == "$CASA" ]]; then
    rifiuta "percorso pericoloso" "$percorso"
    return
  fi
  if [[ "$vero" != "$CASA"/* ]]; then
    rifiuta "fuori dalla casa dell'utente" "$percorso -> $vero"
    return
  fi
  if [[ "$vero" == "$REPO" || "$vero" == "$REPO"/* || "$REPO" == "$vero"/* || "$percorso" == "$REPO"/* ]]; then
    rifiuta "sotto il repository" "$percorso -> $vero"
    return
  fi
  if [[ "$vero" == */memory || "$vero" == */memory/* || "$percorso" == */memory/* ]]; then
    rifiuta "cartella della memoria" "$percorso"
    return
  fi
  # La memoria si riconosce da MEMORY.md, non dal nome della cartella: il
  # pacchetto next da solo ha due cartelle "memory", e riconoscerla dal nome
  # avrebbe fermato ogni pulizia il giorno in cui next fosse finito nella cache
  # di npx.
  if [[ -d "$vero" && -n "$(find "$vero" -path '*/memory/MEMORY.md' -print -quit 2>/dev/null)" ]]; then
    rifiuta "contiene una cartella della memoria" "$percorso"
    return
  fi
  CANDIDATI+=("$percorso")
  MOTIVI+=("$motivo")
  DA_RICONTROLLARE+=("$ricontrolla")
}

# 1a. Claude Code da terminale: ~/.local/share/claude/versions/<versione>.
# Contano solo i file il cui nome e' una versione: un "latest", un download a
# meta' o qualunque altra cosa non viene ne' scelto come "piu' recente" ne'
# tolto.
VERSIONI="$CASA/.local/share/claude/versions"
if [[ -d "$VERSIONI" ]]; then
  nomi=()
  while IFS= read -r -d '' nome; do
    [[ "$nome" =~ ^[0-9]+(\.[0-9]+)+$ && -f "$VERSIONI/$nome" && ! -L "$VERSIONI/$nome" ]] && nomi+=("$nome")
  done < <(find "$VERSIONI" -mindepth 1 -maxdepth 1 -printf '%f\0' 2>"$ERRORI")
  controlla_lettura "versioni di Claude Code"
  if [[ ${#nomi[@]} -gt 0 ]]; then
    ultima="$(printf '%s\n' "${nomi[@]}" | sort -V | tail -n 1)"
    puntata="$(readlink -f -- "$CASA/.local/bin/claude" 2>/dev/null || true)"
    for nome in "${nomi[@]}"; do
      [[ "$nome" == "$ultima" ]] && continue
      percorso="$VERSIONI/$nome"
      [[ -n "$puntata" && "$(readlink -f -- "$percorso")" == "$puntata" ]] && continue
      in_uso "$percorso" && continue
      aggiungi "$percorso" "Claude Code $nome (terminale): tenuta la $ultima" si
    done
  fi
fi

# 1b. Claude Code come estensione di VS Code: solo cio' che VS Code stesso ha
# dichiarato obsoleto (lo toglierebbe lui al prossimo riavvio), e che nessun
# processo sta usando. "La versione piu' alta" qui non e' la regola giusta:
# dopo un ritorno a una versione precedente, la piu' alta e' proprio quella
# scartata. Se l'uno o l'altro file non si legge, non si toglie niente.
for base in "$CASA/.vscode-remote/extensions" "$CASA/.vscode-server/extensions"; do
  [[ -e "$base/.obsolete" ]] || continue
  if [[ ! -r "$base/.obsolete" ]] || [[ -e "$base/extensions.json" && ! -r "$base/extensions.json" ]]; then
    non_guardato "estensioni in $base: .obsolete o extensions.json non si leggono"
    continue
  fi
  dichiarate=""
  [[ -f "$base/extensions.json" ]] && dichiarate="$(cat -- "$base/extensions.json")"
  while IFS= read -r nome; do
    [[ "$nome" =~ ^anthropic\.claude-code-[0-9A-Za-z.+-]+$ ]] || continue
    percorso="$base/$nome"
    [[ -d "$percorso" && ! -L "$percorso" ]] || continue
    [[ "$dichiarate" == *"\"$nome\""* ]] && continue
    in_uso "$percorso" && continue
    aggiungi "$percorso" "estensione $nome: VS Code l'ha dichiarata obsoleta" si
  done < <(grep -oE '"anthropic\.claude-code-[^"]+"[[:space:]]*:[[:space:]]*true' "$base/.obsolete" | sed -E 's/^"([^"]+)".*/\1/' || true)
done

# 2. Trascritti di sessione oltre i trenta giorni, con la cartella gemella.
# Solo nomi da sessione (un identificativo e ".jsonl"): un file chiamato
# ".jsonl" avrebbe come gemella la cartella del progetto intera.
SESSIONE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if [[ -d "$CASA/.claude/projects" ]]; then
  while IFS= read -r -d '' trascritto; do
    nome="${trascritto##*/}"
    radice="${nome%.jsonl}"
    [[ "$radice" =~ $SESSIONE ]] || continue
    aggiungi "$trascritto" "trascritto di sessione, fermo da oltre $GIORNI giorni"
    gemella="${trascritto%.jsonl}"
    [[ -d "$gemella" && ! -L "$gemella" ]] && aggiungi "$gemella" "cartella della stessa sessione"
  done < <(find "$CASA/.claude/projects" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -mtime +"$GIORNI" -print0 2>"$ERRORI")
  controlla_lettura "trascritti di sessione"
fi

# 3. Cache che si rifanno da sole
for cache in "$CASA/.npm/_cacache" "$CASA/.npm/_npx" "$CASA/.npm/_logs" "$CASA/.cache/ms-playwright"; do
  if [[ -e "$cache" || -L "$cache" ]]; then
    aggiungi "$cache" "cache: si rifa' da sola"
  fi
done

# 4. Volumi Docker anonimi che nessun contenitore usa. Anonimo vuol dire due
# cose insieme: l'etichetta che Docker mette ai volumi anonimi, e un nome di
# 64 cifre esadecimali. Un volume con un nome non passa mai. Tre esiti che non
# si confondono: Docker non c'e' (niente da guardare), Docker non risponde
# (non guardato), Docker ha risposto.
VOLUMI=()
MISURE=()
if ! command -v "$DOCKER" >/dev/null 2>&1; then
  echo "Docker non c'e': nessun volume da guardare."
elif ! timeout 15 "$DOCKER" info >/dev/null 2>&1; then
  non_guardato "volumi Docker: Docker non risponde"
else
  if elenco="$(timeout 30 "$DOCKER" volume ls -q --filter dangling=true --filter label=com.docker.volume.anonymous 2>&1)"; then
    while IFS= read -r volume; do
      [[ "$volume" =~ ^[0-9a-f]{64}$ ]] || continue
      VOLUMI+=("$volume")
    done <<<"$elenco"
  else
    non_guardato "volumi Docker: l'elenco non si legge ($(head -n 1 <<<"$elenco"))"
  fi
  if [[ ${#VOLUMI[@]} -gt 0 ]]; then
    echo "Misuro i volumi Docker: Docker li percorre tutti, e con molti volumi ci vuole un minuto..."
    declare -A PESO=()
    while read -r nome collegamenti peso; do
      PESO["$nome"]="$peso"
    done < <(timeout 180 "$DOCKER" system df -v 2>/dev/null | awk '/^Local Volumes space usage/ {s=1; next} /^Build cache usage/ {s=0} s && NF == 3 && $1 != "VOLUME" {print $1, $2, $3}' || true)
    for volume in "${VOLUMI[@]}"; do
      MISURE+=("${PESO[$volume]:-?}")
    done
  fi
fi

spazio() {
  local riga
  riga="$(df -hP / 2>/dev/null | awk 'NR==2 {print $5 " usato, " $4 " liberi"}' || true)"
  echo "${riga:-spazio non misurato}"
}

# L'elenco, per intero, prima di qualunque cancellazione
echo "Disco adesso: $(spazio)"
echo
if [[ ${#CANDIDATI[@]} -eq 0 && ${#VOLUMI[@]} -eq 0 ]]; then
  echo "Niente da togliere."
fi
for i in "${!CANDIDATI[@]}"; do
  peso="$(du -sh -- "${CANDIDATI[$i]}" 2>/dev/null | cut -f1 || true)"
  printf '%8s  %s\n          %s\n' "${peso:-?}" "${CANDIDATI[$i]}" "${MOTIVI[$i]}"
done
if [[ ${#VOLUMI[@]} -gt 0 ]]; then
  # Un totale a cui manca una misura non e' un totale: si dice che non si sa.
  totale="$(printf '%s\n' "${MISURE[@]}" | awk '
    /^[0-9.]+TB$/ {t += $1 * 1e6; next} /^[0-9.]+GB$/ {t += $1 * 1e3; next}
    /^[0-9.]+MB$/ {t += $1; next} /^[0-9.]+kB$/ {t += $1 / 1e3; next} /^[0-9.]+B$/ {t += $1 / 1e6; next}
    {ignoti++} END {if (ignoti) printf "peso totale non noto (%d senza misura)", ignoti; else printf "%.0f MB in tutto", t}')"
  echo "Volumi Docker anonimi che nessun contenitore usa: ${#VOLUMI[@]}, $totale"
  for i in "${!VOLUMI[@]}"; do
    printf '%8s  volume %s\n' "${MISURE[$i]}" "${VOLUMI[$i]}"
  done
fi
for cosa in "${NON_GUARDATI[@]+"${NON_GUARDATI[@]}"}"; do
  echo "NON GUARDATO: $cosa" >&2
done
echo

if [[ $RIFIUTATI -gt 0 ]]; then
  echo "$RIFIUTATI percorsi rifiutati (sopra, RIFIUTATO): qualcosa sul disco non e' come previsto." >&2
  if [[ $TOGLI -eq 1 ]]; then
    echo "FERMATO: con un rifiuto non si toglie niente. Guardare i percorsi rifiutati, poi rilanciare." >&2
  fi
  exit 1
fi

if [[ $TOGLI -eq 0 ]]; then
  echo "Niente e' stato tolto. Per togliere: scripts/libera-il-disco.sh --togli"
  [[ ${#NON_GUARDATI[@]} -gt 0 ]] && exit 3
  exit 0
fi

# Fra l'elenco e la cancellazione passa anche un minuto (la misura dei volumi):
# prima di togliere una versione di Claude Code si riguarda se qualcuno ha
# cominciato a usarla. (Questa seconda occhiata non ha un test: il caso e' una
# gara fra due processi, e un test che lo riproducesse dipenderebbe dai tempi.)
IN_USO="$(prendi_in_uso)"
TOLTI=0
FALLITI=0
for i in "${!CANDIDATI[@]}"; do
  percorso="${CANDIDATI[$i]}"
  if [[ "${DA_RICONTROLLARE[$i]}" == "si" ]] && in_uso "$percorso"; then
    echo "tenuto (in uso adesso): $percorso"
    continue
  fi
  if rm -rf -- "$percorso"; then
    TOLTI=$((TOLTI + 1))
  else
    echo "NON TOLTO: $percorso" >&2
    FALLITI=$((FALLITI + 1))
  fi
done
for volume in "${VOLUMI[@]+"${VOLUMI[@]}"}"; do
  # Se nel frattempo un contenitore l'ha preso, Docker rifiuta: resta.
  if timeout 60 "$DOCKER" volume rm "$volume" >/dev/null 2>&1; then
    TOLTI=$((TOLTI + 1))
  else
    echo "NON TOLTO (in uso adesso?): volume $volume" >&2
    FALLITI=$((FALLITI + 1))
  fi
done

if [[ $TOLTI -gt 0 ]]; then
  echo "Tolto. Disco adesso: $(spazio)"
fi
if [[ $FALLITI -gt 0 ]]; then
  echo "$FALLITI cose non tolte (sopra, NON TOLTO)." >&2
  exit 4
fi
[[ ${#NON_GUARDATI[@]} -gt 0 ]] && exit 3
exit 0
