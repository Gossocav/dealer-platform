#!/usr/bin/env bash
#
# BANCO DI PROVA DEL LAVORO PERIODICO DI SINCRONIZZAZIONE
# =======================================================
#
# **A cosa serve, e perche' esiste.** Il passo "Riallinea lo stock" di
# `.github/workflows/sincronizza-siti.yml` e' uno script bash dentro un YAML:
# **nessun test di questo progetto puo' toccarlo**. Vitest legge TypeScript, e
# quello e' l'unico pezzo di codice che decide se lo stock dei concessionari
# resta allineato -- e che, cadendo, puo' farlo restare fermo per ore senza
# dirlo.
#
# Questo banco estrae quello script dal workflow, lo esegue contro un finto
# endpoint che sa fallire in molti modi, e verifica che si comporti come deve.
#
# **Quando si esegue.** A mano, ogni volta che si tocca quel workflow. **Non
# gira nella CI**, e la ragione e' misurata: ci mette **una trentasei minuti**,
# perche' i casi veri hanno dentro i tetti di tempo veri (180 secondi per una
# risposta che non arriva, 15 di pausa dopo ogni caduta). Accorciarli per
# farlo stare in CI vorrebbe dire provare uno script diverso da quello che
# gira in produzione -- l'oggetto adiacente, che in questo progetto ha gia'
# fatto danni.
#
#     bash scripts/prova-sincronizzazione/prova.sh
#
# **Come si ferma.** Il banco scrive il proprio PID in un file all'avvio, e
# fermarlo e' leggere quel file -- non cercarlo con un modello:
#
#     kill "$(cat /tmp/prova-sincronizzazione.pid)"
#
# ---------------------------------------------------------------------------
#
# **TRE CONTROLLI SUL BANCO STESSO**, e rispondono a tre domande diverse.
# Sono nati uno alla volta, ognuno da un errore che i precedenti non
# prendevano. Il 21/09/2026 il banco ha preso **quattro** miei errori in una
# giornata, e uno avrebbe fatto consegnare una correzione che non c'era.
#
# 1. **STO PROVANDO LA COSA GIUSTA?** Il banco estrae lo script dal workflow
#    da se'. Estraendolo a mano prima, una volta il comando e' stato ucciso e
#    le prove sono girate sulla **versione precedente**: l'impronta diceva
#    "intatto" perche' confronta il banco con se stesso, non con la sorgente.
#    Per questo il controllo 1 **non e' un'impronta, e' una riestrazione**.
#
# 2. **IL BANCO E' CAMBIATO MENTRE GIRAVA?** L'impronta copre i tre file che
#    una prova legge o esegue: lo script estratto, il finto endpoint e questo
#    file. Prima copriva solo il primo, e una modifica non applicata al finto
#    endpoint e' passata inosservata. Fuori restano i programmi di sistema
#    (bash, curl, python3): non cambiano durante una sessione e, cambiando,
#    farebbero fallire ogni prova in modo rumoroso invece che silenzioso.
#
# 3. **IL BANCO HA PRODOTTO IL CASO CHE VOLEVO PROVARE?** Ogni prova dichiara
#    **quali giri** devono cadere e verifica che siano esattamente quelli.
#    L'impronta dice che il finto endpoint non e' cambiato, non che funziona:
#    moriva dopo la prima chiusura forzata, e i risultati sembravano difetti
#    del workflow.
#
#    Dentro questo controllo stanno anche due condizioni sul finto endpoint:
#    la porta dev'essere **libera** prima di avviarlo, e lui dev'essere
#    **vivo** dopo la sonda di prontezza. Non sono un quarto controllo: sono
#    la stessa domanda -- il caso e' stato prodotto da chi doveva? -- perche'
#    un endpoint rimasto da una prova a mano risponde alla sonda come il
#    nostro, e i casi senza cadute attese uscirebbero verdi lo stesso.
#
#    **Dichiarava il numero, e non bastava.** La sonda di prontezza era una
#    POST, il finto endpoint conta ogni POST, e tutti i giri slittavano di
#    uno: il caso "cade l'ultima chiamata" faceva cadere la diciannovesima.
#    Il controllo non l'ha preso -- **una caduta attesa, una osservata** --
#    perche' guardava la quantita' e non l'identita'. Adesso confronta
#    l'elenco dei numeri di giro.
#
# **COSA I TRE NON COPRONO, ed e' una riga: nessuno verifica che l'esito sia
# LETTO bene.** I tre guardano l'oggetto provato; nessuno guarda il `grep -c`
# che conta le cadute ne' il codice di uscita da cui si ricava il colore. Se
# il banco contasse male, tutti e tre passerebbero e il risultato sarebbe
# falso. Resta scoperto di proposito -- un quarto controllo su di lui avrebbe
# bisogno di un quinto -- e sta scritto perche' l'elenco sia onesto invece
# che rassicurante.
set -u

QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RADICE="$(cd "$QUI/../.." && pwd)"
# **Il banco dichiara il proprio PID, e fermarlo e' leggere quel file.** Il
# 21/09/2026 e' stato fermato tre volte con un modello -- `pkill -f`, poi
# `for q in $(pgrep -f ...)` -- e tre volte su tre il modello ha trovato
# anche la shell che lo stava eseguendo. La regola "si guarda l'elenco prima
# di agire" era scritta, e non e' venuta in mente: il suo unico test e'
# quello, e l'ha fallito. Toglierle l'occasione funziona meglio che
# riscriverla. Chi avvia scrive qui il suo numero, chi ferma lo legge, e non
# c'e' piu' nessun insieme in cui lo strumento possa finire dentro. E' lo
# stesso movimento della riga che il giro di sincronizzazione scrive nel
# riepilogo: farlo dichiarare a chi lo produce, invece di cercarlo dopo.
PID_FILE="${TMPDIR:-/tmp}/prova-sincronizzazione.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "un banco e' gia' in corsa (PID $(cat "$PID_FILE")): prima si ferma quello, con kill \"\$(cat $PID_FILE)\""
  exit 1
fi
echo $$ > "$PID_FILE"

# La cartella di lavoro si crea **dopo** il rifiuto, non prima: nella prima
# stesura il `mkdir` stava sopra il controllo, quindi un banco rifiutato
# lasciava dietro di se' una cartella vuota che nessuna trappola avrebbe mai
# tolto -- la trappola viene installata due righe piu' sotto. Trovato
# guardando cosa era rimasto dopo aver provato il rifiuto.
LAVORO="${TMPDIR:-/tmp}/prova-sincronizzazione-$$"
mkdir -p "$LAVORO"

# I due figli -- il finto endpoint e lo script sotto prova -- si tengono per
# numero, cosi' la pulizia li ferma senza cercarli. Lo script sotto prova
# gira in secondo piano e il banco lo aspetta con `wait`: e' l'unico modo
# perche' un `kill` al banco arrivi subito, perche' bash rimanda i segnali
# finche' un comando in primo piano non finisce.
SRV=""; FIGLIO=""
pulizia() {
  [ -n "$FIGLIO" ] && kill "$FIGLIO" 2>/dev/null
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  rm -rf "$LAVORO"
  rm -f "$PID_FILE"
}
trap pulizia EXIT
trap 'exit 130' INT TERM

# --- controllo 1: si estrae adesso, dalla sorgente vera.
python3 - "$RADICE" "$LAVORO" <<'PY' || exit 1
import sys, yaml
radice, lavoro = sys.argv[1], sys.argv[2]
d = yaml.safe_load(open(f'{radice}/.github/workflows/sincronizza-siti.yml', encoding='utf8'))
s = next(p['run'] for p in d['jobs']['sincronizza']['steps'] if p['name'] == 'Riallinea lo stock')
open(f'{lavoro}/RIFERIMENTO.sh', 'w', encoding='utf8').write('#!/usr/bin/bash -e\n' + s)
print(f"estratto dal workflow: {len(s.splitlines())} righe")
PY
bash -n "$LAVORO/RIFERIMENTO.sh" || { echo "lo script estratto non e' sintatticamente valido"; exit 1; }

impronta() { cat "$LAVORO/RIFERIMENTO.sh" "$QUI/finto-endpoint.py" "$QUI/prova.sh" | md5sum | cut -c1-10; }
IMPRONTA=$(impronta)
echo "impronta del banco: $IMPRONTA"
echo

FALLITE=0

prova() {
  local NOME=$1 FALLISCI=$2 PORTA=$3 ATTESI=$4 COLORE=$5 MECCANISMO=$6 FRASE=${8:-} TETTO=${9:-}
  # **Chi avvia il finto endpoint si decide da qui, non dalla posizione.**
  # Il controllo era `[ -z "${6:-}" ]`, cioe' "il sesto parametro e' vuoto":
  # funzionava finche' il sesto era l'indirizzo. Aggiungendo la colonna del
  # meccanismo -- che non e' mai vuota -- il banco ha smesso di avviare
  # l'avversario, e **tutti** i casi sono diventati rossi con "la piattaforma
  # non rispondeva", compreso quello sano. L'ha preso il caso sano, che e' li'
  # per questo: un controllo si prova anche nel verso in cui deve restare
  # verde. Adesso la condizione ha un nome e non un numero.
  local URL_ESTERNO=${7:-}
  local URL="$URL_ESTERNO"
  [ -z "$URL" ] && URL="http://127.0.0.1:$PORTA"
  # **Per provare un caso solo mentre lo si scrive**: SOLO=<nome> bash
  # prova.sh. Senza SOLO non si salta niente, ed e' il modo in cui il banco
  # gira sempre. Serve perche' provare un ramo nuovo aspettando gli altri
  # quattordici costa trentasei minuti, e la tentazione -- gia' avuta oggi -- e'
  # fabbricarsi una copia del banco in /tmp: che non e' il banco, calcola la
  # radice da dove sta, e non prova quello che si spedisce.
  # SOLO accetta anche un elenco separato da virgole: il banco intero costa
  # trentasei minuti e le esecuzioni in secondo piano possono non sopravvivere alla
  # sessione, quindi si esegue a lotti senza fabbricarsi una copia del banco
  # da un'altra parte -- che non sarebbe il banco.
  if [ -n "${SOLO:-}" ] && [[ ",$SOLO," != *",$NOME,"* ]]; then return 0; fi

  local MIO="$LAVORO/p-$NOME.sh"
  cp "$LAVORO/RIFERIMENTO.sh" "$MIO"

  # **Il solo caso che modifica lo script invece dell'avversario.** Tutti
  # gli altri cambiano cosa risponde il finto endpoint; questo pianta un
  # comando qualunque che fallisce in mezzo al giro, perche' la cosa da
  # provare non e' una risposta ma **la trappola in uscita**: con `bash -e`
  # un comando non protetto porta giu' lo script senza passare da nessun
  # `exit`, e senza la guardia il lavoro sarebbe rosso senza dire perche'.
  #
  # Ed e' il motivo per cui basta **un** caso invece di uno per ogni comando
  # che potrebbe morire: la guardia e' una proprieta', non un elenco.
  # Tre casi piantano qualcosa nella **propria copia** dello script invece
  # di cambiare cosa risponde l'avversario, perche' quello che provano non e'
  # una risposta: e' la rete che sta sotto a tutte le risposte. L'iniezione e'
  # scelta per nome del caso, e se l'ancora sparisce il caso lo dice invece di
  # passare provando niente.
  case "$NOME" in
    guardia-del-trap|pipeline-che-muore|trappola-che-muore)
      CASO="$NOME" python3 - "$MIO" <<'INIETTA'
import io, os, sys
p = sys.argv[1]
s = io.open(p, encoding="utf8").read()
caso = os.environ["CASO"]

if caso == "trappola-che-muore":
    # Dentro la trappola, non nel corpo: prova che il guardiano non muore muto.
    ancora = "  local altri quante che_cosa"
    pezzo = "  /usr/bin/false\n" + ancora
else:
    ancora = "  riuscite=$((riuscite + 1))"
    if caso == "pipeline-che-muore":
        # Il primo comando di una pipeline muore: senza `pipefail` la
        # pipeline varrebbe zero e l'assegnazione riuscirebbe **vuota**.
        guasto = 'spazzatura=$(/usr/bin/false | sed -n 1p)'
    else:
        guasto = '/usr/bin/false'
    pezzo = ancora + '\n  if [ "$riuscite" = "2" ]; then ' + guasto + '; fi'

if ancora not in s:
    sys.exit(f"l'ancora dell'iniezione per {caso} non c'e' piu': il caso non prova piu' niente")
io.open(p, "w", encoding="utf8").write(s.replace(ancora, pezzo, 1))
INIETTA
      ;;
  esac

  # **L'impronta si prende della copia, non dell'originale.** Il confronto
  # era `$MIO` contro `RIFERIMENTO.sh`, e rispondeva a "la copia e' uguale
  # all'originale?" -- che non e' la domanda: la domanda e' **"il file che
  # sto eseguendo e' cambiato mentre giravo?"**. Le due coincidevano finche'
  # nessun caso toccava la propria copia; dal caso che pianta un comando
  # che fallisce non piu', e l'originale avrebbe dichiarato invalido
  # l'unico caso che prova la trappola. Si fissa quello che si esegue.
  local IMPRONTA_MIO; IMPRONTA_MIO=$(md5sum "$MIO" | cut -c1-10)

  # **Un caso rifiutato e' un difetto, tranne per il caso che il rifiuto lo
  # sta provando.** La decisione sta qui, in un posto solo: chi rifiuta dice
  # perche', e se il rifiuto era l'esito atteso non conta come prova non
  # valida. Senza questa distinzione il caso che prova il confronto
  # d'identita' farebbe uscire il banco rosso ogni volta, e il rosso del
  # banco smetterebbe di voler dire qualcosa.
  # Il primo parametro e' **quale** rifiuto, non il testo: un caso che
  # attende "NON_ESEGUITO:non-risponde-il-mio" deve cadere se viene respinto
  # per la porta occupata. Attendere "un rifiuto" e basta sarebbe verde per
  # il rifiuto di un altro -- l'oggetto adiacente dentro la cura
  # dell'oggetto adiacente, e le ragioni di rifiuto sono gia' due.
  non_eseguito() {
    local motivo="$1" testo="$2" atteso="${ATTESI#NON_ESEGUITO:}"
    echo "### $NOME  ->  NON ESEGUITO"
    echo "    *** $testo ***"
    if [ "$ATTESI" = "NON_ESEGUITO:$motivo" ]; then
      echo "    ...ed e' esattamente il rifiuto che questo caso attendeva ($motivo): il banco se ne accorge da solo."
    elif [ "$atteso" != "$ATTESI" ]; then
      echo "    *** MA ATTENDEVA UN ALTRO RIFIUTO: [$atteso] invece di [$motivo]. QUESTA PROVA NON VALE ***"
      FALLITE=$((FALLITE + 1))
    else
      FALLITE=$((FALLITE + 1))
    fi
    echo
  }

  SRV=""
  if [ -z "$URL_ESTERNO" ]; then
    # **La porta dev'essere libera prima di avviare il finto endpoint.** Un
    # finto endpoint rimasto da una prova a mano risponde alla sonda di
    # prontezza esattamente come quello del banco: il banco parla con lui,
    # mentre il suo muore in silenzio perche' non riesce a prendere la porta.
    # I casi che non aspettano nessuna caduta resterebbero **verdi per la
    # ragione sbagliata**, e il controllo sui giri caduti non li prenderebbe
    # perche' i giri caduti sarebbero comunque zero. Successo il 22/09/2026:
    # due finti endpoint miei erano rimasti vivi, e uno era sulla porta del
    # caso nuovo. L'ho visto guardando i processi, non da un controllo.
    if curl -s -o /dev/null --max-time 2 --connect-timeout 1 "http://127.0.0.1:$PORTA" 2>/dev/null; then
      non_eseguito "porta-occupata" "LA PORTA $PORTA E' GIA' OCCUPATA: un finto endpoint rimasto da una prova a mano?"
      return
    fi
    FALLISCI="$FALLISCI" python3 "$QUI/finto-endpoint.py" "$PORTA" >/dev/null 2>&1 & SRV=$!
    # **Si aspetta la condizione, non un tempo.** Con `sleep 1` il caso sano
    # ha perso il primo giro perche' il finto endpoint non era ancora in
    # ascolto: curl si e' preso un "connessione rifiutata" e il banco ha
    # dichiarato la prova non valida -- giustamente, ma per colpa sua.
    local i=0
    until curl -s -o /dev/null --max-time 2 --connect-timeout 1 "$URL" 2>/dev/null; do
      i=$((i + 1)); [ "$i" -ge 50 ] && break; sleep 0.2
    done
    # **"Vivo" non e' "e' il mio", e "risponde" non e' "risponde come ho
    # chiesto".** La sonda qui sopra dice soltanto che qualcuno ascolta su
    # quella porta: un finto endpoint rimasto da una prova precedente le
    # risponde benissimo, e il caso girerebbe contro di lui uscendo **verde
    # per la risposta di un altro**. E' l'oggetto adiacente, e il 22/09/2026
    # ha morso davvero: due endpoint miei erano rimasti vivi, uno sulla porta
    # del caso nuovo.
    #
    # Quindi non si chiede "c'e' qualcuno?" ma **si confronta ricevuto contro
    # chiesto**: il PID, che e' l'identita' esatta del processo che questo
    # banco ha avviato, e il modo con cui doveva partire.
    local dichiarato pid_suo modo_suo
    dichiarato=$(curl -s --max-time 2 --connect-timeout 1 "$URL" 2>/dev/null) || dichiarato=""
    pid_suo=$(printf '%s' "$dichiarato" | python3 -c "import json,sys;print(json.load(sys.stdin).get('pid',''))" 2>/dev/null) || pid_suo=""
    modo_suo=$(printf '%s' "$dichiarato" | python3 -c "import json,sys;print(json.load(sys.stdin).get('fallisci',''))" 2>/dev/null) || modo_suo=""
    if [ "$pid_suo" != "$SRV" ] || [ "$modo_suo" != "$FALLISCI" ]; then
      non_eseguito "non-risponde-il-mio" "SULLA PORTA $PORTA NON RISPONDE IL MIO: avviato il PID $SRV con il modo [$FALLISCI], ha risposto il PID [${pid_suo:-nessuno}] con il modo [${modo_suo:-nessuno}]"
      [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
      SRV=""
      return
    fi
  fi

  # **`bash -e`, non `bash`, ed e' una lettera che valeva tutto il banco.**
  # Lo script estratto ha `#!/usr/bin/bash -e` in cima, ma `bash file` IGNORA
  # lo shebang: il banco lo eseguiva senza errexit mentre GitHub lo esegue con
  # `bash -e {0}`. Tutti i commenti del passo che ragionano su "bash -e si
  # porta via lo script prima del riepilogo" non erano mai stati esercitati, e
  # una risposta 200 che in produzione fa ROSSO qui usciva VERDE. Misurato:
  # uno script con `false` in mezzo esce 0 con `bash` e 1 con `bash -e`.
  # E' l'oggetto adiacente dentro lo strumento costruito per evitarlo.
  local S; S=$(mktemp); local T0; T0=$(date +%s)
  env CRON_SECRET=x BASE_URL="$URL" GITHUB_STEP_SUMMARY="$S" GITHUB_EVENT_NAME=schedule \
      ${TETTO:+SECONDI_DI_TETTO=$TETTO} \
      bash -e "$MIO" >"$LAVORO/l-$NOME.txt" 2>&1 &
  FIGLIO=$!
  wait "$FIGLIO"; local U=$?; FIGLIO=""
  local T1; T1=$(date +%s)
  [ -n "$SRV" ] && { kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; }
  SRV=""

  # Quali giri sono caduti davvero, in ordine e separati da virgola.
  local CADUTI; CADUTI=$(grep -aoE '^::warning::Giro [0-9]+' "$LAVORO/l-$NOME.txt" | grep -oE '[0-9]+' | paste -sd, -)
  local PERSI; PERSI=$(grep -acE '^::warning::Giro' "$LAVORO/l-$NOME.txt")
  local BANCO
  if [ "$(impronta)" != "$IMPRONTA" ] || [ "$(md5sum "$MIO" | cut -c1-10)" != "$IMPRONTA_MIO" ]; then
    BANCO="*** BANCO MOSSO MENTRE GIRAVA: QUESTA PROVA NON VALE ***"; FALLITE=$((FALLITE + 1))
  elif [ "${ATTESI#NON_ESEGUITO}" != "$ATTESI" ]; then
    # Ci si arriva solo se il caso e' stato **eseguito**: chi viene respinto
    # esce prima. Un caso che attende un rifiuto e invece gira e' un difetto
    # tanto quanto il contrario -- vorrebbe dire che il banco ha smesso di
    # accorgersi di qualcosa.
    BANCO="*** ATTENDEVA UN RIFIUTO ($ATTESI) E INVECE E' STATO ESEGUITO. NON VALE ***"; FALLITE=$((FALLITE + 1))
  elif [ "$ATTESI" != "-" ] && [ "$CADUTI" != "$ATTESI" ]; then
    BANCO="*** IL BANCO NON HA PRODOTTO IL CASO: attesi i giri [$ATTESI], sono caduti [$CADUTI]. NON VALE ***"; FALLITE=$((FALLITE + 1))
  elif [ -n "$FRASE" ] && ! grep -qF -- "$FRASE" "$S"; then
    # Non e' un controllo sul banco: e' il caso che dichiara cosa deve
    # esserci scritto nel riepilogo, per le prove in cui il riepilogo e' la
    # cosa sotto esame. Senza, "il banco ha un caso apposta" vorrebbe dire
    # "gira e lo leggo a occhio".
    #
    # **Una frase attesa letterale e' la forma debole**, quella che AGENTS.md
    # chiama "un elenco scritto a mano": regge qui perche' i casi di questa
    # tabella variano lungo **una dimensione sola** -- quante chiamate
    # riescono -- quindi le frasi attese formano una serie che si controlla
    # da se' (N chiamate riuscite, N x 10 schede, N x 3 cambiate). Il giorno
    # che i casi smettessero di essere una serie, queste frasi tornerebbero a
    # essere numeri copiati a mano, e copiare a mano e' il posto dove si
    # copia l'errore che si sta cercando.
    BANCO="*** IL RIEPILOGO NON DICE QUELLO CHE DEVE: cercavo [$FRASE] ***"; FALLITE=$((FALLITE + 1))
  else
    BANCO="banco intatto, caso prodotto"
  fi
  local ESITO; [ $U -eq 0 ] && ESITO=VERDE || ESITO=ROSSO

  # **Il colore atteso, e senza questo il banco non provava niente di cio' che
  # conta.** Fino al 22/09/2026 `$U` veniva soltanto stampato: nessuno dei casi
  # confrontava il codice di uscita, che e' **l'unica cosa che GitHub guarda**.
  # I due casi nati apposta per fissare il confine della soglia -- dieci su
  # venti verde, undici rosso -- non asserivano il colore, quindi cambiare
  # `-gt` in `-ge` li avrebbe lasciati passare tutti e due. Un banco che
  # stampa il verdetto invece di pretenderlo e' una decorazione.
  if [ "$BANCO" = "banco intatto, caso prodotto" ] && [ "$ESITO" != "$COLORE" ]; then
    BANCO="*** IL COLORE E' SBAGLIATO: atteso $COLORE, uscito $ESITO (uscita $U). NON VALE ***"
    FALLITE=$((FALLITE + 1))
  fi

  # ==========================================================================
  # **CHI HA DECISO IL COLORE**, che non e' la stessa domanda del colore.
  # ==========================================================================
  #
  # Il 22/09/2026 il banco aveva quindici casi e quindici verdi, e sembrava
  # finito. Contando invece **le vie d'uscita dello script** -- ogni `exit`,
  # letto dalla sorgente e non dai casi -- ne risultavano cinque, e i quindici
  # casi ne provavano **tre**: il rifiuto 403 e il sito fermo da 24 ore non
  # li aveva mai eseguiti nessuno.
  #
  # La copertura di un banco non si conta in casi, si conta in meccanismi. Un
  # banco puo' avere cento casi che bussano tutti alla stessa porta, e cresce
  # proprio in quella direzione, perche' un caso nuovo si scrive somigliando a
  # quelli che ci sono.
  #
  # Ogni meccanismo si riconosce dal suo `::error::`, che e' l'unica cosa che
  # lo distingue da un altro con lo stesso colore -- ed e' esattamente la
  # coppia che AGENTS.md descrive: la fermata per rete e la soglia danno tutte
  # e due ROSSO, e senza questa colonna il banco verificherebbe l'esito invece
  # del meccanismo.
  local FIRMA=""
  case "$MECCANISMO" in
    FINE)          FIRMA="" ;;
    HTTP)          FIRMA="La sincronizzazione non e. riuscita \(HTTP" ;;
    403)           FIRMA="La piattaforma ha rifiutato la chiamata \(403\)" ;;
    FERMATA)       FIRMA="giri persi di fila" ;;
    SOGLIA)        FIRMA="la sincronizzazione non ha fatto quasi niente" ;;
    FERMO24H)      FIRMA="Sincronizzazione ferma da piu. di 24 ore" ;;
    NONDICHIARATA) FIRMA="Il giro e. morto senza dichiarare niente" ;;
    NONGUADAGNATO) FIRMA="senza che nessuna chiamata riuscisse" ;;
    BANCO)         FIRMA="" ;;
    *)             BANCO="*** MECCANISMO SCONOSCIUTO [$MECCANISMO]: ogni caso deve dichiarare chi decide il suo colore ***"; FALLITE=$((FALLITE + 1)) ;;
  esac

  local QUANTI_ERRORI; QUANTI_ERRORI=$(grep -acE '^::error::' "$LAVORO/l-$NOME.txt")

  if [ "$BANCO" = "banco intatto, caso prodotto" ]; then
    # **L'invariante, e vale piu' dell'elenco dei meccanismi**: un giro rosso
    # che non ha detto perche' e' un'uscita che nessuno ha dichiarato. Prende
    # i cinque `exit` di oggi e il comando non protetto che qualcuno
    # aggiungera' fra sei mesi, perche' e' una proprieta' e non una lista.
    if [ "$ESITO" = "ROSSO" ] && [ "$QUANTI_ERRORI" -eq 0 ]; then
      BANCO="*** ROSSO SENZA NESSUN ::error::: uscita non dichiarata, e la guardia nella trappola non l'ha vista ***"
      FALLITE=$((FALLITE + 1))
    elif [ "$ESITO" = "VERDE" ] && [ "$QUANTI_ERRORI" -gt 0 ]; then
      BANCO="*** VERDE CON $QUANTI_ERRORI ::error::: un errore che non colora niente e' il difetto gia' pagato il 21/09 ***"
      FALLITE=$((FALLITE + 1))
    elif [ -n "$FIRMA" ] && ! grep -aqE "^::error::.*$FIRMA" "$LAVORO/l-$NOME.txt"; then
      BANCO="*** IL COLORE L'HA DECISO UN ALTRO: atteso [$MECCANISMO], che si riconosce da [$FIRMA], e nel log non c'e' ***"
      FALLITE=$((FALLITE + 1))
    elif [ -z "$FIRMA" ] && [ "$MECCANISMO" = "FINE" ] && [ "$QUANTI_ERRORI" -gt 0 ]; then
      BANCO="*** DOVEVA ARRIVARE IN FONDO e invece ha dichiarato $QUANTI_ERRORI errori ***"
      FALLITE=$((FALLITE + 1))
    fi
  fi

  echo "### $NOME  ->  $ESITO (uscita $U)  |  deciso da: $MECCANISMO  |  $((T1-T0))s"
  echo "    $BANCO   [cadute: $PERSI]"
  grep -aE "^::error::" "$LAVORO/l-$NOME.txt" | sed 's/^/    /'
  grep -aiE "Traceback|syntax error" "$LAVORO/l-$NOME.txt" | sed 's/^/    *** GUASTO NEL BANCO: /' | head -3
  grep -aE "andata persa|sono andate perse|si e. fermato|Allineamento completo|Fermata al tetto|non sappiamo se restava|Nessuna risposta utile|schede ripassate|scheda ripassata|non e. leggibile" "$S" | sed 's/^/    riepilogo: /'
  echo
}

# ===========================================================================
#  nome | cosa fa cadere il finto endpoint | porta | quali giri DEVONO cadere |
#  colore atteso | CHI DECIDE IL COLORE | [indirizzo] | [frase che il riepilogo
#  DEVE contenere] | [tetto di tempo]
# ===========================================================================
#
# **La sesta colonna e' quella che dice se il banco copre davvero.** Le vie
# d'uscita rosse del passo sono cinque, contate dalla sorgente (`exit`) e non
# dai casi -- piu' la sesta che nessuno dichiara, il comando che sotto
# `bash -e` porta giu' lo script. I valori ammessi:
#
#   FINE          arriva in fondo: verde, e nessun `::error::`
#   HTTP          la piattaforma risponde con un codice diverso da 200
#   403           la piattaforma rifiuta la chiamata
#   FERMATA       tre cadute di fila, `fermata_per_rete`
#   SOGLIA        piu' della meta' dei giri persa
#   FERMO24H      un sito non si aggiorna da piu' di ventiquattro ore
#   NONDICHIARATA un comando qualunque muore e la trappola se ne accorge
#   NONGUADAGNATO il giro finisce verde senza nessuna chiamata riuscita
#   BANCO         il caso non esegue il passo: prova il banco stesso
#
# Fino al 22/09/2026 quindici casi su quindici erano verdi e **tre di queste
# vie non le aveva mai eseguite nessuno**: 403, FERMO24H e NONDICHIARATA. Fra
# quelle, FERMO24H e' la guardia nata dall'incidente di Autogepy -- la
# protezione costruita dopo un guasto e' quella che nessuno prova, perche' il
# caso che la giustifica sembra gia' capito.
prova  sano  ""  58501  ""  VERDE  FINE  ""  "In 20 chiamate riuscite: **200 schede ripassate**, di cui **60** cambiate davvero."
# Il 500 esce a meta' passo, molto prima del riepilogo finale: la frase
# attesa qui inchioda la trappola in uscita. Senza, un giro che si ferma
# per un difetto nostro smetterebbe di dire quanto aveva fatto, e nessuno
# se ne accorgerebbe -- e' la via d'uscita che la prima stesura saltava.
prova  difetto-500  __500__  58502  ""  ROSSO  HTTP  ""  "_Nessun giro e' riuscito: non c'e' niente da contare._"
prova  A-una-persa  5  58503  5  VERDE  FINE
prova  C-due-una-due  "3,4,6,7"  58504  "3,4,6,7"  VERDE  FINE
prova  E-cade-l-ultima  20  58505  20  VERDE  FINE
prova  F-alterne-fino-in-fondo  "2,4,6,8,10,12,14,16,18,20"  58506  "2,4,6,8,10,12,14,16,18,20"  VERDE  FINE
prova  D-dieci-confine  "1,2,4,5,7,8,10,11,13,14"  58507  "1,2,4,5,7,8,10,11,13,14"  VERDE  FINE
prova  B-undici  "1,2,4,5,7,8,10,11,13,14,16"  58508  "1,2,4,5,7,8,10,11,13,14,16"  ROSSO  SOGLIA
# I tre che si fermano da soli dopo tre cadute di fila: i giri caduti sono
# quelli, e sono scritti perche' il banco li verifichi invece di contarli.
prova  saluto-21-09  ""  0  "1,2,3"  ROSSO  FERMATA  http://10.255.255.1  "_Nessun giro e' riuscito: non c'e' niente da contare._"
prova  accetta-e-tace  __MUTO__  58510  "3,4,5"  ROSSO  FERMATA
prova  duecento-illeggibile  __NONJSON__  58511  "3,4,5"  ROSSO  FERMATA
# Il dodicesimo non prova il workflow: prova che il **riepilogo** sappia dire
# "non lo so", e che lo dica per l'intera famiglia dei non-conteggi, nominando
# ogni colpevole: una chiave che manca, un `true`, un `-1`, una stringa "3".
# Le risposte sono JSON valido, quindi nessun giro cade: se questo caso
# stampasse un numero invece di "non e' leggibile", quel numero sarebbe piu'
# basso del vero -- cioe' la correzione di updated_at sembrerebbe funzionare
# meglio di quanto funziona. Un lettore che lasciasse passare uno solo dei
# quattro cambierebbe la frase, e la frase e' verificata alla lettera.
prova  conteggi-non-leggibili  __SENZA_RISCRITTE__  58512  ""  VERDE  FINE  ""  "non e' leggibile: al giro 1 autogepy.it non dichiara riscritte; delorenzi.it non dichiara riscritte; ponginibbi.it non dichiara rilette; ponginibbi.it non dichiara riscritte, e lo stesso in altri 19 giri."
# Il tredicesimo e' il gemello del dodicesimo, con il segno girato: tutti i
# siti dichiarano, e due dichiarano zero da qualche parte (uno riletto senza
# cambiamenti, uno senza novita'). Lo zero e' un dato e si somma: 10+5+0 per
# venti giri fa 300, e la riga deve stampare il totale, non "non e'
# leggibile". Un lettore che trattasse lo zero come assente marchierebbe
# illeggibile un giro sano; uno con un ripiego a zero farebbe passare il
# dodicesimo per la ragione sbagliata. Servono tutti e due.
prova  un-sito-a-zero  __UN_SITO_A_ZERO__  58513  ""  VERDE  FINE  ""  "In 20 chiamate riuscite: **300 schede ripassate**, di cui **60** cambiate davvero."
# Il quattordicesimo prova l'unica delle quattro uscite del ciclo che
# nessun altro caso faceva scattare: l'orologio. L'endpoint risponde bene
# ma lentamente, quindi non cade nessuna chiamata e il tetto delle venti
# non viene raggiunto: a fermare il ciclo puo' essere solo il tempo.
#
# E serve a separare due condizioni che prima davano lo stesso esito: con
# "ancora=si" il ciclo finisce sia per le venti chiamate sia per il tempo,
# e prima di questo caso tutte e due annunciavano "Fermata al tetto di 20
# chiamate" -- falso al settimo tentativo. Il caso "sano" copre l'altra
# meta': stessa "ancora=si", frase diversa.
#
# La frase attesa e' quella del totale, non quella della fermata: contiene
# **3 chiamate riuscite** e **30 schede**, quindi inchioda la relazione
# 3 x 10 con un grep solo. Se il contatore dei riusciti e quello delle
# schede divergessero, il caso cadrebbe -- ed e' il motivo per cui i due
# numeri sono stati messi nella stessa riga.
prova  tetto-di-tempo  __LENTO__  58514  ""  VERDE  FINE  ""  "In 3 chiamate riuscite: **30 schede ripassate**, di cui **9** cambiate davvero."  25
# Il quindicesimo non prova il workflow: prova il banco. Il finto endpoint
# esce subito senza mettersi in ascolto, quindi sulla porta non risponde
# nessuno e il confronto "ricevuto contro chiesto" deve dichiarare la
# prova NON VALIDA. Senza questo caso, quel confronto sarebbe un controllo
# mai visto rispondere -- cioe' una decorazione: e' esattamente l'errore
# che ha lasciato passare, per due giorni, una sonda che si accontentava
# di "c'e' qualcuno".
#
# ATTESO: la quarta colonna dice "NON_ESEGUITO:<quale>" invece di elencare i
# giri caduti, e nomina **quale** rifiuto attende. Per quel rifiuto li' il
# caso conta come riuscito; per un rifiuto diverso -- per esempio la porta
# occupata -- cade, perche' sarebbe verde per il rifiuto di un altro. E' il
# solo caso della tabella il cui esito giusto e' che il banco si fermi da
# solo, e se invece girasse cadrebbe lo stesso.
prova  identita-della-sonda  __NON_PARTO__  58515  NON_ESEGUITO:non-risponde-il-mio  ROSSO  BANCO

# ---------------------------------------------------------------------------
# I tre casi che mancavano, scritti il 22/09/2026 dopo aver contato le vie
# d'uscita dalla sorgente invece che dai casi gia' esistenti.
# ---------------------------------------------------------------------------

# **Il rifiuto della piattaforma.** Esce molto piu' su di ogni contatore: non
# tocca `perse`, ne' `di_fila`, ne' la soglia. Proprio per questo nessun altro
# caso lo produce, e proprio per questo serviva il suo.
prova  rifiuto-403  __403__  58516  ""  ROSSO  403

# **Il sito fermo da piu' di ventiquattro ore.** La risposta e' buona -- 200,
# JSON valido, nessun giro caduto -- e il giro sarebbe **verde** se non ci
# fosse questa guardia: e' esattamente il caso di Autogepy, quattro giorni con
# zero schede aggiornate e il lavoro che si dichiarava riuscito. Il rosso lo
# decide `sitiDaSegnalare`, non `sitiInRitardo`.
prova  sito-fermo-24h  __FERMO24H__  58517  ""  ROSSO  FERMO24H  ""  "Siti fermi da piu' di 24 ore"

# **La trappola in uscita fa il suo mestiere.** Questo caso non cambia cosa
# risponde l'avversario: pianta un comando che fallisce in mezzo al giro (vedi
# l'iniezione in `prova`). Senza la guardia nella trappola il lavoro uscirebbe
# rosso **senza un solo `::error::`**, con un riepilogo che dice "In 2 chiamate
# riuscite: 10 schede ripassate" -- cioe' la faccia di una sincronizzazione
# parziale riuscita.
#
# **Un caso solo, e non uno per ogni comando che potrebbe morire**, perche' la
# guardia e' una proprieta' e non un elenco: prende anche il comando che
# qualcuno aggiungera' fra sei mesi.
prova  guardia-del-trap  ""  58518  ""  ROSSO  NONDICHIARATA  ""  "Questo riepilogo e' parziale"

# **La pipeline che muore a sinistra.** GitHub esegue il passo senza
# `pipefail`, quindi in `a | b` conta solo il codice di `b`: senza la riga
# `set -o pipefail` in cima al passo, questo caso uscirebbe **verde** e
# l'assegnazione avrebbe preso un valore vuoto come se fosse un dato. E' il
# buco esattamente sotto la rete: la guardia c'e' e il pesce le passa sotto.
prova  pipeline-che-muore  ""  58519  ""  ROSSO  NONDICHIARATA

# **Chi guarda il guardiano.** Qui il comando che fallisce sta **dentro la
# trappola**. Senza `set +e` in cima a `quanto_ha_fatto`, la shell esce a
# meta' del trap: si perdono l'avviso e la riga di chiusura, e si torna alla
# morte muta che la trappola esiste per impedire -- con l'aggravante che
# nessuno si aspetta di dover controllare il controllore.
#
# Il colore atteso e' **VERDE**, ed e' voluto: il lavoro era sano, a rompersi
# e' stato il resoconto. Un guasto mentre si **scrive** il rapporto non deve
# cambiare il verdetto di cio' che il rapporto racconta.
#
# E la frase attesa non e' piu' "In 20 chiamate riuscite" -- quella la prova
# gia' il caso sano -- ma **la dichiarazione del buco**: sopravvivere al
# proprio guasto non basta, perche' un rapporto a cui manca un pezzo e non lo
# dice e' un rapporto che sembra completo. Il caso prova tutte e due le cose
# insieme: il trap arriva in fondo **e** ammette cosa non ha scritto.
prova  trappola-che-muore  ""  58520  ""  VERDE  FINE  ""  "Parte di questo rapporto non e' stata scritta"

# **Un verde con zero chiamate riuscite e' un successo non guadagnato.**
# E' il gemello della guardia sull'`::error::`, sull'altro lato: quella dice
# "un rosso che non ha detto perche' e' un'uscita non dichiarata", questa dice
# "un verde che non ha fatto niente non e' un successo".
#
# Il caso si produce col tetto di tempo a zero: `SCADENZA` cade nel passato,
# `si_continua` fallisce alla prima prova e il ciclo non parte. Prima del
# 23/09/2026 il passo usciva **verde** avendo fatto niente, e l'invariante
# nuovo di zecca non lo prendeva -- copriva una direzione sola.
#
# Il caso `sano` qui sopra e' la controprova obbligatoria: senza, un
# invariante che colorasse di rosso qualunque cosa passerebbe questo e
# romperebbe tutto il resto senza che nessuno se ne accorga.
prova  successo-non-guadagnato  ""  58521  ""  ROSSO  NONGUADAGNATO  ""  "Nessun giro e' riuscito"  0

echo "FINITE TUTTE. Prove non valide: $FALLITE"
[ "$FALLITE" -eq 0 ] || exit 1
