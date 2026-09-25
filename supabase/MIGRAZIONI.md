# Come si applicano le migration

## Lo stato di oggi

Le migration si applicano **a mano**, dal pannello Supabase. Non c'è nessun
automatismo che le esegua, ed è una scelta: vedi più sotto perché.

Ogni lunedì (e a ogni modifica di queste cartelle) il controllo automatico
*Lo schema di produzione combacia con i file* ricostruisce da zero lo schema
dai file, chiede alla produzione il proprio inventario e li mette a confronto
riga per riga: tabelle, colonne, regole di accesso, permessi di tabella e di
colonna, vincoli, funzioni, trigger, chi può eseguire le funzioni, regole dei
magazzini dei file, indici. Se qualcosa non torna diventa **rosso** e dice
cosa, in italiano. Fino al 10/09/2026 il controllo leggeva invece il quaderno
delle migration, fermo a luglio: diceva "ne mancano 77" da sempre, e nessuno
lo leggeva più.

Il controllo **legge soltanto**. Non applica niente.

## Da dove si riprende (19/09/2026)

**Questo e' il punto di ripartenza buono.** L'ordine e' stato deciso dal
titolare il 19/09/2026 e scritto qui apposta: la prossima volta si riparte da
questo elenco, non ricostruendolo da un riepilogo.

> **Sopra tutto l'elenco, dal 20/09/2026: l'indicizzazione.** Deciso dal
> titolare dopo aver letto gli esportati di Search Console: **57 pagine
> indicizzate su 322 conosciute**, e **262 "Rilevata, ma attualmente non
> indicizzata"** -- cioe' mai scaricate. Su un marketplace senza traffico
> l'indicizzazione e' quasi l'unica strada perche' qualcuno arrivi, quindi
> viene prima dei numeri falsi a video e di tutto il resto. I fatti, i
> limiti di quello che sappiamo e cosa e' gia' stato corretto stanno in
> *"Cosa dice davvero Search Console, e cosa non dice"*, piu' sotto. Le
> quattro voci qui elencate restano nel loro ordine, sotto questa.

> **Il piu' probabile dei difetti aperti, scritto qui il 22/09/2026.** Non e'
> il piu' grave in assoluto: e' quello che il **primo cliente vero puo'
> incontrare il primo giorno**, e che nessuno vedrebbe succedere.
>
> Una concessionaria chiusa lascia la sua riga in `dealers` con l'email
> dentro. Da li' in avanti quell'indirizzo si comporta in due modi opposti a
> seconda della porta: l'**attivazione diretta** dal pannello lo rifiuta (il
> controllo cerca l'email fra le concessionarie **senza filtrare lo stato**),
> ma la **richiesta demo dal sito** lo accetta -- il suo unico controllo e'
> "non due richieste in 24 ore", e la tabella delle concessionarie non la
> guarda nessuno.
>
> Il danno arriva dopo. Premendo "Attiva demo" su quella richiesta, la
> procedura **ritrova la riga chiusa per email** e ci scrive sopra
> ricopiandone lo stato
> (`status: existingDealer.data?.status ?? "approved"`, in
> `src/app/api/admin/demo-requests/route.ts`). La concessionaria rinasce
> **chiusa**: nessun errore a schermo, il pannello dice che e' andata bene, e
> il cliente non entra mai -- viene mandato alla pagina "account sospeso".
> Chi guarda l'elenco vede una riga che sembra a posto.
>
> Il precedente non e' teorico: la stessa riga chiusa ha gia' portato **due
> volte in un'ora** nello stesso vicolo cieco il 22/09/2026, perche' per una
> concessionaria in stato `cancelled` l'elenco delle azioni del pannello e'
> vuoto (`cancelled: []` in `src/app/api/admin/dealers/route.ts`): non si
> riapre e non si cancella.
>
> **E non esiste un "cancella" reversibile.** Fotografate le chiavi esterne
> in produzione il 22/09/2026: delle **22 relazioni** che puntano a `dealers`,
> **19 sono CASCADE** -- `customers`, `leads`, `lead_activities`,
> `appointments`, `vehicles`, `vehicle_images`, `vehicle_documents`,
> `vehicle_economics`, `vehicle_sales`, `vehicle_acquisitions`,
> `vehicle_appraisals`, `email_threads`, `email_messages`,
> `email_delivery_events`, `notifications`, `promemoria`,
> `marketplace_views`, `dealer_users`, `dealer_demo_subscriptions`.
>
> **La stessa istruzione che pulisce un doppione vuoto distrugge un cliente
> pieno.** Su una riga senza niente collegato -- il caso Ferrari del
> 22/09/2026, contato tabella per tabella prima di procedere: zero ovunque --
> e' innocua. Su una concessionaria viva porta via in un colpo tutta la
> storia commerciale, **senza conferma e senza ritorno**.
>
> **E' la ragione per cui "elimina" non puo' essere un pulsante nudo.** Quando
> si separera' *blocca* da *elimina*: o l'eliminazione **rifiuta di procedere
> quando esiste anche una sola riga collegata** -- contandole tutte e 22, non
> le tre che vengono in mente -- **oppure non esiste** e resta un'operazione
> da editor SQL, fatta a mano dal titolare con le condizioni e il `returning`.
> Un pulsante che cancella diciannove tabelle a cascata non si mette in un
> pannello.
>
> **Le altre tre relazioni sono SET NULL, e lasciano residui.**
> `demo_requests.linked_dealer_id`, `audit_logs` e `profiles.dealer_id`.
> Cancellando una concessionaria, la richiesta demo che l'ha generata resta
> **orfana**: oggi non fa danno, ma e' il residuo che fra sei mesi nessuno sa
> piu' leggere. Ce n'e' gia' una, verificata il 22/09/2026 --
> `907e1f01-7073-4d27-ace9-fe6889d77ff3`, "Ferrari Automobili Srl",
> `info@keyplanrental.it`, ancora in stato `pending` con
> `linked_dealer_id` vuoto.
>
> **E quella riga adesso e' una trappola attiva, non solo un residuo.** Resta
> nell'elenco *Richieste demo* del pannello con il pulsante "Attiva demo"
> disponibile, e siccome la concessionaria non c'e' piu' non c'e' nemmeno lo
> stato chiuso da ereditare: premendolo **l'attivazione riuscirebbe** e
> nascerebbe una **quinta** concessionaria con quell'indirizzo. Va chiusa o
> cancellata a mano. (`profiles.dealer_id` a null e' invece il difetto gia'
> noto dei profili orfani.)
>
> Le due cose si correggono insieme, perche' sono la stessa: l'attivazione
> non deve **mai** ereditare uno stato di chiusura da una riga che sta
> riusando, e il pannello deve distinguere *"blocca questo account"* da
> *"elimina questo doppione"*, dando a una riga chiusa almeno una via
> d'uscita. Il caso Ferrari e' l'esempio da citare nel commento del test.

1. **I due numeri falsi ancora a video.** Sono gia' visibili oggi, e sono
   della stessa famiglia chiusa il 19/09 -- un numero plausibile al posto di
   "non lo so":
   - il **prezzo assente mostrato come "0 €"** sulla scheda del veicolo e in
     Gestione Veicoli (`formatCurrency(Number(vehicle.price ?? 0))`): un'auto
     senza prezzo dichiara zero euro;
   - il **prezzo d'acquisto scritto a zero** che il modulo del conto
     economico rilegge come **vuoto** (`vehicle-economics-card.tsx`), e a
     schermo compare "manca il prezzo di acquisto" su una vettura che il
     prezzo ce l'ha ed e' zero -- una permuta a saldo, un'auto della casa
     madre. **Si prova su una riga vera prima di correggere.**

2. **Il quarto esito del controllo dello schema.** Oggi "differenze trovate"
   copre tre stati che non si somigliano: allineato, **in attesa di essere
   applicata**, derivato davvero. Il quarto esito vale solo se **tutte** le
   differenze vanno in una direzione sola (nei file e non in produzione) e
   solo **entro una scadenza** calcolata sull'arrivo dell'ultima migration in
   `main`; oltre, diventa un guasto con un nome suo. La direzione opposta --
   in produzione e non nei file, o stessa impronta diversa -- resta sempre
   guasto pieno. Poi il cron da settimanale a giornaliero, che serve solo a
   far scattare la scadenza entro un giorno.

   **Ha dimostrato di servire il 19/09**, e non in teoria: il passo "rilancia
   il controllo" era gia' scritto nella procedura qui sotto e non e' stato
   fatto lo stesso, e il rosso e' rimasto appeso per ore su una produzione
   allineata. Il messaggio del quarto esito deve contenere **il percorso dei
   clic**: chi legge "migration in attesa" deve trovare li' cosa fare, non in
   un altro file.

3. **Il blocco unico su usabilita' e trattini**, che non si fa a pezzi.
   Dentro il blocco, **i 19 trattini muti nelle email vengono per primi**:
   sono righe che partono verso persone vere, e un *"Scadenza: -"* in
   un'email a una concessionaria e' una riga che non doveva partire. Le
   misure di tutto il blocco stanno in AGENTS.md, sotto *"Il blocco unico
   sull'usabilita', e quanto e' grande"*.

4. **"Contatta la concessionaria".** Non e' grafica, e' **mancanza di
   prodotto**: oggi si puo' scrivere solo a proposito di un'auto, e chi apre
   la pagina di una concessionaria non ha modo di contattarla. Telefono e
   WhatsApp in evidenza, piu' un modulo senza veicolo. Da verificare prima di
   costruirlo: un contatto senza `vehicle_id` passa, o il trigger lo rifiuta?

### La fotografia delle Statistiche di scansione al 20/09/2026

**Perche' sta qui e non in un riepilogo.** E' la misura del *prima*, e le
Statistiche di scansione sono una finestra che scorre: il 24 questi numeri
saranno altri e **non si potranno piu' rileggere**. E' la regola del righello
che si consuma, applicata al posto giusto -- una misura che verra' citata la
settimana prossima si scrive dove vive il progetto, non dove vive la sessione.

Proprieta' **www.keyauto.it**, ultimo aggiornamento **20/09/2026**, cioe'
**prima** delle correzioni del 21 (i pacchetti `?_rsc=` fuori dalla scansione)
e prima della PR #365.

| | |
|---|---|
| **Richieste totali** | 3,67 K · 53,9 MB · tempo medio di risposta **261 ms** · stato host **verde** |
| **Per risposta** | OK (200) **100%** · Non trovata (404) <1% · Spostato (301) <1% · Altro errore client (4XX) <1% · **nessuna riga 5xx** |
| **Per tipo di file** | Altro tipo di file **76%** · JavaScript 9% · Immagine 8% · HTML **6%** · CSS 2% |
| **Per finalita'** | Aggiornamento **97%** · Rilevamento **3%** |
| **Per tipo di Googlebot** | Computer **80%** · Carico risorse 7% · Immagine 7% · Altro agente 3% · **Smartphone 3%** |

L'altra proprieta', `keyauto.it` senza `www`, ha 25 richieste e 0 byte: e'
soltanto il rimbalzo verso il `www` e non va guardata.

**Cosa dice questa fotografia, e cosa no.**

1. **I 5xx non esistono, e una preoccupazione va ritirata.** Si era
   ipotizzato che i 500 sugli identificativi malformati stessero consumando
   budget di scansione. **Non e' cosi': Googlebot non ci arriva.** Le due
   misure convergono da lati indipendenti -- il riquadro "Per risposta" non ha
   nessuna riga 5xx, e dal nostro lato il sito non produce nessun collegamento
   malformato (26 collegamenti a schede controllati) e la mappa nemmeno (290
   indirizzi). La PR #365 resta giusta, ma **cambia natura**: non e' un lavoro
   di indicizzazione, e' una cortesia verso le persone vere che aprono un link
   condiviso male. Nessuna urgenza, e **nessun effetto sulla misura del 24**.
2. **"Aggiornamento 97%, Rilevamento 3%"** e' il fianco su cui gia' si stava
   lavorando, visto da un'altra angolazione: quasi tutto il tempo va a
   ripassare cose gia' note, quasi niente a scoprirne di nuove. E' coerente
   con le 262 "Rilevata, ma attualmente non indicizzata".
3. **"Altro tipo di file 76%" contro "HTML 6%"** e' la stessa cosa contata per
   file invece che per scopo, e da' la misura di quanto poco di quel traffico
   fosse pagine.

**Da guardare dopo il 24/09, non prima:** **Googlebot Smartphone al 3%**
contro l'**80%** da computer. Google indicizza *mobile-first*, quindi quella
proporzione e' anomala e potrebbe spiegare piu' di quanto sembri. **Non si
apre adesso**, perche' toccherebbe il fronte che resta fermo fino alla
lettura del 24: annotata qui con la sua misura accanto, che e' la sola cosa
che serve per riprenderla.

**Quale rotta pubblica cade sulla spazzatura, misurato il 22/09/2026.** Serve
a chi aggiungera' la prossima: la prova da fare e' questa, e la risposta
attesa e' 200.

| rotta | con un identificativo storto |
|---|---|
| `/auto/[id]` | **500** -- l'unica che cadeva (corretta, PR #365) |
| `/concessionarie/[slug]` | 200 |
| `/perizie/[id]` | 200 |
| `/og/veicolo/[id]` | 200 |
| `/og/concessionaria/[slug]` | 200 |

La differenza non e' la cura di chi le ha scritte: e' il **tipo della
colonna**. Uno slug si confronta con del testo e un testo qualsiasi non fa
male a nessuno; un identificativo si confronta con un `uuid`, e Postgres
rifiuta cio' che non lo e' con un **errore**, non con "nessuna riga". Ogni
rotta pubblica nuova che cerchi per `uuid` -- o per un altro tipo stretto:
`date`, `numeric`, un enumerato -- nasce con lo stesso difetto se non
controlla la forma **prima** di interrogare.

E le quattro forme che ci arrivano non sono spazzatura scritta apposta:
`/auto/<id>.` (il link incollato a fine frase), `<id>` troncato da un'email,
`<id>%20`. Il sito non ne produce nessuna -- controllati i 26 collegamenti a
schede e i 290 indirizzi della mappa -- quindi **arrivano tutte da fuori**, e
nessuna quantita' di ordine interno le fa sparire.

### Il banco: otto rilievi aperti, e cinque chiusi da soli (23/09/2026)

Stessa rilettura ostile, stesso metodo: giudicati contro il codice di oggi.
Venticinque rilievi, ma i difetti distinti sono tredici -- le lenti diverse
segnalavano spesso la stessa cosa.

**Cinque si sono chiusi lavorando**, e vale la pena sapere quali perche' erano
i piu' gravi: il banco eseguiva `bash` invece di `bash -e` (tre revisori su
venticinque, l'unico "blocca l'unione" vero); non confrontava **mai** il
codice di uscita con un atteso (altri tre); un rifiuto inatteso ora dice
perche'; e il finto endpoint sa finalmente dire *"ho finito"* -- ma **per
caso**, attraverso un modo aggiunto per un'altra ragione, non per disegno.

Gli otto aperti:

1. **`SOLO` con un refuso non esegue niente e il banco esce verde** dicendo
   "FINITE TUTTE. Prove non valide: 0". **E' peggiorato oggi per mano mia**:
   avendo esteso `SOLO` a un elenco separato da virgole, un nome sbagliato in
   mezzo a cinque fa saltare quel caso **mentre gli altri girano**, quindi il
   risultato sembra a posto. La cura e' della famiglia gia' nota: un `SOLO`
   che non trova nessun caso deve dirlo e uscire rosso.
2. **L'impronta non copre il file da cui il banco estrae lo script.** Copre i
   tre file del banco, non `.github/workflows/sincronizza-siti.yml`: una
   modifica al workflow **durante** una corsa non sposta l'impronta, perche'
   l'estrazione avviene una volta sola all'inizio.
3. **Il comando documentato per fermare il banco punta a `/tmp` fisso**, il
   codice scrive il PID in `${TMPDIR:-/tmp}`. Oggi funziona perche' `TMPDIR`
   non e' impostata: e' la via d'uscita che punta al posto sbagliato, e
   funziona per caso.
4. **`tetto-di-tempo` fissa una frase che dipende dall'orologio** (tre
   chiamate riuscite con un tetto di due secondi). Ha sempre passato, ma su
   una macchina carica direbbe un altro numero.
5. **`saluto-21-09` porta il nome dell'incidente e non inchioda
   `ATTESA_CONNESSIONE`**: togliendo `--connect-timeout` il caso resterebbe
   verde, cioe' il nome promette una protezione che il caso non verifica.
6. **Il confronto d'identita' della sonda ha due condizioni in OR** -- PID
   diverso, modo diverso -- e un caso solo, che ne esercita una. E' la stessa
   regola dei due meccanismi che decidono lo stesso esito.
7. **Il commento sulla serie dichiara piu' di quello che la tabella
   consegna**: dice che i casi variano lungo una dimensione sola, e non e'
   vero per tutti.
8. **La pulizia cancella la cartella di lavoro anche dopo una corsa rossa**,
   quindi i log per caso spariscono proprio quando servirebbero. E' il gradino
   sbagliato, gia' scritto in AGENTS.md: un esito che verra' riletto non vive
   dove si cancella.

### I documenti: diciassette rilievi, tutti chiusi (23/09/2026)

Cinque erano lo stesso: il paragrafo *"un numero dentro una serie si controlla
da se'"* descriveva un banco che non esisteva, con numeri invecchiati in due
ore. **Chiuso togliendo le cifre**, con scritto perche': le regole stanno in
AGENTS.md, le misure con la data stanno qui.

Gli altri, corretti oggi perche' stavano nei testi che si stanno spedendo --
un rimando rotto o un numero sbagliato non si consegnano sapendolo:

- **la sonda consigliata al posto del `sleep 1` faceva una POST vera**, cioe'
  una sincronizzazione, per sapere se il server era in ascolto. Il banco usa
  la forma senza verbo; adesso anche il documento;
- **la durata del banco era dichiarata con tre numeri diversi** -- "mezz'ora",
  "trenta minuti", "venticinque minuti" -- e **nessuno era quello vero**.
  Misurata sui cinque lotti del 23/09/2026: **trentasei minuti** per ventuno
  casi. Ora e' quello, in tutti e sette i posti;
- **il banco si attribuiva un difetto che non ha trovato** (la fermata per
  rete): l'aveva trovato una rilettura ostile, dopo le prove verdi;
- **una riga di esempio citata a occhio** metteva il grassetto dove il codice
  non lo mette;
- **un rimando incrociato non si trovava**, perche' citava un titolo a
  memoria;
- **mancava una riga vuota** prima di un titolo, e il titolo non si vedeva.

Due note d'igiene si sono chiuse da sole: i sei file di scarto lasciati in
radice da una sessione precedente non ci sono piu', e la cartella del banco
smette di essere non tracciata con questa unione.

### Il riepilogo della sincronizzazione: undici rilievi aperti (23/09/2026)

Da una rilettura ostile a piu' revisori, giudicati uno per uno **contro il
codice di oggi** e non contro quello di quando furono scritti. **Non corretti
di proposito**: sono tutti sulla prosa che una persona legge, non sul
comportamento -- l'unica eccezione e' il primo -- e ogni ritocco al riepilogo
obbliga a rifare il giro del banco, che sono trentasei minuti. Si chiudono
insieme, quando si tocchera' quel passo per un altro motivo.

Due dei quattordici si sono chiusi da soli, e vale la pena sapere perche':
*"zero schede con il verde a tutti i siti irraggiungibili"* non e' piu' vero
(ora con zero giri riusciti la riga dice *"Nessun giro e' riuscito"*, e tre
cadute di fila colorano di rosso), e *"verde con zero chiamate"* e' chiuso
dall'invariante gemello.

**1. La pausa sparisce nel terzo stato, ed e' l'unico che tocca il
comportamento.** `[ "$ancora" = "si" ] && sleep 5`: nello stato `non_so` il
ciclo continua ma la pausa fra una chiamata e l'altra **non c'e'**, e il passo
spara le venti chiamate di seguito. E' il terzo stato appiattito sul "no",
dentro la riga che il terzo stato lo aveva appena introdotto.

> **Un sospetto da guardare per primo, e non una causa dimostrata.** Le cadute
> di rete del 21/09/2026 e di lunedi' non hanno mai avuto una spiegazione
> chiusa. Venti chiamate senza pausa verso la stessa piattaforma sono
> esattamente la forma che produce un freno o una connessione rifiutata, e
> `non_so` e' lo stato in cui si finisce **proprio quando una chiamata e'
> andata male** -- cioe' la condizione si autoalimenta. **Non e' provato**:
> e' la prima pista da seguire quando si riaprira' quel fronte, non una
> conclusione.

**2. `SECONDI_DI_TETTO` non e' validata.** Con zero o con un valore che non e'
un numero, `SCADENZA` cade nel passato e il ciclo non parte. **La famiglia e'
chiusa** dall'invariante gemello nella trappola (un verde con zero chiamate
riuscite adesso esce rosso, con caso e controprova nel banco), ma la
validazione della variabile resta da fare: chiudere la famiglia non rende
inutile chiudere il caso.

**3. *"e lo stesso in altri N giri"* afferma un colpevole non verificato.** Il
codice registra il **primo** colpevole e conta gli altri; la frase dichiara
che negli altri giri fosse lo stesso. Se al giro 1 non dichiara `autogepy` e
al giro 7 non dichiara `delorenzi`, la riga dice una cosa falsa.

**4. Due frasi che si contraddicono a due righe di distanza.** Sulla terza
caduta di fila il riepilogo dice *"Il giro **prosegue** con la chiamata
successiva... non si perde niente"* e subito sotto *"**3 giri persi di fila:
il giro si ferma qui.**"*. La prima e' falsa nel momento esatto in cui viene
stampata, e chi legge le trova insieme.

**5. *"di cui 1 cambiate davvero"*.** Il singolare e' curato per le chiamate
riuscite e per le schede ripassate, non per le riscritte. E' lo stesso difetto
segnalato da **tre** revisori diversi: un difetto scritto tre volte, non tre
difetti.

**6. *"1 chiamate"* e *"1 giri"* nelle frasi di chiusura.** Righe che dicono
com'e' finito il giro: `$giro chiamate`, `$giro giri`, senza ramo singolare.
Morde solo al primo giro, ed e' la sciatteria che un commento venti righe piu'
sotto dichiara di voler evitare.

**7. *"Il resto del giro e' stato fatto"* anche quando non e' stato fatto.**
Si stampa ogni volta che c'e' almeno una chiamata persa, **qualunque sia il
motivo della fine**: se l'orologio ha troncato il giro, il resto non e' stato
fatto affatto.

**8. Due numeri alla stessa domanda, con due ambiti e senza dirlo.** La colonna
"Rilette" della tabella "Stato dei siti" e' il conto dell'**ultima chiamata**
(la tabella legge `ultima_buona`, riscritto a ogni giro riuscito); la riga del
totale e' il conto di **tutto il giro**. Chi somma la colonna non ritrova il
totale, e niente sulla pagina lo spiega. La tabella e' preesistente: e' la riga
nuova a renderla leggibile accanto a un numero venti volte piu' grande.

**9. Zero contro "non e' leggibile", nella stessa pagina.** Per un sito che non
dichiara `rilette`, la tabella scrive **0** (`e.get('rilette', 0)`) e la riga
del totale scrive *"non e' leggibile"* nominando il colpevole. Due risposte
opposte allo stesso vuoto, a poche righe di distanza. E' *lo zero e il vuoto*
dentro il riepilogo che lo racconta.

**10. La ragione per cui il ciclo e' finito e' decisa in due posti.**
`si_continua` la registra in `motivo_fine` in tre rami, ma il codice la
consulta solo per "tempo" e rideduce gli altri due da `$ancora`; e il `case`
non ha ramo di riserva. **Oggi non fa danno** -- `si_continua` controlla
`ancora != no` per primo, quindi le combinazioni incoerenti non si formano --
ma una quarta condizione aggiunta domani annuncerebbe "Fermata al tetto di 20
chiamate" oppure non stamperebbe niente. E' *"una decisione presa in quattro
posti ne dimentica il quinto"*, in attesa del quinto.

**11. Tre rami della frase sui conteggi illeggibili, un caso solo.** "un giro
solo", "due giri", "piu' di due": il banco produce venti giri illeggibili e
verifica alla lettera il terzo. Gli altri due non li ha mai eseguiti nessuno.
Era una nota; da quando esiste la regola che **la copertura si conta in
meccanismi** ha un nome, ed e' il piu' facile da chiudere di tutti.

**Dieci auto pubblicate non compaiono in nessuna categoria, e il dato c'e'.**
Misurato il 23/09/2026, ed e' un difetto, non una nota.

La barra "Esplora per categoria" della home scorre le nove carrozzerie ammesse
e conta chi ne ha una; chi ha il campo vuoto **non finisce da nessuna parte**
(`src/app/(marketplace)/page.tsx`, `if (bodyType)`). In produzione sono
**dieci su 269 pubblicate, il 3,7%**: raggiungibili dalla ricerca o da Google,
**non navigando per categoria** -- che e' il modo in cui la gente cerca
un'auto. Fra tutte le 373 righe, non solo le pubblicate, sono **diciotto**.

Chi sono, e vengono tutte dal sito -- **nessuna inserita a mano**:

| concessionaria | auto |
|---|---|
| De Lorenzi Srl | Citroën C3 (×3), Peugeot 308, Mazda 2, Honda Prelude |
| AUTOGEPY SPA | Hyundai Tucson (×2), Jaguar F-Type |
| Ponginibbi Spa | Citroën Ami |

**La domanda che contava -- il dato non e' mai arrivato, o si perde per
strada? -- ha una risposta misurata: si perde per strada.** Preso il caso piu'
sfacciato, la Hyundai Tucson (`autogepy.it`, id sorgente `9719376`, un SUV per
chiunque), e seguito il dato dall'origine:

1. **la pagina del sito lo dichiara**: scaricata il 23/09/2026, contiene
   `"body_style":"SUV"` e `"bodyType":"SUV"`;
2. **il nostro lettore lo riconoscerebbe**: `leggiCarrozzeria` legge proprio
   `body_style`, e `"SUV"` e' il primo valore dell'elenco ammesso in
   `src/lib/vehicle-body-types.ts` -- non serve nemmeno un sinonimo;
3. **`body_type` e' fra i campi che il sito puo' scrivere** (`CAMPI_DAL_SITO`
   in `src/lib/dealer-site-sync.ts`), e quella scheda **non ha nessun segno di
   provenienza** (`origine_dati` vuoto), quindi non e' protetta dal
   concessionario;
4. **la scheda viene ripassata di continuo**: ultimo ripasso alle **15:08 del
   23/09/2026**, meno di un'ora prima della misura;
5. e nel database `body_type` e' **NULL**. Nello stesso giro, altre schede
   dello stesso sito -- Alfa Romeo Tonale, Hyundai Santa Fe, Jeep Avenger,
   ripassate fra le 15:06 e le 15:11 -- hanno `body_type = "SUV"`.

**Il meccanismo esatto non e' ancora trovato, e va scritto cosi' invece di
indovinarlo.** Le due ipotesi comode sono gia' escluse: non e' la condizione
del veicolo (le dieci sono 8 usate e 2 km0, e fra quelle con carrozzeria ci
sono usate, km0 e nuove) e non e' la categoria (tutte "Auto"). Il passo
successivo e' eseguire l'importatore del progetto contro quell'indirizzo e
guardare cosa legge: `src/lib/dealer-site-import.ts` **non parla col
database**, quindi si puo' provare su dati veri senza rischi.

**E' la stessa famiglia della provincia che sparisce** -- il codice che scarta
in silenzio quello che non riconosce -- ma non e' la stessa strada: li' la
colonna non esisteva in produzione e l'inserimento la buttava via, qui la
colonna c'e', il valore e' leggibile, il campo e' scrivibile, e resta vuoto lo
stesso. Il tratto comune e' l'unico che conta: **nessuno dei due casi produce
un errore**, e senza andarli a contare non se ne accorge nessuno.

**E tocca l'indicizzazione**, quindi va guardato insieme al fronte di domani:
se le pagine di categoria sono fra quelle che Google ha indicizzato, quelle
dieci auto perdono una via d'accesso anche per lui -- non solo per chi naviga.
Da verificare quando si leggeranno le statistiche di scansione.

**I quattro numeri della home ora stanno nell'HTML, e hanno fino a cinque
minuti.** La pagina ha `revalidate = 300`: il numero servito puo' essere
vecchio di cinque minuti. Su un catalogo che si muove ogni tre ore e'
irrilevante, ma va saputo adesso che quel numero **lo legge anche Google** --
prima era un `0` disegnato dal browser e non lo leggeva nessuno.

**E i tre numeri che sembravano contraddirsi non si contraddicevano.**
Misurati il 23/09/2026 con la chiave pubblica, la stessa con cui la home
legge: il contatore dice **269**, la somma per concessionaria dice **269**
(126 + 93 + 50), la somma delle categorie dice **259**. Il primo e il secondo
sono lo stesso insieme -- letture fatte in momenti diversi danno 270 invece di
269 perche' il catalogo si muove. Il terzo e' lo stesso insieme **meno le
dieci senza carrozzeria**. Nessuno dei tre e' sbagliato: contano tre cose
diverse, e solo il primo dichiara di essere un totale.

**Il disco del Codespace si riempie da solo, e pulirlo non basta.**
Misurato il 23/09/2026 al 90% (3,1G liberi su 32). La pulizia ne ha liberati
**1,6G** e ha riportato l'uso all'85%, ma la domanda utile non era "cosa
cancello": era **"e' accumulo o e' crescita?"**. E' crescita, e le fonti sono
tre, nessuna con un tetto:

| cosa | misura del 23/09/2026 | ritmo |
|---|---|---|
| **versioni di Claude Code** in `~/.local/share/claude/versions/` | 4 versioni, ~215M l'una, **una sola in uso** | 4 in 13 giorni (10, 11, 17, 23 settembre): **~500M al mese** |
| trascritti di sessione in `~/.claude/projects/` | 305M, 17 file, il piu' vecchio del 27 agosto | nessuna rotazione |
| cache `npx` in `~/.npm/_npx` | 543M in 9 pacchetti | mai ripulita |

**La prima da sola spiega quasi tutto**, ed e' la piu' facile da chiudere:
tenere l'ultima versione e togliere le altre e' un comando, e va fatto quando
il disco scende -- non c'e' nessun automatismo che lo faccia.

**Due cose che NON sono la causa, e vale la pena saperlo** perche' sono i
sospetti naturali:

- **il banco di prova.** Pulisce la propria cartella in uscita
  (`rm -rf "$LAVORO"`), e comunque scrive in `/tmp`;
- **`/tmp`.** Sta su un **filesystem separato** (44G, al 12%): svuotarlo non
  libera un byte su `/`. Chi cerca spazio guardando `du /tmp` lavora un'ora
  per niente.

**Cosa costerebbe un tetto.** Poco, ma non zero, e la forma giusta e' quella
gia' usata altrove in questo progetto -- non "ricordarsi di pulire", che e' la
confessione che il vincolo non esiste, ma un comando solo che si lancia quando
serve: uno script `scripts/libera-il-disco.sh` che tiene l'ultima versione di
Claude Code, i trascritti degli ultimi trenta giorni e niente cache, e che
**stampa cosa sta per togliere prima di toglierlo**. Mezz'ora, e toglie
l'occasione invece di ricordarla. **Non fatto**: annotato qui il 23/09/2026
perche' sia una decisione e non una dimenticanza.

**Un ramo scartato, tenuto apposta.**
`prova/filtri-al-server-costano-l-indicizzazione` (20/09/2026) porta i
filtri della pagina di una concessionaria dal browser al database: e'
completo, ha quattordici test e **funziona**. Non e' stato unito perche'
leggere l'indirizzo obbliga quella pagina a ricostruirsi a ogni visita --
misurato 0,3-0,6 secondi contro 0,07, con `Cache-Control: no-store` -- cioe'
la condizione descritta da Google per lo stato "Rilevata, ma attualmente non
indicizzata". (Il numero "124 schede il 06/09" che stava in questa riga era
riportato a memoria e **non esiste** negli esportati di Search Console:
corretto il 20/09/2026, il giro completo sta piu' sotto.) Il guardiano
`marketplace-performance.test.ts` e' rimasto **rosso su quel ramo apposta**:
e' la prova. Al suo posto: la pagina resta statica e "Filtra" porta su
`/ricerca?dealer=<id>`. Se qualcuno riproporra' i filtri al server su quella
pagina, quel ramo e' la risposta gia' misurata -- e le sue parti
(`filtri-concessionaria-db.ts`) serviranno comunque per la paginazione di
`/ricerca`.

5. **Il resto delle cose interne:**
   - **una data di prima pubblicazione che nessuna reimportazione tocca.**
     Oggi non esiste: `created_at` e' l'unica cosa che dice quando una
     scheda e' nata, e una reimportazione che riscrive la riga la sposta
     senza che l'indirizzo sia nuovo. **Il caso che l'ha resa necessaria**:
     il 21/09/2026 si voleva sapere quante delle non indicizzate esistevano
     gia' durante la finestra di scansione di fine agosto, e la risposta
     poggiava tutta su quella colonna, senza una seconda fonte --
     `audit_logs` non ha eventi di nascita per nessuna delle 43 schede
     indicizzate. Si e' potuto escludere lo spostamento grosso, non quello
     dentro la finestra, e **il numero e' rimasto non scrivibile**. Fra tre
     settimane ci faremo la domanda gemella -- *quante delle auto
     pubblicate prima di oggi sono state indicizzate dopo* -- e senza quella
     data non si potra' rispondere nemmeno allora;
   - **i 486 KB di HTML della pagina di una concessionaria** (Ponginibbi,
     misurati il 21/09/2026 con un browser vero: 50 immagini, 134
     collegamenti). E' peso su ogni visita, non indicizzazione. **Annotato,
     non fatto**;
   - **le 31-39 richieste `?_rsc=` per ogni pagina aperta.** `robots.txt` le
     toglie a chi indicizza, **non ai visitatori**: restano su ogni visita, e
     sono i collegamenti del pie' di pagina che il router prepara. Non e'
     indicizzazione, e' peso -- va misurato in byte e richieste prima di
     decidere se e come toglierlo (per esempio con `prefetch={false}` sui
     collegamenti del pie' di pagina). **Annotato il 21/09/2026, non fatto**;
   - le **dieci colonne `cost_*`** del conto economico, obbligatorie con
     valore predefinito zero: li' "non l'ho registrato" e "non e' costato
     niente" **non si distinguono**, e finche' e' cosi' **il margine di
     un'auto a cui il concessionario non ha ancora messo i costi sembra
     completo e non lo e'** -- tutte le voci hanno un numero, il conto torna,
     e il margine e' piu' alto del vero di tutto quello che non e' stato
     ancora scritto. E' il numero su cui si decide un prezzo. **Serve una
     migration**, e va mandata al titolare per intero quando ci si arriva;
   - le due porte ancora scollegate dalla provenienza (importazione da file,
     foglio di consegna);
   - `vehicle_category` che dice "dal tuo sito" su un valore che dal sito non
     arriva.

**Fuori dall'ordine perche' aspetta una misura: le due pagine servite
fredde.** `/auto` e `/ricerca` -- ventiquattro pagine in tutto -- sono le
uniche pubbliche ricalcolate a ogni richiesta. Non si decide niente finche'
il titolare non porta il numero di Search Console: la condizione che fa
scattare il lavoro e' scritta per esteso piu' sotto, in *"Il quadro
dell'indicizzazione, e le due pagine servite fredde"*.

**Fuori dall'ordine, e apposta: le tre voci del piano multiutente.** Le
notifiche leggibili fra colleghi, il `cross join` sugli utenti nelle due
interrogazioni, e la correzione su `dealer_users`. **Sono legate alla loro
condizione, non a una data**: si chiudono **prima di vendere un piano con
piu' di un utente**, Elite compreso, e finche' ogni piano ha un utente solo
non fanno danni. Vanno guardate tutte e tre insieme il giorno che quella
condizione si avvera.

**Fuori dall'ordine, con la stessa forma: prima del primo abbonamento
venduto.** Voci legate a una condizione, non a una data.

1. **Una riga nei termini di servizio sulle fotografie** (25/09/2026). Il
   concessionario autorizza KeyAuto a copiare nel proprio archivio le foto
   dei veicoli che porta sulla piattaforma -- dal suo sito, da un feed o da
   un file -- e a servirle da li'. Oggi non si pone: i quattro conti sono
   del titolare. Con clienti veri serve **una clausola nei termini**, non
   una richiesta caso per caso. Il motivo per cui le foto si copiano sta in
   *"Le foto stanno su un server non nostro"*, piu' sotto.
2. **`vehicle_images.origine_url` e' leggibile da chiunque** (25/09/2026,
   quando la colonna entrera'). Il pubblico legge tutte le colonne di
   `vehicle_images`, e l'indirizzo d'origine di una foto dice quale
   gestionale usa ogni concessionario: non e' un segreto tecnico, e'
   un'informazione commerciale sui nostri clienti. La cura e' il permesso di
   lettura colonna per colonna, come su `vehicles`; prima si controlla che
   nessuna interrogazione del sito chieda tutte le colonne di quella tabella.

## Le foto stanno su un server non nostro (25/09/2026)

Misurato sulla produzione, in sola lettura:

- **4.825 foto su 4.831** vivono su `cdn.dealerk.it`; le altre 6 sono nel
  nostro archivio (due auto inserite a mano). 373 auto su 373 hanno almeno
  una foto.
- **Passano tutte dal nostro proxy** (`/api/image-proxy?url=`): in una scheda
  in vetrina, 68 indirizzi su 68. Vercel tiene la foto rimpicciolita per 30
  giorni, ma solo dopo la prima richiesta in quella misura: la prima foto
  della scheda provata era `MISS`. Non e' un'assicurazione.
- **Peso**: 693,4 MB alla misura da 1600 px (mediana 133 KB, massimo 635 KB,
  tutte JPEG); quelle delle 269 auto in vetrina sono 3.245, 464,6 MB.
- **Foto gia' morte: zero** su 4.825 (una richiesta HEAD ciascuna, 6 alla
  volta, 400 s). Limite: le risposte venivano tutte dalla memoria di
  Cloudflare di DealerK -- ma il nostro proxy legge lo stesso indirizzo.
- **Scaricarle**: 60 foto in 0,6 s, due letture uguali; tutte in meno di un
  minuto. Il caricamento nel nostro archivio **non e' misurato**: misurarlo
  vorrebbe dire copiarle.

**Piano approvato il 25/09/2026.** Il progetto e' sul piano Pro di Supabase
(verificato dal titolare sul pannello): i 693 MB stanno nei 100 GB inclusi,
nessun costo in piu'. **Niente e' ancora stato copiato.**

### Prima della prima copia, in quest'ordine

**1. "Duplica" deve smettere di condividere il file dell'originale.** *Fatto il 25/09/2026, vedi in fondo a questo punto.*
Verificato il 25/09/2026 sul codice e sullo schema ricostruito, dopo un
rilievo di chi ha letto il piano. "Duplica"
(`src/components/vehicles/vehicles-management-page.tsx`, righe 1163-1182)
scrive le foto della copia prendendo dall'originale soltanto `image_url`,
posizione e copertina, con il `vehicle_id` della copia.

- **Oggi non si rompe niente.** L'originale ha un indirizzo DealerK, la copia
  lo eredita, e la rete del programma le da' l'origine: entra in coda e
  verra' copiata sotto il suo id. Provato: `UPDATE 1`, in coda.
- **Dopo la copia, "Duplica" non fallisce: riesce, ed e' peggio.** La riga
  della copia nasce con il percorso dell'originale
  (`<concessionaria>/<id dell'originale>/<impronta>.jpg`), senza origine e
  senza esito: nessun vincolo la tocca, perche' valgono solo per le foto
  "copiate" (provato: `INSERT 0 1`). Da quel momento la copia **dipende
  dall'originale** in tre modi, e nessuno si vede:
  - il proxy decide se mostrare una foto guardando l'auto il cui id sta nel
    percorso (`fotoDiUnAnnuncioPubblico`), cioe' l'originale. **Quando
    l'originale viene venduto o tolto dalla vetrina, le foto della copia
    pubblicata rispondono "non trovata"** -- e duplicare un'auto venduta per
    pubblicarne una uguale e' esattamente l'uso normale del pulsante;
  - il file e' uno solo: togliere quella foto dalla copia, nell'editor,
    cancella il file dell'originale;
  - la riga non ha origine e ha un percorso nostro: il programma di copia non
    la guarda mai.
- **Il vincolo mordera' solo una "Duplica" che copiasse anche le colonne
  della copia** (per esempio con un `select("*")` sulle foto): quella verrebbe
  rifiutata. Provato: `violates check constraint "vehicle_images_copia_verificabile"`.

**Vale gia' oggi per le foto caricate a mano** (6 foto, 2 auto di Autogepy):
il loro percorso e' `<utente>/<id dell'auto>/...`, e una copia di quelle auto
ha gia' oggi le tre dipendenze qui sopra. La copia delle foto lo estende da 6
a 4.825.

**La via scelta: "Duplica" copia il file sotto l'id della copia.** Le regole
dell'archivio lo permettono dal browser: chi ha fatto login legge un file
nominato da una riga della sua concessionaria e carica sotto la cartella col
proprio identificativo, quindi la copia va in
`<utente>/<id della copia>/<nome>`, che il proxy serve e il vincolo accetta
(provato: `INSERT 0 1`). Per ogni foto dell'originale:

| la foto dell'originale | cosa scrive "Duplica" |
|---|---|
| copiata | il file copiato sotto l'id della copia, con la stessa origine, impronta e peso, esito `copiata` |
| non ancora copiata (indirizzo esterno) | l'indirizzo e l'origine, esito vuoto: la copia la fa il programma |
| caricata a mano (nessuna origine) | il file copiato sotto l'id della copia |

Perche' questa e non l'altra ("la copia riparte dall'origine e il programma
la ricopia"): l'altra costa meno ma **copre solo le foto che hanno
un'origine**, quindi lascerebbe in piedi il difetto sulle foto caricate a
mano; e fra la duplicazione e il giro successivo la copia tornerebbe a
dipendere da DealerK. Il prezzo di questa: circa 2,7 MB di archivio per ogni
auto duplicata. Il file si copia sul server dell'archivio (`copy`), senza
passare dal browser.

**E "Duplica" oggi non guarda l'esito della scrittura delle foto** (riga
1170, nessun controllo dell'errore): se fallisse, la copia nascerebbe senza
foto e senza nessun messaggio. Si corregge insieme.

**Quando:** prima del primo giro di copia, non prima della migration. La
migration si puo' eseguire subito: finche' nessuna foto e' "copiata", per
"Duplica" non cambia niente.

**Fatto il 25/09/2026.** La regola sta in `pianoFotoDellaCopia`
(`src/lib/duplica-veicolo.ts`), la pagina la esegue e guarda l'esito di ogni
passo. Il guardiano e' `src/lib/duplica-veicolo.test.ts`, provato rosso sulla
pagina com'era e su un piano che tornasse a condividere il file. Le regole
dell'archivio sono state provate sullo schema ricostruito **come un utente
vero della concessionaria**: legge il file dell'originale, carica la copia
nella sua cartella, scrive la riga; un'altra concessionaria non vede il
file; caricare fuori dalla propria cartella e' rifiutato; togliere la copia
lascia l'originale. Due limiti della prova, detti: i permessi di base che
Supabase concede da se' su `storage.objects` sono stati concessi a mano nel
banco (l'impalcatura non li regala, apposta); e il servizio dell'archivio,
che per copiare usa quelle regole, non e' stato messo in moto -- lo fara' la
prima duplicazione vera.

**2. La sincronizzazione confronta le foto per identita'.** *Fatto il
25/09/2026, PR #371:* senza, la sincronizzazione avrebbe buttato via le copie
al primo ritocco del concessionario. Vedi sotto, "Come funziona la copia".

**3. Il programma di copia.** *Scritto il 25/09/2026, e per ora parte solo a
mano.* Le regole in codice stanno in `src/lib/copia-foto.ts` e
`src/lib/copia-foto-giro.ts` (provate senza rete), i numeri in
`src/lib/copia-foto-soglie.ts`, le operazioni vere in
`src/app/api/cron/copia-foto/route.ts`, il lavoro periodico in
`.github/workflows/copia-foto.yml`.

**Il primo giro lo avvia il titolare:** *Actions* → *Copia delle foto nel
nostro archivio* → *Run workflow*. Quel giorno si scrivono qui sotto, in
"L'appuntamento", la data del primo giro e la data di verifica (piu' 7
giorni), e la stessa data va in `dataVerifica` nel file dei numeri: da quel
giorno ogni riepilogo la ricorda.

**La prova a secco sui dati veri, 25/09/2026, senza scrivere niente.** La
lettura della coda come la fa il programma: 4.825 righe, nessun errore, nessun
troncamento. In coda **3.726**; fuori coda **1.099** foto di auto uscite dal
sito e fuori vetrina. Le copertine delle auto in vetrina sono **267**, le foto in
vetrina **3.230**: non 269 e 3.245 come scritto prima, perche' delle 269 auto
pubblicate una ha le foto caricate a mano (gia' nostre) e una -- l'Alfa Romeo
Tonale qui sopra -- era esclusa per errore dalla regola 1, corretta. Scaricate
e verificate tre foto vere: tre immagini, stessa foto dopo i rimbalzi. Da
quella prova sono cadute due regole del piano (vedi la regola 1 e "Come
scarica"). **Ed e' un'anomalia a se', annotata e non corretta:** un'auto
segnata uscita dal sito dal 29/08 non dovrebbe essere ancora in vetrina.

**Il banco del lavoro periodico**, sei casi con un finto endpoint, tutti col
colore atteso e ogni rosso con il suo `::error::`: sano (tre chiamate finche'
c'e' altro da fare), chiamate cadute, server fermato, successo non
guadagnato, promemoria dell'appuntamento, segreto mancante. Due volte il banco
ha sbagliato da solo prima di dire il vero -- la sonda che aspettava il finto
server faceva una chiamata vera, e `${3:-...}` sostituiva anche il segreto
vuoto -- ed e' stato corretto il banco, non il lavoro.

**Cosa non c'e' ancora, e va fatto prima delle date scritte accanto:**

| cosa | quando |
|---|---|
| la regola di lettura del pubblico che nasconde le morte (una migration), e poi `morteAbilitate` acceso | prima che servano: oggi le foto con due "non esiste" aspettano, senza consumare tentativi |
| il controllo settimanale che rimette in coda morte ed esaurite che tornano a rispondere | entro sette giorni dal primo giro: prima non esiste nessuna esaurita |
| il riquadro nel gestionale con i conti della copia | quando c'e' qualcosa da mostrare |
| la sentinella del nostro lato (qualche foto copiata riletta dal nostro archivio) | con il riquadro |
| l'avvio automatico dopo ogni sincronizzazione | dopo il primo giro verificato |

### Come funziona la copia

Ogni foto ricorda da dove viene (`origine_url`) e com'e' andata la copia. Il
programma di copia legge la coda, scarica ogni foto dall'origine, la salva nel
nostro archivio e **solo dopo** scrive sulla riga che e' copiata -- e solo se
l'origine e' ancora quella letta all'inizio (se nel frattempo la
sincronizzazione ha cambiato la galleria, la scrittura tocca zero righe: vuol
dire "superata", non "fallita"). Interrotto a meta', si rilancia e riprende. Il
database rifiuta una "copiata" che non porti la prova (impronta sha256, peso,
origine) **e** che non sia servita dal nostro archivio, nella forma che il
proxy sa servire: `<concessionaria>/<id dell'auto>/<impronta>.jpg`.

**L'identita' di una foto non e' il suo indirizzo.** Per una foto DealerK e' il
pezzo dopo `/dealer/datafiles/vehicle/images/<misura>/`: cartella e nome del
file, senza dominio e senza misura (la stessa chiave che il lettore dei siti
usa gia'); per gli altri server, il percorso senza parametri. La
sincronizzazione confronta le gallerie **foto per foto su quella chiave**: tiene
le righe la cui foto c'e' ancora (aggiorna posizione, copertina e, se e'
cambiato solo il dominio o la misura, `origine_url` sul posto: la copia
resta), toglie solo le sparite, inserisce solo le nuove. Il file di una foto
tolta si cancella **solo se nessun'altra riga lo usa**, la stessa regola
dell'editor. Il perche' e' gia'
successo una volta, per mano nostra: il 22/08/2026 la misura e' passata da
800 a 1600 px e il ripasso ha riscritto tutte le gallerie. Con il confronto
sull'indirizzo intero, a copia finita, avrebbe buttato via 3.233 copie e
rimesso DealerK al loro posto -- cioe' esattamente il guasto da cui la copia
protegge. E oggi basta spostare una copertina: `sostituisciFoto` confronta per
posizione e rifa' la galleria intera. **Rete in piu': al massimo 20 foto
copiate tolte per concessionaria in una chiamata della sincronizzazione**;
oltre, la galleria di quell'auto resta com'e' e il riepilogo lo dice. E' la
rete per un cambio dei nomi dei file da parte di DealerK, che cambierebbe
l'identita' di tutte le copie insieme. *Cambiato il 25/09/2026 scrivendo il
codice:* la prima stesura diceva "se in un giro perde la chiave piu' della
meta' delle foto copiate di una concessionaria, non si tocca niente", ma il
ripasso legge le pagine a poco a poco e quella meta' non si conosce in
anticipo. Un tetto si conta mentre si va; una proporzione no. Una galleria
vera ha al massimo 20 foto, quindi chi rinnova le foto di due auto nella
stessa chiamata vede la seconda rimandata alla chiamata dopo: rimandata, non
persa. **Fatto il 25/09/2026**, con il guardiano
`src/lib/dealer-site-photos.test.ts`, provato rosso sulla versione di prima.

**Le porte che scrivono le foto, e cosa confronta ognuna:**

| porta | cosa fa |
|---|---|
| `sostituisciFoto` (sincronizzazione e importazione dal sito) | confronta sulla chiave, come sopra |
| `upsertVehicleImages` (importazione da feed) | la stessa chiave: oggi confronta su `image_url`, e dopo una copia reinserirebbe le stesse foto come doppioni |
| l'editor del gestionale | carica foto nostre, senza origine; toglie un file solo se nessun'altra riga lo usa |
| "Duplica" | copia il file sotto l'id della copia: vedi *"Prima della prima copia"*, qui sopra |
| `/api/vehicles/feed` | fuori, in un elenco esplicito: non la chiama nessuno, scarica per conto suo con un percorso che il proxy non serve (vedi sotto, "trovato leggendo") |

Un test sul testo dei sorgenti fissa l'elenco, come per il telaio. **E ogni
giro, per prima cosa, riempie `origine_url` sulle righe esterne che non l'hanno**
(la stessa condizione della migration): e' la rete per la porta che nessuno ha
contato, e rende innocuo l'ordine delle cose -- la migration va **prima** del
codice, e le righe scritte dal vecchio codice nel frattempo entrano in coda al
primo giro.

**Come scarica.** Direttamente dall'origine, **mai attraverso
`/api/image-proxy`**, che trasforma ogni fallimento in un 404 e renderebbe
inutile la regola 2. Chiede la misura normalizzata (1600 px), la stessa che
interrogano le sentinelle. Prima di scrivere "copiata" controlla che sia
davvero la foto: dopo gli eventuali rimbalzi l'indirizzo ha lo stesso
percorso; il tipo e' un'immagine; si decodifica; e se la stessa impronta c'e'
gia' su tre o piu' origini diverse dello stesso server, e' un segnaposto ("hotlink vietato", dominio parcheggiato): conta come
fallimento, frena il server e non marca niente. *La larghezza minima di 400 px
era nel piano ed e' caduta alla prova sui dati veri, 25/09/2026*: la terza
foto della coda e' la copertina di una Peugeot 208 in vetrina, un'immagine da
catalogo larga 220 px, vera e voluta dal concessionario. Rifiutarla avrebbe
lasciato proprio quella copertina su DealerK. Oggi DealerK risponde 404
vero ai file mancanti, non un segnaposto: e' un difetto che aspetta, e con la
copia diventerebbe definitivo. Due richieste alla volta, con una pausa: il
numero sta nello stesso file delle altre soglie.

**Quando gira.** Dopo ogni sincronizzazione, **anche quando la sincronizzazione
esce rossa** (`if: always()`), con un verdetto suo e lo stesso gruppo di
concorrenza, cosi' due giri non si sovrappongono. "Un giro" e' il lavoro
intero, non la singola chiamata da 60 secondi: i conteggi del freno passano da
una chiamata all'altra come il cursore della sincronizzazione.

**Cosa si accetta, e perche'.** I file rimasti senza riga (auto cancellata,
foto sostituita, una copia rifatta) restano nell'archivio: circa 2,7 MB per
auto contro 100 GB di spazio. Il riepilogo li conta, cosi' la crescita si
vede. L'impronta non rende la ricopia identica: secondo la misura di un
revisore la stessa foto pesa 127.211 byte dalla memoria di Cloudflare e
130.432 dall'origine (non rifatta da me). E ogni giro interroga qualche foto
copiata **dal nostro archivio**: la sentinella del nostro lato.

### Le regole, e perche' ognuna c'e'

"Server" qui e' **il server delle foto**, non il sito del concessionario:
`cdn.dealerk.it` serve tutte e tre le concessionarie di oggi.

1. **L'ordine della coda.** Prima le foto mai provate: le copertine delle auto
   in vetrina, poi il resto della vetrina, poi le altre. Poi quelle rinviate
   da un giro frenato, poi quelle gia' fallite, dalla meno recente. Senza
   questo, poche foto difettose in testa alla coda verrebbero riprovate per
   prime a ogni giro, farebbero scattare il freno, e il resto non verrebbe mai
   copiato: e' il difetto di Autogepy dell'11/09/2026, *"un sito che frena perde
   il turno, non il lavoro"*. Le foto delle auto **uscite dal sito e fuori
   vetrina** escono dalla coda, non dalla tabella, e ci rientrano se l'auto
   ricompare: DealerK cancella le loro foto, e i loro 404 veri consumerebbero
   il tetto delle morte per auto che nessuno vede. *"E fuori vetrina" l'ha
   aggiunto la prova sui dati veri del 25/09/2026*: un'Alfa Romeo Tonale
   segnata uscita dal sito dal 29/08 e' ancora in vetrina, e le sue foto sono
   visibili a tutti.
2. **Solo 404 e 410 vogliono dire "non esiste".** Letti dall'origine, e
   **riconfermati con un parametro casuale nell'indirizzo** prima di essere
   scritti, perche' Cloudflare tiene in memoria anche un 404 (circa tre
   minuti, misurato da un revisore). Un rifiuto (403), un errore del server,
   un tempo scaduto, un dominio che non si trova: la foto **non e' stata
   raggiunta**. **Il primo 429, o un 403 con `Retry-After`,** ferma il server
   per il giro: e' una richiesta esplicita di smettere, non uno dei dieci
   fallimenti da contare. Nessuna marcatura, nessun tentativo consumato.
3. **Le sentinelle: la prova che il server risponde non dipende dalla coda.**
   Dieci foto **gia' copiate**, di **dieci auto diverse** ancora sul sito,
   interrogate (solo intestazioni) **con un parametro casuale nell'indirizzo**:
   verificato il 25/09/2026 che senza parametro risponde la memoria di
   Cloudflare (`HIT`) e DealerK non viene nemmeno interpellato, con il
   parametro la richiesta arriva all'origine (`MISS`). Conta solo una risposta
   che non viene dalla memoria. Tre esiti, e il terzo ha un nome:
   **sano** (almeno 10 disponibili, rispondono almeno 9); **non risponde**
   (almeno 10 disponibili, ne rispondono meno di 9): su quel server il giro
   **non conta**, qualunque sia la lunghezza della coda; **sconosciuto** (meno
   di 10 disponibili: il primo giro, un server piccolo).
4. **Il freno di giro**, per i server sconosciuti e come seconda rete: dopo
   almeno 20 tentativi su un server, se falliscono piu' del 5% e almeno 10
   foto, ci si ferma: nessuna marcatura, **nessun tentativo consumato**, le
   foto provate prendono solo la data (cosi' ruotano in coda), lavoro rosso.
   Il freno misura **le novita'**: non contano i fallimenti delle foto gia'
   fallite prima, ne' i 404 su un server sano. Altrimenti venti foto bloccate
   per sempre in fondo alla coda farebbero frenare ogni giro, per sempre.
5. **Morta.** "Non esiste" in **due tentativi consecutivi** di quella foto, a
   **almeno 24 ore** di distanza, con il server **sano** in tutti e due.
   Qualunque altra risposta nel mezzo azzera il conto. **Al massimo 20 morte
   ogni 24 ore per server**: una foto che avrebbe tutte le condizioni ma e'
   trattenuta dal tetto **aspetta senza consumare tentativi**, e toccare il
   tetto fa diventare rosso il lavoro. La foto morta esce dalla galleria
   pubblica **in un posto solo**, la regola di lettura del pubblico
   (`copia_esito is distinct from 'sorgente-morta'`), non nelle otto
   interrogazioni delle pagine: si aggiunge con la migration del programma,
   oggi di morte non ce ne sono. Non si cancella.
6. **Esaurita: il ciclo finisce.** Dopo 16 tentativi validi e almeno 7 giorni
   dal primo, la foto esce dalla coda con `tentativi-esauriti`, che vuol dire
   **"non lo so"**: resta visibile dall'origine come oggi e si conta a parte
   nel gestionale. I 404 su server sano non avanzano verso l'esaurimento:
   quelle foto aspettano il tetto delle morte, perche' "lo so, ma ho finito i
   posti" non e' "non lo so". Ci finiscono le foto dei server senza
   sentinelle dopo un guasto lungo e quelle che non rispondono mai con un
   "non esiste" (un 403 perenne). **Accettato, con la ragione:** per un server
   che non si puo' mettere alla prova, "non lo so" e' la risposta onesta.
7. **Il ritorno.** Morte ed esaurite tornano in coda in tre modi:
   - il **"riprova"** del gestionale, o la riga SQL, che **azzera tutti i
     contatori** -- altrimenti il riprova varrebbe un tentativo solo, e un
     intoppo in quel momento rimetterebbe la foto dov'era:

     ```sql
     update public.vehicle_images
        set copia_esito = null, copia_tentativi = 0,
            copia_primo_tentativo = null, copia_ultimo_tentativo = null,
            copia_primo_non_esiste = null, copia_ultimo_motivo = null
      where copia_esito in ('sorgente-morta', 'tentativi-esauriti')
        and ...;
     ```

     Il filtro sull'esito non e' prudenza in piu': una foto copiata ha
     l'indirizzo nostro, e il database rifiuta di rimetterla in coda senza
     che `image_url` torni all'origine;
   - un **controllo settimanale**: una richiesta con parametro casuale per ogni
     morta ed esaurita di un'auto ancora sul sito. Se risponde, la foto torna
     in coda con i contatori azzerati. **E' un ciclo che non finisce, e lo e'
     apposta**: costa al massimo una richiesta a settimana per foto, finisce
     quando la riga sparisce o l'auto esce dal sito, e senza di lui una foto
     dichiarata morta durante un guasto parziale resterebbe nascosta per
     sempre anche dopo il ritorno;
   - una **origine diversa** portata dalla sincronizzazione, cioe' una foto
     nuova.

   *Corretto il 25/09/2026: una prima versione diceva "se un giro dopo
   risponde, torna in coda", ma nessun giro riprovava una foto fuori dalla
   coda. Il controllo settimanale e' quel giro.*

I numeri stanno in **un file solo del codice**, non nel database: un vincolo
che ripete un valore di prodotto rifiuta la scrittura il giorno che il valore
cambia.

### Le due note del 25/09/2026, chiuse

- **"Il caso che non si chiude mai"** -- un server con poche foto non arriva
  mai alla prova che risponde, e le sue foto restano in coda per sempre. Chiuso
  in due pezzi: la prova non si cerca piu' nella coda ma nelle sentinelle
  (foto gia' copiate), quindi a fine coda di un server grande si arriva; dove
  le sentinelle non ci sono, il **tetto ai tentativi** (regola 6) fa uscire la
  foto con "non lo so". La rilettura ha trovato altri tre cicli della stessa
  forma, chiusi insieme: le foto di un giro frenato che restavano in testa
  alla coda per sempre (regola 4: la data le fa ruotare, il freno conta solo
  le novita'); il freno cieco sotto i 20 tentativi, che a fine coda faceva
  esaurire le copertine durante un guasto (regola 3: l'esito "non risponde"
  vale a qualunque lunghezza di coda); e le morte senza ritorno (regola 7).
- **I numeri hanno un appuntamento**, qui sotto.

### L'appuntamento: i numeri si rileggono contro il tasso vero

I numeri delle regole sono una proposta costruita su una misura sola (zero
foto morte su 4.825, il 25/09/2026, e quella misura interrogava la memoria di
Cloudflare, non DealerK). La prima copia completa da' il tasso di fallimento
vero, e **quel giorno si rileggono**. La data e' **sette giorni dopo il primo
giro**, perche' prima nessuna foto puo' arrivare a `tentativi-esauriti` e la
fotografia non e' completa.

**Che l'appuntamento non si perda:** il programma di copia legge la data di
verifica dal file delle soglie e, **da quel giorno in poi, la ricorda in ogni
riepilogo** con il rimando a questo paragrafo, finche' chi compila la tabella
non la toglie. Un avviso che compare un giorno solo salta proprio il giorno in
cui il lavoro non gira.

**Da dove vengono i numeri.** Ogni giro scrive nel suo riepilogo su GitHub, per
server: tentativi, copiate, 404/410, 403, 429, errori del server, tempi
scaduti, "non era la foto", sentinelle riuscite su totale (e quante dalla
memoria), frenato si' o no e a che quota, morte, trattenute dal tetto. GitHub
tiene i riepiloghi **novanta giorni**, l'appuntamento cade al settimo: quel
giorno le cifre si copiano qui, come quelle della sincronizzazione. Sulle
righe copiate `copia_tentativi` e `copia_primo_non_esiste` non si azzerano:
servono a dire quante foto hanno avuto un 404 e poi un 200.

| | |
|---|---|
| primo giro di copia | ____ |
| **data di verifica** (primo giro + 7 giorni) | ____ |

| numero | oggi | cosa si misura quel giorno | cosa lo censura | misurato | nuovo valore |
|---|---|---|---|---|---|
| freno: quota di fallimenti | 5% | la quota piu' alta in un giro senza guasti, per server | conta solo sopra i 200 tentativi per giro: si misura solo nella prima copia | ____ | ____ |
| freno: minimo di fallite | 10 | quante foto fallisce, al massimo, un giro senza guasti | fra 20 e 199 tentativi e' questo il numero che decide, non il 5% | ____ | ____ |
| freno: tentativi prima di giudicare | 20 | quante foto ha un giro, per server | dopo la prima copia i giri sono piccoli: qui decidono le sentinelle | ____ | ____ |
| distanza fra i due "non esiste" | 24 ore | quante foto hanno avuto un 404 e poi un 200 | non scendere sotto la memoria del 404 di Cloudflare (circa 3 minuti, misurato da un revisore) | ____ | ____ |
| tetto delle morte | 20 ogni 24 ore per server | quante foto sono state **trattenute** dal tetto | le morte al giorno non possono superare 20: si legge la fila d'attesa, non le morte | ____ | ____ |
| sentinelle | 10, sano se 9 | quante volte una sentinella ha fallito con il server sano | | ____ | ____ |
| tentativi per esaurire | 16 | quanti tentativi ha avuto l'ultima foto copiata dopo dei fallimenti | con 8 giri al giorno decidono sempre i 7 giorni | ____ | ____ |
| giorni per esaurire | 7 | quanto e' durato il guasto piu' lungo | in 7 giorni non si vede un guasto piu' lungo di 7: "nessun guasto" non e' un valore | ____ | ____ |
| richieste alla volta | 2 | se DealerK ha mai risposto 429 | | ____ | ____ |
| foto copiate tolte per chiamata, per concessionaria | 20 | quante gallerie sono state fermate dal tetto, e perche' | le gallerie fermate si rimandano: si contano le rimandate, non le perse | ____ | ____ |
| controllo delle morte | una volta a settimana | quante morte ed esaurite sono tornate vive | | ____ | ____ |

I quattro numeri concordati per primi sono il 5%, il 10, le 24 ore e le 20
morte; gli altri sono nati chiudendo i cicli che non finivano, e valgono la
stessa regola.

### Com'e' stata riletta

Il 25/09/2026, prima di consegnare la migration, quattro revisori indipendenti
l'hanno attaccata insieme alle regole: stati senza uscita, guasti di DealerK,
concorrenza, migration contro lo schema vero. **Due hanno finito**, con 28
rilievi; gli altri due si sono fermati con la sessione. Dei 28, **due
toccavano la migration** e sono entrati nel testo prima della consegna (una
"copiata" ancora servita da DealerK passava; un percorso che il proxy non sa
servire passava), gli altri sono le regole qui sopra. Le due lenti mancanti
sono coperte cosi': la migration e' stata provata sullo schema ricostruito da
zero con tutti e quattro i ruoli (postgres, service_role, un utente di
un'altra concessionaria, il pubblico); della concorrenza resta scritta la
regola dello stesso gruppo di concorrenza, e **non e' stata attaccata da
nessuno**. I rilievi gravi non sono passati dallo scettico: quelli su cui si
costruisce -- la memoria di Cloudflare, il parametro casuale, la forma del
percorso che il proxy pretende -- sono stati rifatti a mano; gli altri sono
scritti come misure del revisore.

### Foto condivise fra auto diverse: misurato il 25/09/2026, non da "Duplica"

La domanda era se "Duplica" avesse gia' morso. **No**: in produzione nessuna
auto nata a mano o da una duplicazione condivide foto con un'altra, e nessun
percorso del nostro archivio e' usato da due righe.

**Ma la misura ha trovato un'altra cosa.** 79 indirizzi DealerK compaiono
nelle gallerie di piu' auto: 264 righe, 99 auto (88 De Lorenzi, 9 Ponginibbi,
2 Autogepy), **85 in vetrina**, 14 fuori (7 sparite dal sito). Sono tutte auto
importate dal sito, ognuna con il suo identificativo, e ogni gruppo sta dentro
una concessionaria sola. Un indirizzo solo sta in 15 gallerie, e in 7 e' la
copertina. Le righe non sono un residuo di prima della regola delle due misure
(22/08): sono state scritte a ogni giro, fino al 24/09.

Due casi guardati sulla pagina vera, e sono di natura diversa:

- **Peugeot 208 km 0** (`ponginibbigroup.it`, 10502399): la foto condivisa con
  un'altra 208 sta nella galleria della pagina del concessionario, in tre
  misure. E' il concessionario che usa le stesse foto per due auto gemelle:
  scelta sua, non un nostro errore. Ma il nostro lettore, da quella pagina,
  restituisce **41 foto** (se ne tengono 20): da capire se le schede delle
  vetture simili passano la regola delle due misure.

  > **Questa lettura era sbagliata, e la smentita e' dello stesso giorno.**
  > Le tre foto "condivise" **non sono nel blocco dati della 208 10502399**:
  > sono nel blocco della 208 gemella (9939322), e sulla pagina della prima
  > compaiono in cinque misure perche' ci passano attraverso il **carosello**
  > di Ponginibbi -- lo stesso che porta il lettore a 41 foto. "In tre misure"
  > era vero e non provava niente: su Ponginibbi anche le foto altrui ci sono
  > in piu' misure. La lettura resta qui perche' e' da questa che e' nata la
  > regola "stessa marca e stesso modello = riuso legittimo", smentita sotto.
- **Mitsubishi Outlander** (`delorenziauto.it`, 1000457559): in galleria ha due
  immagini da catalogo di una Citroen C5 Aircross, condivise con altre 9 auto
  (anche una Honda ZR-V). Sulla pagina di oggi quella foto compare una volta
  sola, in piccolo, dentro la scheda di **un'altra** auto. E oggi il nostro
  lettore da' `senza-foto` per quella pagina, quindi la galleria scritta il
  28/08 alle 10:12 **non viene piu' rinfrescata**. Come ci sia arrivata quel
  giorno non e' provato, ma il meccanismo c'e' ed e' scritto nel lettore
  (`leggiFoto`, `src/lib/dealer-site-import.ts`): se nessuna foto della
  pagina compare in piu' misure, il lettore prende tutte quelle larghe almeno
  400 px, *"meglio una galleria con qualche intrusa che una scheda senza
  foto"*. Su una scheda senza foto proprie le intruse sono proprio le
  miniature delle vetture simili, e su delorenziauto quelle miniature sono
  larghe 400. E' un ripiego che produce **le foto di un'altra auto con la
  faccia delle foto di questa** -- la terza forma della famiglia del dato
  mancante, in AGENTS.md.

**Non corretto, ed e' un lavoro a se'**: e' un difetto a video oggi (un'auto in
vetrina con le foto di un'altra), non una conseguenza della copia. La copia
non lo peggiora -- ogni auto avra' la sua copia della foto sbagliata -- ma lo
rende nostro. E tocca una regola della copia: "la stessa impronta su tre o
piu' origini diverse e' un segnaposto" scatterebbe anche su auto gemelle, se
il concessionario ricaricasse la stessa foto con nomi diversi. Va misurato
prima di fidarsi di quella soglia.

### Il controllo pagina per pagina (25/09/2026), e le due porte da cui entrano

**Come e' stato fatto, e si rifa' allo stesso modo.** Per ognuna delle 371
auto importate dai tre siti si e' aperta la sua pagina sul sito del
concessionario (una ogni quattro secondi per sito, con l'intestazione di
KeyAuto) e si e' preso l'elenco delle foto **di quella scheda**: quello del
blocco dati della pagina (`"image800"`) quando c'e', le foto in piu' misure
quando non c'e'. Poi, per ogni foto in archivio: sta in quell'elenco? E, come
seconda prova indipendente: sta anche nella galleria di un'altra auto? 294
pagine lette, 75 auto non piu' sul sito, 2 pagine andate in timeout (nessuna
delle loro foto e' condivisa con altre auto).

**Il risultato: 34 auto portano foto che non sono loro, 32 in vetrina, 175
righe**, e per ognuna le due prove dicono la stessa cosa -- ogni foto non sua
sta nella galleria di un'altra auto, e sulla pagina di quell'altra auto c'e'.
Di queste righe, **88 erano gia' state copiate** nel nostro archivio quando
sono state lette (14:33 UTC), dal primo giro cominciato alle 14:11: la copia
parte dalle copertine in vetrina, e 31 delle auto in vetrina qui sotto hanno
per copertina una foto non loro.

**La regola "stessa marca e stesso modello = riuso del concessionario" non
regge.** Degli 81 indirizzi presenti in piu' gallerie, **nessuno** sta sulla
pagina di tutte le auto che lo portano: 66 stanno sulla pagina di una sola --
38 fra modelli diversi, **28 fra auto dello stesso modello** -- e 15 non si
possono controllare del tutto perche' una delle auto non e' piu' sul sito.
Il motivo e' nel meccanismo: il carosello delle "vetture simili" mostra
proprio lo stesso modello, quindi una foto presa da li' somiglia a un riuso.
Con la sola regola della marca le due Hyundai Tucson di Autogepy, due Peugeot
208 di De Lorenzi e la 208 di Ponginibbi sarebbero passate per legittime.

**Le due porte.**

1. **Il ripiego del lettore** -- "se nessuna foto compare in piu' misure,
   prendile tutte". Porta 32 delle 34 auto: 29 De Lorenzi, 2 Autogepy, e una
   De Lorenzi fuori vetrina, tutte con **zero** foto proprie sulla pagina.
   **Spento il 25/09/2026**: un'auto nuova senza foto proprie non entra, una
   gia' in archivio continua ad aggiornarsi nei dati e la sua galleria resta
   com'e'. Resta com'e' **anche con le foto sbagliate**: la sincronizzazione non
   le toglie, perche' da una pagina senza foto proprie non ha niente con cui
   sostituirle. Vanno tolte sulle righe.
2. **Il carosello di Ponginibbi.** Su ogni pagina di `ponginibbigroup.it` ci
   sono 24 foto di altre auto **in piu' misure**, e passano la regola. Il
   lettore vero, eseguito sulle 74 pagine lette: prende sempre tutte le foto
   del blocco dati, piu' 24 (in tre pagine 3 o 23) che nel blocco non ci sono.
   Finche' un'auto ha almeno venti foto sue non si vede, perche' se ne tengono
   venti e le sue vengono prima; sotto le venti il carosello riempie i posti.
   Oggi sono due auto: la Citroen Ami (2 foto sue, 18 del carosello) e la
   Peugeot 208 10502399 (17 e 3). **Non corretto**: pulire le loro righe
   adesso non serve, la sincronizzazione le rimetterebbe al giro dopo. La
   strada e' leggere l'elenco del blocco dati della scheda, dove c'e': sugli
   altri due siti il lettore di oggi e quell'elenco coincidono su tutte le 188
   pagine che lo hanno (nessuna foto in piu', nessuna in meno), quindi li' non
   cambierebbe niente. Da fare prima: legare il blocco alla scheda con il suo
   identificativo, come fa gia' `bloccoDellaScheda` per la targa -- l'elenco
   delle foto sta in un altro oggetto della pagina, non in `vehicleData`.

**L'elenco, com'era il 25/09/2026 prima di qualunque pulizia.** Non si puo'
rifare dopo, ed e' per questo che sta qui.

| | concessionaria | auto | id sul sito | foto non sue | di cui copiate il 25/09 |
|---|---|---|---|---|---|
| in vetrina | Autogepy | Hyundai tucson | 9468503 | 6 su 6 (tutte, copertina compresa) | 1 |
| in vetrina | Autogepy | Hyundai tucson | 9719376 | 6 su 6 (tutte, copertina compresa) | 6 |
| in vetrina | De Lorenzi | Citroën Berlingo | 1000267768 | 3 su 3 (tutte, copertina compresa) | 3 |
| in vetrina | De Lorenzi | Citroën Berlingo | 1000368530 | 3 su 3 (tutte, copertina compresa) | 3 |
| in vetrina | De Lorenzi | Citroën C3 | 1000368534 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C3 | 1000442833 | 3 su 3 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C3 | 1000442834 | 3 su 3 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C3 | 1000442835 | 3 su 3 (tutte, copertina compresa) | 3 |
| in vetrina | De Lorenzi | Citroën C3 | 1000442839 | 2 su 2 (tutte, copertina compresa) | 2 |
| in vetrina | De Lorenzi | Citroën C3 | 1000461589 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C3 Aircross | 1000442836 | 4 su 4 (tutte, copertina compresa) | 4 |
| in vetrina | De Lorenzi | Citroën C3 Aircross | 1000442837 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C3 Aircross | 1000461592 | 4 su 4 (tutte, copertina compresa) | 4 |
| in vetrina | De Lorenzi | Citroën C4 | 1000253204 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C5 Aircross | 1000059569 | 5 su 5 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën C5 Aircross | 1000123693 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Citroën E-C4 | 1000059567 | 4 su 4 (tutte, copertina compresa) | 4 |
| in vetrina | De Lorenzi | Citroën JUMPER LCV | 10502408 | 5 su 5 (tutte, copertina compresa) | 5 |
| in vetrina | De Lorenzi | Citroën JUMPER LCV | 10725142 | 5 su 5 (tutte, copertina compresa) | 5 |
| in vetrina | De Lorenzi | FIAT Pandina | 1000410695 | 6 su 6 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | FIAT Pandina | 1000410696 | 6 su 6 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Fiat Professional Ducato | 10109843 | 1 su 1 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Honda ZR-V | 1000500726 | 8 su 8 (tutte, copertina compresa) | 8 |
| in vetrina | De Lorenzi | Mitsubishi Outlander | 1000457559 | 6 su 6 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Opel Corsa | 1000181517 | 4 su 4 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Opel Corsa | 1000461590 | 6 su 6 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Opel Frontera | 1000516148 | 8 su 8 (tutte, copertina compresa) | 8 |
| in vetrina | De Lorenzi | Opel Mokka | 1000382739 | 7 su 7 (tutte, copertina compresa) | 7 |
| in vetrina | De Lorenzi | Peugeot 2008 | 1000337175 | 8 su 8 (tutte, copertina compresa) | 4 |
| in vetrina | De Lorenzi | Peugeot 208 | 1000044302 | 7 su 7 (tutte, copertina compresa) | 1 |
| in vetrina | De Lorenzi | Peugeot 208 | 1000313074 | 8 su 8 (tutte, copertina compresa) | 6 |
| in vetrina | Ponginibbi | Citroën ami | 9798062 | 18 su 20 (carosello) | 0 |
| fuori | De Lorenzi | Citroën C3 | 1000442838 | 3 su 3 (tutte, copertina compresa) | 0 |
| fuori | Ponginibbi | Peugeot 208 | 10502399 | 3 su 20 (carosello) | 0 |

Le auto "tutte, copertina compresa" non hanno sul sito nemmeno una foto
propria: tolte le righe restano senza foto, e ne riprendono da sole quando il
concessionario le mette sul suo sito.

### Trovato leggendo, annotato e non corretto

**Ventuno test tolgono i commenti con un'espressione che vede un commento
anche dentro una stringa** (25/09/2026). `/\*[\s\S]*?\*/` apre un commento a
ogni `/*`, compreso quello di `"text/xml, */*"`, e lo chiude al primo `*/`
che trova piu' avanti -- anche centinaia di righe dopo. Si e' visto su
`sincronizzazioni-veicoli.test.ts`: il giorno che dopo l'intestazione
`Accept` della rotta del feed e' comparso un commento vero, il test ha tolto
516 righe di codice e non trovava piu' una frase che c'era. Quello e' stato
corretto (il commento comincia a inizio riga o dopo uno spazio). Gli altri
venti no: stringhe che innescano lo stesso difetto ci sono in `src/proxy.ts`
(la politica di sicurezza), `src/app/robots.ts` (`/*_rsc`) e
`src/lib/og-card.tsx` (`*/*`). **Il rischio vero sono i test "non deve
contenere"**: su un codice mangiato passano sempre, e nessuno se ne accorge.
Da rivedere tutti e ventuno insieme, con una funzione sola al posto di
ventuno copie.


**`/api/vehicles/feed` salva foto che il proxy non mostrerebbe.** Scarica le
foto di un feed nel nostro archivio con il percorso
`<id dell'auto>/<data>-<indice>.jpg`: due pezzi, e il proxy legge l'id
dell'auto dal secondo, quindi risponde "non trovata" a tutte. Non costa niente
oggi perche' quella porta non la chiama nessuno. Da decidere insieme alla sua
sorte, non dentro la copia.

**"Duplica" condivide il file della foto con l'originale.** Spostato in cima,
in *"Prima della prima copia"*: dopo la copia non e' piu' un caso raro ma il
comportamento di ogni duplicazione.

Il trigger `enforce_vehicle_image_dealer_id` confronta la concessionaria
dell'auto con `current_dealer_id()` usando `<>`. Senza sessione -- l'editor
SQL, la chiave di servizio -- `current_dealer_id()` e' vuoto, il confronto con
il vuoto non da' ne' vero ne' falso, e il trigger **lascia passare**. E'
quello che permette oggi alla sincronizzazione di scrivere le foto, e che
permettera' al programma di copia di fare lo stesso: funziona, ma **per
combinazione, non per costruzione** -- la stessa forma del vincolo della
migration che accettava una foto "copiata" senza impronta. Verificato sullo
schema ricostruito il 25/09/2026. Se un giorno si vuole che il trigger dica
esplicitamente "senza sessione passa", va scritto (`v_dealer_id is not null
and ...`) e provato con tutti e quattro i ruoli.

## Il lettore dei siti e' tarato su DealerK, non generico (25/09/2026)

Da tenere accanto al preventivo del lettore generico, quando si scrivera'.
Provato su una scheda vera di `robertoferrariauto.it` (sito GestionaleAuto),
passandola al nostro lettore (`parseDealerStockVehicle`): esce
**`nessun-dato-strutturato`**. Le barriere sono tre, una dietro l'altra, e
togliere la prima non basterebbe:

1. **l'elenco**: cerchiamo `auto_usate_0-sitemap.xml`, il nome che usa
   DealerK; su quel sito risponde 404 (e dal 25/09 il messaggio lo dice);
2. **i dati**: il lettore cerca il blocco dati di DealerK/MotorK nella
   pagina; GestionaleAuto non ce l'ha, e non pubblica nemmeno dati
   schema.org;
3. **le foto**: una foto si riconosce solo se l'indirizzo contiene
   `/dealer/datafiles/vehicle/images/`. Le foto di GestionaleAuto stanno su
   `graphics.gestionaleauto.com/gonline_graphics/<id>_E_<impronta>.jpg`:
   anche con i dati letti, ogni scheda uscirebbe `senza-foto` e verrebbe
   scartata.

Quindi "leggere un sito nuovo" non e' un ritocco del lettore di oggi: e' un
lettore per ogni fornitore, oppure uno generico che non si appoggi a nessuna
delle tre forme.

## Dove siamo rimasti (10/09/2026)

> **Sezione storica, superata.** I passi del suo *"Da dove riprendere"* che
> riguardavano lo schema sono chiusi: il controllo del 19/09/2026 e' verde,
> e un verde li' vuol dire che la produzione combacia con i file su tutte e
> tredici le famiglie. Resta aperto soltanto quello che non riguardava il
> database -- la decisione sui clienti con contatti collegati -- e non e'
> stato verificato qui. Per riprendere si legge la sezione **sopra**.

### Già applicato in produzione

- **Su `dealer_users` scrive solo il server** (`20260910120000`). Chiusa la
  falla che permetteva a un concessionario di chiudere fuori il titolare di
  un'altra concessionaria.
- **Via la deriva rimasta** (`20260910140000`): cancellata la tabella
  `storage_objects` (era vuota e non serviva a niente) e la regola
  `leads_inserimento_marketplace`, che non apriva niente ma confondeva.
- **L'inventario dello schema** (`20260910160000`), ma in una **versione
  vecchia**: quella incollata non guarda ancora i permessi di colonna, non
  vede il permesso `MAINTAIN` e confronta le funzioni carattere per
  carattere. Va reincollata (vedi sotto).

### Pronto nei file, non ancora applicato

Nell'ordine in cui va applicato. Nessuno di questi è urgente: **oggi non c'è
niente di rotto e nessuna porta aperta**.

| # | File | Cosa cambia in produzione |
|---|---|---|
| 1 | `20260910160000_inventario_dello_schema.sql` (da reincollare) | niente: sostituisce solo la funzione che il controllo interroga |
| 2 | `20260910170000_stati_come_in_produzione.sql` | **niente**: riscrive i due vincoli con la definizione che c'è già |
| 3 | `20260910190000_un_contatto_sopravvive_al_veicolo.sql` | **niente**: `leads.vehicle_id` è già così in produzione |
| 4 | `20260910200000_il_sito_pubblico_legge_soltanto.sql` | toglie ad `anon` scrittura e manutenzione su `vehicles`, `dealers`, `vehicle_images`. La lettura resta |
| 5 | `20260910180000_permessi_solo_quelli_usati.sql` | il più grosso: azzera e ridà i permessi su tutte e 34 le tabelle |

I numeri 2 e 3 servono solo perché **una ricostruzione da zero dai file**
(un ripristino, un ambiente nuovo) oggi romperebbe il CRM Lead, l'Agenda, e
cancellerebbe i contatti dei clienti insieme all'auto. Il numero 5 è quello
che cambia davvero qualcosa: ogni tabella passa da "tutti i permessi" a
"solo quelli che una schermata usa". Se una schermata che non abbiamo visto
usasse un comando tolto, l'errore sarebbe **rumoroso** («permission
denied»), non una perdita silenziosa, e accanto a ogni tabella nella
migration c'è scritto quale schermata usa cosa.

Ogni migration ha il suo **ritorno** in `supabase/ritorni/`, fuori dalla
cartella che la ricostruzione applica.

### Cosa abbiamo verificato

- **Il ritorno dei permessi è esatto.** Confrontato riga per riga con la
  fotografia letta dall'editor SQL: 519 permessi di tabella e 85 di colonna,
  **zero differenze**, `MAINTAIN` compreso (65 coppie tabella/ruolo).
- **`enforce_dealer_user_membership` in produzione è identica al file.** Con
  l'impronta che ignora spazi e commenti le due coincidono
  (`24bb4aba…`); l'unica differenza è una riga scritta su tre righe invece
  che su una. Con la vecchia impronta risultavano diverse: è la conferma che
  la normalizzazione serviva.
- **`enforce_lead_activity_dealer_id` non è nei file.** Esiste solo in
  produzione. Ha un punto debole teorico -- se `current_dealer_id()` è vuoto
  il confronto `<>` non scatta -- ma **le regole di accesso lo fermano
  comunque**: provato, un utente senza concessionaria che prova a scrivere
  nello storico di un contatto altrui viene respinto in tutti i casi. Per il
  server è voluto: il `dealer_id` lo prende dal contatto, che è la fonte
  giusta. **Nessuna rotta del server scrive in `lead_activities`**: la sola
  scrittura è quella del CRM dal browser, e il modulo contatti del sito non
  la tocca. Il permesso di esecuzione va tolto ad `anon` e `authenticated`,
  ed è sicuro: misurato che togliere l'esecuzione **non spegne il trigger**.
- **`email_queue` non spedisce niente.** Nessuna riga di codice la usa,
  nessuna funzione del database la nomina: è una tabella morta. Un
  concessionario non può usare il nostro mittente scrivendoci dentro. Il
  rischio era per il futuro: il giorno che qualcuno scrive il processo di
  invio, quel permesso aperto diventerebbe una porta vera. Per questo la
  migration la chiude adesso.
- **`audit_logs`: sì, la regola c'è** (`audit_logs_insert_own`), e lega la
  riga alla propria concessionaria e al proprio utente. Il permesso di
  inserimento è legittimo e serve: il registro lo scrive il gestionale con
  la sessione dell'utente. Resta.

### Difetto trovato, da correggere a parte

**La pagina Importazione mostra due sincronizzazioni finte.** Il riquadro
«Ultime sincronizzazioni» chiede lo storico a `/api/vehicles/import-feed`,
che lo cerca in tre tabelle (`vehicle_import_history`, `stock_sync_history`,
`import_history`) -- **nessuna delle tre esiste**. Quando non le trova
risponde con due righe inventate (`buildMockHistory`): 27 veicoli importati
un'ora fa, 19 ieri, da `https://www.concessionaria.it/feed.xml`. La risposta
porta un segnale `mock: true` che **la pagina ignora**. È lo stesso difetto
della barra del pannello (PR #146) e delle visualizzazioni (PR #172).

Non è stato corretto qui perché questa modifica parlava d'altro. Va deciso
se mostrare «Nessuna sincronizzazione disponibile» oppure salvare lo storico
davvero (le tabelle `import_*` esistono già in produzione e sono vuote).

### Decisioni aperte

**Clienti con contatti collegati.** In produzione, cancellare un cliente che
ha contatti collegati fallisce, e il concessionario vede il messaggio grezzo
del database in inglese. Nei file la regola era diversa (il cliente si
cancella e i contatti restano senza anagrafica). Ho lasciato la produzione
com'è, in attesa di una decisione.

*Consiglio: tenere il blocco* -- cancellare un cliente non deve poter
slegare in silenzio i suoi contatti -- e sostituire il messaggio inglese con
uno chiaro: «Questo cliente ha dei contatti collegati e non può essere
eliminato. Scollega prima i contatti, oppure archivia il cliente.» Da
notare: oggi **nessuna schermata collega un contatto a un cliente**, quindi
il caso si presenta solo su dati collegati a mano.

**Le altre differenze fra file e produzione** (una novantina) sono deriva
d'archivio: colonne di luglio che stanno solo in produzione, tipi diversi
(`engine_size` numero contro testo), indici e trigger `updated_at`. Non
rompono niente oggi; vanno messe nei file con una migration d'archivio,
decidendo caso per caso chi ha ragione. Quasi sempre la produzione.

### Da dove riprendere

1. Reincollare `20260910160000_inventario_dello_schema.sql` e lanciare il
   controllo. Aspettarsi **rosso**, con circa novanta differenze d'archivio:
   è normale, e serve a vedere quante impronte di funzione restano diverse
   davvero.
2. Applicare, in ordine, `20260910170000`, `20260910190000`,
   `20260910200000`, `20260910180000`. Dopo ciascuna, rilanciare il
   controllo.
3. Chiudere `enforce_lead_activity_dealer_id`: metterla nei file com'è in
   produzione e togliere il permesso di esecuzione ad `anon` e
   `authenticated`.
4. Decidere sui clienti con contatti collegati, e correggere lo storico
   finto della pagina Importazione.
5. Scrivere la migration d'archivio per il resto.

### Rileggere la fotografia della produzione

Serve per confrontare i ritorni con lo stato vero. Dall'editor SQL, con
**Download CSV**:

```sql
select 'versione' as tipo, version() as testo
union all
select 'funzione', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('enforce_dealer_user_membership', 'enforce_lead_activity_dealer_id')
union all
select 'ritorno', 'grant ' || x.privilege_type || ' on public.' || c.relname
  || ' to ' || pg_get_userbyid(x.grantee) || ';'
from pg_class c
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and pg_get_userbyid(x.grantee) in ('anon', 'authenticated', 'service_role')
union all
select 'ritorno', 'grant ' || x.privilege_type || ' (' || a.attname || ') on public.'
  || c.relname || ' to ' || pg_get_userbyid(x.grantee) || ';'
from pg_class c
join pg_attribute a on a.attrelid = c.oid
cross join lateral aclexplode(a.attacl) x
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and a.attnum > 0 and not a.attisdropped
  and pg_get_userbyid(x.grantee) in ('anon', 'authenticated', 'service_role');
```

Il risultato **non si committa**: contiene la mappa completa delle serrature.
Si legge, si usa, si cancella.

## La prova gratuita passa a trenta giorni (21/09/2026)

**È un cambio di prodotto deciso dal titolare, non la correzione di un
difetto.** Serve una migration perché **il database di oggi rifiuta una demo
di trenta giorni**: non con un valore predefinito che si possa scavalcare, ma
con un vincolo, `dealer_demo_subscriptions_extension_guard_check`, che
pretende una scadenza esattamente sette giorni dopo l'inizio.

**Da applicare:** `20260921120000_la_prova_dura_trenta_giorni.sql`.

### Cosa è stato verificato prima di consegnarla

Su un Postgres 17 in Docker, con lo schema ricostruito da zero da tutti i
file:

| cosa | risultato |
|---|---|
| la ricostruzione con la migration dentro | tutte le migration applicate |
| `configure_demo_profile` chiamata davvero | crea una demo di **30,000 giorni** |
| il percorso completo fino a `finalize_demo_activation` | **30,000 giorni**, stato `active` |
| chiamare `configure_demo_profile` due volte | `DEMO_CONFIG_NOOP`, come prima |
| una riga storica da 7 giorni | continua a entrare |
| una demo di 91 giorni | rifiutata dal controllo di buonsenso |
| **la migration eseguita tre volte di fila** | **riuscita tutte e tre** |
| il flusso completo girando come `service_role`, non da superutente | `DEMO_ACTIVATED`, 30,000 giorni |
| `authenticated` che prova a chiamare le funzioni della demo | `permission denied (42501)` |

E sulla produzione, in sola lettura: le **quindici** funzioni della demo e il
vincolo combaciano bit per bit con i file, quindi la migration parte da dove
crede di partire.

### Le righe già in archivio: niente da migrare

Quattro righe, tutte di **7,000 giorni esatti** e tutte già **convertite** in
un piano a pagamento: nessuna demo è in corso, quindi non c'è nessuna scadenza
da allungare. Sono i conti di prova del titolare — Autogepy, De Lorenzi,
Ponginibbi, Ferrari Automobili — che lo ha confermato per iscritto il
21/09/2026: **non esiste ancora nessun cliente pagante e la vendita degli
abbonamenti non è cominciata.**

### Tre cose verificate perche' il titolare le ha chieste (21/09/2026)

**La migration si puo' rieseguire.** Il terzo vincolo non aveva il
`drop constraint if exists` che hanno gli altri due: eseguita due volte si
sarebbe fermata con *"already exists"*. Corretto e provato eseguendola tre
volte di fila, non ragionandoci: riuscita tutte e tre. La versione senza il
`drop`, provata apposta, fallisce con quel messaggio esatto.

**Le colonne del vincolo non ammettono il vuoto**, verificato **in
produzione** e non solo nei file: `extension_used` e' `not null` con
predefinito `false`, `starts_at` e `expires_at` sono `not null`. Senza quella
garanzia il vincolo di coerenza rifiuterebbe le righe con `extension_used`
vuoto, e quello di durata **passerebbe in silenzio** su una data vuota,
perche' un CHECK che vale NULL e' soddisfatto. L'`is not null` esplicito e'
stato aggiunto **solo al secondo**: si mette la cintura dove il guasto e'
muto, non dove grida.

**Il `revoke` sulla funzione nuova non puo' rompere l'attivazione.** Le due
funzioni che la chiamano sono `security definer` (letto da `prosecdef`,
non dai file), quindi girano con i permessi del proprietario. Provato
girando come `service_role` -- il ruolo che usa davvero il server, **non da
superutente**, che avrebbe nascosto qualunque permesso mancante. E provato
anche al contrario: una funzione gemella `security invoker` chiamata da
`authenticated` viene **fermata** dal `revoke`, mentre la stessa resa
`definer` passa. Il permesso ha i denti, e le funzioni vere reggono per
costruzione.

### Il difetto che la migration incontra, e che va saputo

`extend_demo` dichiara di accettare una proroga da 1 a 7 giorni; il vincolo di
oggi ne accetta da 7 a 14. L'intersezione è **il solo 7**. Provato chiamando
la funzione vera dal ruolo `service_role`:

```
proroga di 3 giorni -> ECCEZIONE DEL DATABASE (violates check constraint)
proroga di 7 giorni -> risposta pulita: DEMO_EXTENDED
proroga di 8 giorni -> risposta pulita: DEMO_INVALID_DURATION
```

Non fa danni oggi: **nessuna riga di codice chiama `extend_demo`**, il
pulsante non esiste. La migration non tocca quella funzione, ma togliendo la
durata dal vincolo le sei durate che si schiantavano cominciano a funzionare.
È una conseguenza, non una correzione nascosta, ed è scritta anche nel
commento della migration. Se per una prova di trenta giorni la finestra di
proroga 1..7 non è più quella giusta, è una riga in `extend_demo` e una
decisione del titolare.

### Il giorno che la durata cambierà di nuovo

Due righe, e un controllo che se ne accorge se se ne dimentica una:

1. `GIORNI_DI_PROVA` in `src/lib/durata-della-prova.ts`;
2. l'`interval` dentro `public.durata_della_prova()`, in una migration nuova.

`src/lib/durata-della-prova.test.ts` fallisce se le due dicono numeri diversi,
e fallisce anche se qualcuno scrive la durata a mano da qualche altra parte.

## La sincronizzazione caduta del 21/09/2026, e i log che solo il titolare ha

**Il fatto.** Il giro delle 12:00 UTC (run #172) è caduto con un `exit code 28`
e **nessun altro messaggio**: cinque minuti di silenzio nel log, sei chiamate
su venti fatte, le altre quattordici mai partite.

**La causa, chiusa dai log di Vercel.** Le sei chiamate risultano tutte con
esito **200**: ogni cosa che il nostro codice ha eseguito è andata a buon
fine. Della settima **non c'è traccia**, quindi non è mai arrivata alla
funzione. Era un pacchetto perso su internet: la connessione non si è mai
stabilita, e il sistema operativo ha ritentato il saluto per circa due minuti
prima di arrendersi — `curl` lo riporta come 28, lo stesso codice del tempo
scaduto, il che rende i due guasti indistinguibili da fuori.

**E qui sta il precedente, che vale più dell'episodio: ci sono domande che
senza il titolare non si possono chiudere.** Leggendo il codice erano uscite
quattro ipotesi di colpa nostra, tutte plausibili e tutte sbagliate. Le mie
tre fonti — il log di GitHub, il database di produzione, il codice — **non
potevano dire se la settima chiamata fosse arrivata**. La quarta fonte, i log
di Vercel, la vede solo il titolare.

La regola operativa: **davanti a un guasto di rete, prima di dedurre dal
codice si chiede se la traccia esiste da un'altra parte.** Costa un messaggio
e chiude in un minuto una domanda su cui si può ragionare per ore arrivando
alla risposta sbagliata.

**Cosa è stato corretto.** Non la causa, che non è correggibile: la
conseguenza. Una chiamata caduta non ferma più il giro, dice **perché** è
caduta in italiano, e un `--connect-timeout 20` riduce da 133 a 20 secondi il
costo di un saluto senza risposta. Le prove stanno nella PR.

### Il banco di prova della sincronizzazione, e perche' e' entrato nel progetto

`scripts/prova-sincronizzazione/` -- e la decisione di tenerlo va scritta,
perche' **un banco che nessuno usa e' codice morto da mantenere**, ed e' un
costo vero.

**Perche' entra, e questo e' l'argomento che regge fra sei mesi quando
qualcuno vorra' togliere una cartella che "non serve": il banco non e'
impalcatura, e' l'unico test che quel pezzo abbia mai avuto.**

Il passo "Riallinea lo stock" e' uno script bash dentro un YAML, e **nessun
test di questo progetto puo' toccarlo**: Vitest legge TypeScript. Quello e'
l'unico pezzo di codice che decide se lo stock dei concessionari resta
allineato -- e che, cadendo, puo' lasciarlo fermo per ore senza dirlo. E'
l'unica superficie del progetto senza nessuna rete.

**Cosa ha preso, il giorno in cui e' nato.** Quattro miei errori in una
giornata, tre dei quali non li avrei visti:

| l'errore | come sarebbe finita |
|---|---|
| le prove giravano sulla **versione precedente** dello script | avrei consegnato una correzione dichiarandola provata, e non c'era |
| il finto endpoint moriva dopo la prima chiusura forzata | avrei attribuito al workflow difetti che erano suoi |
| riscrivevo lo script mentre bash lo leggeva | *"errore di sintassi nel workflow"* — su un file sintatticamente valido |
| il caso sano perdeva il primo giro | il finto endpoint non era ancora in ascolto: `sleep 1` invece di aspettare la condizione |

E ne ha trovati **tre nel codice vero**, tutti dopo che le prime dieci prove
erano gia' verdi: il giro che avrebbe sfondato i trentasei minuti, la risposta
illeggibile che non alimentava i conti, e il file di risposta che avvelenava
il riepilogo.

**Il quarto non l'ha trovato il banco, e attribuirglielo lo faceva sembrare
migliore di quello che e'.** La fermata per rete che lasciava il lavoro verde
da sei giri in poi l'ha trovata una **rilettura ostile, dopo** che le prove
erano gia' passate -- il commento nel workflow lo dice con precisione, e
questa riga diceva il contrario. Corretto il 23/09/2026, ed e' esattamente la
ragione per cui i due modi di cercare difetti servono tutti e due: il banco
prende cio' che si puo' eseguire, la rilettura prende cio' che si puo' solo
leggere.

**Quanto costa.** Trentasei minuti a esecuzione, **a mano**, e solo quando
si tocca quel workflow. Non gira nella CI, e la ragione e' misurata: i casi
veri hanno dentro i tetti di tempo veri (180 secondi per una risposta che non
arriva, 15 di pausa dopo ogni caduta). Accorciarli per farlo stare in CI
vorrebbe dire provare uno script diverso da quello che gira in produzione --
l'**oggetto adiacente**, che in questo progetto ha gia' fatto danni.

**Quanto e' costato ricostruirlo:** una buona parte del 21/09/2026, e gli
stessi quattro inciampi uno dopo l'altro. Sono facili, e chi riaprira' quel
workflow li rifarebbe.

**Se un giorno lo si toglie**, la cosa da non perdere sono i suoi **tre
controlli** -- *sto provando la cosa giusta?*, *e' cambiato mentre girava?*,
*ha prodotto il caso che volevo?* -- e la riga che dichiara **cosa non
coprono** (nessuno verifica che l'esito sia letto bene). Senza quelli un
banco non vale niente: e' un altro modo di darsi ragione da soli.

## Le chiamate al database non hanno nessun tetto di tempo (21/09/2026)

**È il primo della lista, e la ragione per cui sta in cima è questa: oggi non
ha fatto danni perché il pezzo appeso era un altro — è stata la fortuna, non
il disegno, e la forma è identica a quella del guasto di oggi: qualcosa che
aspetta senza limite.**

Il 21/09/2026 la sincronizzazione delle 12:00 UTC è caduta con un `exit 28`
muto. Cercandone la causa sono uscite quattro ipotesi di colpa nostra, e i
log di Vercel le hanno eliminate tutte — la settima chiamata non è mai
arrivata alla funzione, quindi nessun nostro codice si è bloccato. Ma una di
quelle quattro non era un'ipotesi: era una lettura del codice.

**Ogni chiamata al database, lungo tutto il percorso della sincronizzazione,
può aspettare per sempre.** La lettura delle pagine dei siti un tetto ce l'ha
— 15 secondi per due tentativi, in `dealer-site-fetch.ts` — e l'endpoint si dà
un budget di 45 secondi. Ma quel budget lo si guarda **fra una scheda e
l'altra**: se è una richiesta a Supabase a non tornare, nessuno lo legge più,
e la funzione resta appesa finché non la uccide la piattaforma.

E `maxDuration = 60` non è la rete di sicurezza che sembra: è una richiesta a
Vercel, non una serratura nostra. La regola sta in
[AGENTS.md](../AGENTS.md), sotto *"Un attributo che delega al browser una
decisione non e' una garanzia, e' una richiesta"* -- il titolo vero, che
citato a memoria non si trovava.

**Cosa fare, quando ci si arriva:** un tetto di tempo esplicito sulle chiamate
al database, dello stesso ordine di quello sulle pagine dei siti, e la
distinzione fra "il database non ha risposto" e "il sito non ha risposto" nel
messaggio di errore — che oggi sono indistinguibili.

Le altre tre emerse quella mattina sono minori e stanno qui per completezza:
il client Supabase ritenta da solo in silenzio e rispetta un `Retry-After`
senza alcun tetto; la risoluzione dei nomi non ha un limite proprio; e il
primo passo della sincronizzazione — quello delle sparizioni — non guarda mai
l'orologio, quindi da solo può consumare l'intero budget.

## Applicarne una

1. Apri **supabase.com** e il progetto di KeyAuto.
2. Menu di sinistra → **SQL Editor** → **New query**.
3. Incolla il contenuto del file `.sql` indicato dal controllo.
4. **Run**. La risposta attesa è `Success. No rows returned`.
5. **Rilancia il controllo**, e non è un passo facoltativo: su GitHub, scheda
   **Actions** → nella colonna di sinistra *Lo schema di produzione combacia
   con i file* → il bottone **Run workflow** in alto a destra → di nuovo **Run
   workflow**. Verifica che diventi verde.

   **Finché non lo rilanci, il rosso resta appeso anche se la produzione è già
   allineata.** Il controllo parte da solo soltanto quando cambiano i file
   delle migration, e quelli sono già cambiati prima che tu applicassi: il
   momento in cui la differenza sparisce non fa scattare niente. Nessun altro
   lo rimetterà a posto fino al lunedì.

Applica i file **in ordine di data**, dal più vecchio al più recente: alcuni
danno per scontato quello che ha fatto il precedente.

**Perché il motivo è stato aggiunto il 19/09/2026.** Il passo 5
c'era già, con lo stesso percorso di clic, e quel giorno non è stato fatto: la
vista `vetrina_per_concessionaria` è stata applicata poco dopo le 09:17 e il
rosso è rimasto su `main` per ore, su una produzione che nel frattempo
combaciava. Un passo senza il motivo si legge come una cortesia e si salta; con
il motivo si capisce che saltarlo lascia un allarme acceso su una cosa a posto,
che è il modo in cui si smette di leggerli.

## Perché non le applichiamo automaticamente

La strada ovvia sarebbe `supabase db push` a ogni merge. È vietata dalle regole
del progetto (`.github/instructions/supabase.instructions.md`) e il motivo è
concreto.

`db push` applica ogni migration che il database di produzione non ha
registrato come già eseguita. Se quel registro fosse incompleto — e ci sono
indizi che lo sia — rieseguirebbe la storia dall'inizio. La maggior parte dei
file è innocua a riapplicarsi: creano tabelle e colonne solo se mancano.

Ma **dodici migration toccano i dati**, non solo la struttura. Una di queste
cancella righe da `profiles`. Riapplicarla su un database pieno non è un errore
recuperabile.

## Cosa servirebbe per automatizzarle davvero

Non è impossibile, è un lavoro da fare in ordine:

1. Attivare il controllo qui sopra e **guardare cosa dice**: è la prima volta
   che sapremmo con certezza quali migration la produzione considera applicate.
2. Se il registro è incompleto, allinearlo dichiarando come già applicate
   quelle che lo sono (`supabase migration repair`). È il passaggio delicato e
   va fatto guardando i dati veri.
3. Solo dopo, con il registro affidabile, `db push` diventa sicuro — e la
   regola del progetto si può cambiare di conseguenza.

Il passo 1 è quello che questo controllo rende possibile.

## Chi puo' scrivere su `dealer_users` (10/09/2026)

**Oggi la difesa principale e' che la registrazione autonoma e' disattivata**
(`disable_signup: true` su Supabase). Nessuno crea da se' un account con una
concessionaria: li crea il titolare attivando una demo. Finche' e' cosi', per
usare il buco descritto qui sotto servirebbe un account concessionario
consegnato a mano.

Il buco, provato in laboratorio l'10/09/2026 riproducendo lo stato esatto
della produzione: un concessionario collegato poteva **chiudere fuori dalla
propria concessionaria il titolare di un'altra**, in due mosse -- inserire
l'altro account come `invited` (il limite di un utente per piano ignora le
righe non attive), poi con un solo comando sospendere se stesso e attivare
l'altro. La vittima si ritrova con due appartenenze attive, e
`current_dealer_id()` risponde solo quando ne trova **esattamente una**.
Otto tentativi su otto riusciti.

Chiuso da `20260910120000_dealer_users_solo_il_server_scrive.sql`: via i
permessi di scrittura ad `authenticated`, una sola regola di lettura sulla
propria riga, trigger severo e i due vincoli mancanti. Dopo: zero su otto.

**Se un giorno si riattiva la registrazione autonoma, o si vende un piano con
piu' di un utente, questa correzione deve essere gia' applicata.** Sono le due
condizioni che oggi tengono chiuso il buco dall'esterno; tolte quelle, resta
solo il database.

`20260717000003` conteneva gia' questa correzione e non e' mai arrivata in
produzione, **e non poteva**: contiene un riempimento dati con
`insert ... on conflict`, e Postgres fa scattare il trigger BEFORE INSERT
prima di accorgersi che la riga esiste. Il limite di un utente per piano --
nato dieci giorni dopo -- la respinge su ogni concessionaria che ha gia' un
utente attivo. In una ricostruzione da zero l'ordine e' l'inverso e funziona.

## Ogni tabella nuova dichiara i suoi permessi (10/09/2026)

Supabase regala ad `anon`, `authenticated` e `service_role` **tutti** i
permessi su ogni tabella creata dall'editor SQL, TRUNCATE compreso. Il
10/09/2026 il confronto con la produzione ne ha contati 121 di troppo, e in
otto casi l'accesso dal browser passava davvero -- sette scritture e una
lettura, su `email_queue`, `email_delivery_events` e `notifications`.

`20260910180000_permessi_solo_quelli_usati.sql` azzera e ridà, tabella per
tabella, solo ciò che il codice usa. Da allora la regola è: **una migration
che crea una tabella fa subito `revoke all ... from public, anon,
authenticated`, concede ad `authenticated` (o `anon`) solo i comandi che una
schermata usa, e concede `grant all ... to service_role`** -- perché la
ricostruzione usata dal controllo non copia i permessi predefiniti di Supabase,
di proposito. Una tabella che non lo fa esce rossa il lunedì dopo.

Tre difese vivono nei permessi di colonna, e vanno rimesse se si tocca la
tabella con un `revoke all`: le colonne pubbliche di `vehicles` e `dealers`
(quello che il sito legge senza login), e le colonne aggiornabili di
`dealers` e `profiles` (tutto tranne piano, stato dell'abbonamento, ruolo e
concessionaria). Sono nella stessa migration, per esteso.

## La deriva dello schema non e' cronica: scende quando la si affronta

Si e' raccontata a lungo come un problema fisso -- "ci sono sempre state delle
differenze". Non e' vero, e i numeri del controllo settimanale lo dicono:

| quando | differenze | cos'era successo |
|---|---|---|
| 10/09/2026, 11:51 | **385** | prima esecuzione del controllo che guarda lo schema vero |
| 11/09/2026 | **126** | applicate cinque migration (`20260910160000`, `170000`, `180000`, `190000`, `200000`) |
| 14/09/2026 | **121** | tolte le dieci tabelle senza codice, e con loro cinque trigger che stavano solo in produzione |

Da 385 a 121 in quattro giorni, **due terzi nei primi due**. Il debito non
cresce da solo e non resta fermo: scende ogni volta che qualcuno ci lavora, e
sale solo quando si tocca il database a mano senza scriverlo nei file.

Vale la pena tenerlo a mente quando il controllo settimanale e' rosso: il
numero non e' una condanna, e' una misura. E si legge in un posto solo, il
riepilogo dell'esecuzione su GitHub, dove l'elenco completo delle differenze e'
gia' stampato riga per riga -- non va ricostruito, va letto.

## Perche' il ripristino va provato, e non soltanto scritto

Il 14/09/2026, ricostruendo lo schema da zero per confrontarlo con la
produzione, e' saltato fuori questo: **`vehicles.registration_date` in
produzione e' una `date`, e nei file e' `text`.**

Nasce cosi' in `20260702_add_power_kw_and_registration_date_to_vehicles.sql`;
in produzione qualcuno l'ha poi corretta a mano e non l'ha scritto nei file.
Finche' il database vero regge, non se ne accorge nessuno.

**Cosa sarebbe successo dopo un ripristino.** Una data scritta come testo non
si ordina per data, si ordina per lettera: `"09/2025"` verrebbe **prima** di
`"1/2024"`, perche' `0` viene prima di `1`. L'elenco delle auto ordinato per
immatricolazione avrebbe mostrato le vetture in un ordine sbagliato, e i
filtri "dal 2023 in poi" avrebbero risposto male. **Senza nessun errore**:
solo auto nell'ordine sbagliato, che nessuno avrebbe collegato al ripristino
di tre settimane prima.

E' la forma peggiore di difetto che questo progetto conosca: plausibile,
silenzioso, e con la causa lontanissima dall'effetto. Insieme a lei sono
emersi `vehicles.engine_size` e `demo_requests.vehicle_count`, numeri scritti
come testo per lo stesso motivo.

**Percio' il ripristino si prova**, non si dichiara: `scripts/ricostruisci-schema.sh`
su un Postgres 17 vuoto, poi `scripts/confronta-schema.mjs` contro la
produzione. Chiuse in `20260914070000_i_file_raccontano_le_colonne_come_sono.sql`.

## La decodifica a pagamento e' rimandata (14/09/2026)

**Non si compra, e non si costruisce la tabella di cache che la servirebbe.**
E' scritto qui perche' la migration della cache era gia' in elenco, e chi la
trovera' fra sei mesi deve sapere perche' non e' stata fatta.

**Il motivo.** Le pagine dei siti delle concessionarie pubblicano gia' un
blocco dati di MotorK da 341 campi, e la sincronizzazione notturna **scarica
gia' quelle pagine**. Misurato il 14/09/2026 su 126 schede dei tre siti
collegati: marca, modello, allestimento, data di immatricolazione,
chilometri, alimentazione, potenza, cilindrata, CO2, porte, posti e colore
arrivano **gratis e al 100%** dai due siti che pubblicano il blocco ricco.
Comprarli sarebbe pagare per un dato che gia' abbiamo.

Quello che la decodifica darebbe in piu' -- storico chilometrico e antifrode
-- ha bisogno della **targa**, che su quei due siti non c'e' affatto (0 su
105 schede). Pagheremmo un servizio che non potremmo nemmeno interrogare.

**La condizione che la fa tornare sul tavolo: il primo cliente che non sta su
MotorK.** Quel giorno il suo sito non pubblichera' nessun blocco ricco, e i
dati tecnici andranno presi da qualche parte. Fino ad allora ogni euro speso
e' speso per niente.

Due cose da non fare nel frattempo:

- **non ricomprarla "perche' c'era nel piano"**: il piano e' cambiato il
  14/09/2026 e questa e' la ragione;
- **non costruire la cache in anticipo.** Una tabella di cache senza niente
  da mettere dentro e' una delle dieci tabelle fantasma che questo progetto
  sta gia' togliendo.

La rotta `/api/vehicles/plate-lookup` resta dov'e' e continua a funzionare:
serve alle auto inserite a mano, che al 14/09/2026 sono **2 su 372**.

## Un dato dedotto vale meno: la prova sui numeri veri (18/09/2026)

La prima misura del lettore del blocco ricco, dopo tre giri notturni, ha dato
**da 3 a 192 date di immatricolazione** senza che nessuno digitasse niente:
Autogepy 114 su 122 rilette (93%), Ponginibbi 78 su 78, De Lorenzi 0 su 76
perche' il suo sito manda solo il blocco magro -- e lo zero e' il risultato
giusto, non un difetto. Ma le due cose che valgono piu' della tabella sono
sulla **data d'ingresso in piazzale**, e spiegano con numeri veri cosa vuol
dire *"un dato dedotto vale meno"*.

**1. Per Autogepy la giacenza vera dal sito non si sapra' mai.** Tutte le 116
date d'ingresso lette dal suo sito sono *dedotte* (`enteredInStockDate` uguale
a `dateCreated`: la data nasce con la scheda), e **19 auto su 116 portano la
stessa data, 18/06/2026** -- il giorno in cui il fornitore ha ricreato le
schede, non il giorno in cui le auto sono entrate. Una data cosi' e' un
limite inferiore, non una misura: si mostra come *"in vetrina sul tuo sito da
almeno N giorni"*, mai come *"in piazzale da N giorni"*, e la data vera si
chiede al concessionario. Fingere di saperla sarebbe la barra del pannello
(PR #146) con un altro vestito.

**2. Il controllo di attendibilita' ha scartato 10 date, e ha fatto il suo
mestiere.** Su Ponginibbi 68 date sono entrate e 10 no: il lettore le ha
rifiutate perche' precedevano l'immatricolazione di 128-680 giorni
(`ingressoAttendibile` in `src/lib/blocco-motork.ts`). Lette a mano sulle
pagine: **tre delle dieci hanno la stessa data, 25/06/2024, altre due il
20-21/07/2023** -- caricamenti in blocco nel gestionale del fornitore, non
ingressi in piazzale. Le 68 accettate hanno **59 date distinte**: il segno che
sono vere. E' la prova che serviva: un controllo che non avesse mai scartato
niente non si sarebbe potuto dire che guardava (vedi in AGENTS.md *"un
controllo che non e' mai diventato rosso"*).

La regola che ne esce, per chiunque tocchi questi dati: **la qualita' viaggia
con il valore** (`origine_dati.entered_on.fonte`: `sito` oppure `dedotto`), e
la schermata sceglie la frase in base a quella. Due frasi diverse per due
cose diverse, e la seconda non promette mai piu' di quello che sa.

## Il prezzo minimo che non esisteva (19/09/2026)

La vista `vetrina_per_concessionaria` e' stata applicata in produzione e
verificata: **135, 93 e 50 veicoli** per le tre concessionarie, e il prezzo
minimo di De Lorenzi e' passato da **7.500 € a 5.800 €**.

Vale la pena raccontarla per intero, perche' e' il senso di tutto il lavoro
di quella mattina.

La pagina della concessionaria caricava le prime **trecento** auto e su
quelle calcolava tre numeri: quanti veicoli, il prezzo medio e il prezzo
minimo. Sotto le trecento il conto tornava, e infatti tornava -- oggi la piu'
grande ne ha centotrentacinque. Ma il prezzo minimo non e' un conteggio: e'
un **estremo**, e un estremo calcolato su una parte dell'elenco e' sbagliato
appena l'elenco viene ordinato in un modo qualsiasi che non sia il prezzo.
L'elenco era ordinato per data. Il Ducato a 5.800 € stava fuori dalla
finestra, e la scheda annunciava **"a partire da 7.500 €"**.

**Non c'era nessun errore da nessuna parte.** Nessuna eccezione, nessun log,
nessuna riga rossa: solo un limite in una richiesta, scritto per una buona
ragione (trecento schede sono gia' tante da scorrere) e usato per una cosa
per cui non valeva.

Una precisazione che conta, perche' la prima versione di questa nota diceva
di piu' di quello che era stato verificato: **le auto sotto gli 8.000 € si
trovavano lo stesso**. La ricerca del marketplace filtra il prezzo nel
database, non sull'elenco caricato, e cinque auto sotto quella soglia --
5.800, 6.475, 7.500, 7.800, 7.900 -- sono state ritrovate una per una
interrogando la produzione con la sola chiave pubblica. Quello che era falso
era il **biglietto da visita della concessionaria**: chi apriva la pagina di
De Lorenzi leggeva che si parte da 7.500 e poteva chiudere li'. E' meno grave
di "sparite dalla ricerca", ed e' esattamente lo stesso difetto.

La correzione: i conteggi si fanno **nel database**, con una vista. Due cose
da sapere prima di scriverne un'altra.

**I conteggi di PostgREST su questo progetto sono spenti.** La strada ovvia --
chiedere `min(price)` direttamente dall'interrogazione -- risponde
`PGRST123: "Use of aggregate functions is not allowed"`. E' una difesa
ragionevole (un estraneo non deve poter far macinare l'intero archivio con
una richiesta), e non si tocca: la vista e' la strada giusta anche per
questo, perche' il conto lo decide chi scrive la migration, non chi chiama.

**`with (security_invoker = on)` e' la riga che conta.** Senza, la vista gira
con i permessi di chi l'ha creata e le protezioni per riga delle tabelle che
legge **non valgono**: sarebbe una porta sullo stock di tutte le
concessionarie aperta senza toccare nessuna politica, e nessun controllo
sarebbe diventato rosso. Con quella riga la vista gira con i permessi di chi
la chiama. Adesso c'e' un test che lo pretende per ogni vista futura
(`src/lib/viste-con-security-invoker.test.ts`).

## Undici pagine su dodici dicevano a Google di ignorarsi (20/09/2026)

Misurato andando a scrivere la paginazione di `/ricerca` -- **una cosa che
era gia' fatta**.

| | |
|---|---|
| auto pubblicate | **276** |
| pagine di risultati (24 per pagina) | **12** |
| auto raggiungibili dalla pagina 1 di `/ricerca` | 24 |
| auto che stavano **solo** nelle pagine 2-12 | **252, il 91%** |

Quelle undici pagine portavano tutti e due i segnali sbagliati insieme:
**`noindex`**, perche' `?page=2` finiva fra le combinazioni di filtri, **e**
`canonical` alla pagina 1, cioe' "sono un doppione di qualcos'altro".

**Quanto grande fosse il danno, detto con precisione.** La prima versione di
questa nota diceva "il 91% del catalogo era raggiungibile solo da pagine che
chiedevano a Google di ignorarle, il danno piu' grande che avessimo". Il
numero e' giusto, la conclusione no, e la differenza si e' vista solo
misurando i percorsi -- fatto subito dopo, seguendo i collegamenti come
farebbe Googlebot:

| da dove | schede raggiungibili |
|---|---|
| `/auto`, 12 pagine (convenzione **gia' giusta**) | **276** |
| le 3 pagine delle concessionarie | **276** |
| `/ricerca`, 12 pagine | **276** |
| `sitemap.xml` | **276** su 296 voci |

Quindi quelle 252 automobili **non erano invisibili**: erano nella sitemap e
raggiungibili da altri due percorsi corretti. Il difetto ha rotto **uno dei
quattro percorsi** -- quello che avrebbe dovuto posizionarsi sulle ricerche
-- non l'accesso al catalogo. E' un difetto vero e andava chiuso; non era il
peggiore che avessimo.

**La lezione invece regge intera, ed e' la parte da ricordare: la
paginazione c'era, e sembrava a posto.** Aveva le pagine, gli indirizzi, i
bottoni Precedente e Successiva, il conteggio "Pagina 3 di 12". Aperta da
una persona funzionava perfettamente. Il difetto **non era l'assenza di una
funzione: era una funzione presente che diceva al mondo di ignorare quello
che mostrava.**

Una funzione mancante si nota -- qualcuno la chiede. Una funzione che
funziona e si auto-annulla non la nota nessuno, perche' tutti la guardano
dal lato da cui funziona. Da cui due abitudini:

1. **prima di costruire una funzione, si guarda se c'e' gia'.** Qui il
   lavoro chiesto era "fai la paginazione": la paginazione c'era, e il tempo
   e' andato tutto sul difetto vero. Costruendola da zero senza guardare,
   oggi ce ne sarebbero **due** e il difetto sarebbe ancora li';
2. **di una funzione che c'e' si controlla anche cosa dichiara**, non solo
   cosa fa. Per una pagina pubblica: l'indirizzo canonico, `robots`, e se
   chi indicizza puo' arrivarci. Sono tre righe di HTML che nessuno guarda
   mai usando il sito.

E una terza, che viene dalla correzione di questa stessa nota: **"quante
cose sono rotte" e "quanto costa" sono due domande diverse.** Il 91% era la
prima. La seconda si risponde solo guardando se esiste un'altra strada -- e
qui ce n'erano tre.

## Il quadro dell'indicizzazione, e le due pagine servite fredde (20/09/2026)

Fatto subito dopo la correzione qui sopra, **senza toccare niente**, per
sapere da dove si parte prima di guardare Search Console. Misurato sul sito
vero, `www.keyauto.it`, non in locale.

**Le 276 schede sono raggiungibili da quattro strade**, e nessuna resta
fuori:

| da dove | schede |
|---|---|
| `/auto`, sfogliando le sue 12 pagine | 276 |
| le 3 pagine delle concessionarie | 276 |
| `/ricerca`, sfogliando le sue 12 pagine | 276 |
| `sitemap.xml` (296 voci: 276 schede + 3 concessionarie + 17 pagine fisse) | 276 |

Zero schede nella sitemap che nessun collegamento raggiunge, zero schede
collegate che la sitemap non elenca.

**Ogni pagina pubblica dichiara un canonico che punta a se stessa**, la home
compresa. Le uniche che puntano altrove sono le ricerche con i filtri, che
vanno su `/ricerca` e portano anche `noindex, follow`: e' voluto, perche' la
citta' e' a testo libero e le combinazioni sono infinite. `robots.txt` blocca
solo le aree riservate e dichiara la sitemap.

**Il punto aperto: `/auto` e `/ricerca` sono le uniche pagine pubbliche
ricalcolate a ogni richiesta.** Tutto il resto viaggia con una copia
conservata; queste due no, e sono **ventiquattro pagine** in tutto -- che
fanno venticinque indirizzi, perche' la prima pagina di `/auto` esiste anche
come `?page=1` (collegata dal "precedente" della seconda) e dichiara
correttamente `/auto` come canonico.

| | come viene servita | tempo (tre letture) |
|---|---|---|
| una scheda auto | copia conservata, pagina gia' pronta | 0,09-0,17 s |
| una pagina di concessionaria | copia conservata, pagina gia' pronta | 0,09-0,17 s |
| `/auto` e le sue 12 pagine | ricalcolata sempre (`no-store`) | 0,40-0,61 s |
| `/ricerca` e le sue 12 pagine | ricalcolata sempre (`no-store`) | 0,63-1,08 s |

E' **la stessa condizione del 06/09/2026** -- pagina fredda contro pagina
pronta, che e' testualmente lo stato *"Rilevata, ma attualmente non
indicizzata"* -- spostata dalle destinazioni ai percorsi.

**Perche' non e' stato deciso niente, e l'attenuante detta per intero.**
La sitemap porta a tutte e 276 le schede **senza passare di li'**, quindi per
*trovarle* quelle ventiquattro pagine non servono: servono per il peso dei
collegamenti interni e per accorgersi degli arrivi nuovi.

**Ma l'attenuante regge meno di come e' stata raccontata la prima volta, e la
differenza va scritta qui e non in una nota piu' sotto.** Anche la sitemap e'
ricalcolata a ogni richiesta -- `x-vercel-cache: MISS` e `age: 0` su ogni
lettura, 0,46-1,00 s, misurato tre volte -- perche' e' `force-dynamic` per
scelta, cosi' una scheda nuova compare subito. Quindi la frase giusta non e'
*"c'e' una strada calda che evita quelle fredde"*: e' **"la strada che le
evita e' anch'essa fredda, ma e' una sola richiesta invece di
ventiquattro"**.

E' un'attenuante di **quantita'**, non di natura. Chi indicizza paga una
pagina lenta per sapere di tutte e 276 le schede, invece di ventiquattro per
la stessa informazione: resta un vantaggio grande, e resta il fatto che
**nessuna delle due strade e' pronta quando la si chiede**.

**La condizione era stata scritta prima di guardare il numero, apposta. Poi
il numero e' arrivato, e ha risposto: non sono queste.** I quattro esportati
di Search Console, al 14/09/2026, stanno nel capitolo qui sotto.

**Tre cose emerse facendo verificare questo quadro da capo**, e la prima
toglie un po' di forza all'attenuante:

1. **anche la sitemap e' ricalcolata a ogni richiesta.** La misura e le
   conseguenze stanno qui sopra, dentro l'attenuante: e' li' che servono, e
   una nota in fondo l'avrebbe lasciata detta a meta';
2. **"in cache" non si riconosce dalla parola `HIT`.** Sulla stessa scheda
   compaiono `HIT`, `STALE` e `PRERENDER` a seconda del momento, e vogliono
   dire tutti e tre la stessa cosa che conta: la pagina **non e' stata
   ricalcolata**. L'unico segno stabile e' `x-nextjs-prerender: 1`. Chi
   scrivera' un controllo su questo non pretenda `HIT`, o lo vedra' diventare
   rosso su una pagina sana;
3. **`robots.txt` scrive `Disallow: /dashboard/` con la barra finale, e
   `/dashboard` senza barra non e' coperto.** Vale per tutte e diciannove le
   sezioni riservate, cioe' proprio le pagine d'ingresso. **Oggi non e' un
   buco** perche' regge l'altra serratura, quella che conta di piu': il proxy
   manda `x-robots-tag: noindex, nofollow` su `/dashboard` e su `/login`, e
   non lo manda su nessuna pagina pubblica -- verificato su sei pagine
   pubbliche e due riservate. E' pero' la forma *"una regola applicata a
   meta'"*: la riga e' scritta e il percorso che vale davvero non lo tocca.
   **Trovato il 20/09/2026 e non corretto**, perche' e' fuori dallo scopo
   della modifica che l'ha fatto emergere; si chiude con una riga in
   `src/app/robots.ts` che emette sia `/dashboard` sia `/dashboard/`.

## Cosa dice davvero Search Console, e cosa non dice (14/09/2026)

I quattro esportati, arrivati il 20/09. **Hanno smentito due delle tre cose
che avevamo concluso guardando il sito**, ed e' il motivo per cui questo
capitolo esiste: le misure fatte da noi dicevano cose vere sul sito e
sbagliate su Google.

**Lo stato al 14/09:** 57 pagine indicizzate, 265 no, 322 conosciute. Delle
265, la ripartizione e' quasi tutta in una riga sola:

| motivo | quante |
|---|---|
| **Rilevata, ma attualmente non indicizzata** | **262** |
| esclusa dal tag `noindex` | 2 |
| duplicata, Google ha scelto un'altra pagina canonica | 1 |
| **Pagina scansionata, ma attualmente non indicizzata** | **0** |

**Quello zero e' il dato piu' importante di tutti, e ribalta una diagnosi.**
"Rilevata" vuol dire che Google conosce l'indirizzo -- dalla sitemap -- e
**non lo ha mai scaricato**. "Scansionata ma non indicizzata" sarebbe
"l'ho letto e ho deciso di no". E' a zero. Quindi:

> **Google non ha mai visto il contenuto di quelle 262 pagine.** Non ha visto
> le 80 schede senza descrizione, non ha visto i 67 nomi ripetuti, non ha
> potuto bocciarle per come sono fatte. Il contenuto **non e' la causa** dello
> stato di oggi.

E' una distinzione che nessuna misura fatta sul nostro sito poteva dare: da
qui si vede cosa serviamo, non cosa Google decide di prendere.

**Non sta peggiorando: e' in stallo.** La serie ha quattro soli gradini, e
poi si ferma:

| data | non indicizzate | indicizzate | conosciute |
|---|---|---|---|
| 05/08 | 18 | 1 | 19 |
| 22/08 | 128 | 44 | 172 |
| 29/08 | 224 | 55 | 279 |
| 05/09 | 265 | 57 | 322 |

**Dal 5 al 14 settembre i numeri sono identici tutti i giorni.**

**E c'e' un numero che nessuno aveva: la quota di pagine nuove che Google si
prende a ogni gradino.** 43 su 153, poi 11 su 107, poi 2 su 43: **28%, 10%,
5%**. Il limite della misura va scritto accanto -- le indicizzate in piu'
potrebbero comprendere pagine vecchie riprese dopo, non solo nuove -- ma la
caduta va nella stessa direzione in tutti e tre i passaggi, e tre passaggi
concordi non sono un caso.

**Il contesto, che va detto per non promettere un recupero rapido.** Fino al
21 agosto 2026 questo sito aveva **una** pagina indicizzata. E' un dominio
giovane, e "Rilevata ma non indicizzata" su gran parte di un catalogo nuovo
e' **il comportamento normale** di Google in quella condizione: conosce gli
indirizzi, non ha ancora ragioni per spenderci tempo. Parte di questi numeri
non e' un difetto nostro, e' mancanza di storia. Chi legge questo capitolo fra
sei mesi deve saperlo, perche' e' quello che impedisce di inseguire un
difetto tecnico dove non c'e'.

**E il 21/09/2026 e' arrivata la causa vera, dagli esportati: il 76% delle
scansioni finiva sui pacchetti tecnici del router.** Su 999 indirizzi di
esempio forniti da Google, **999 avevano la forma `?_rsc=<token>`**:
proiettato sulle 3.650 richieste di 45 giorni, **circa 2.780**. La
classifica -- /privacy 108, /come-funziona 84, /login 80, /termini 77 --
sono i collegamenti del **pie' di pagina**, presenti su ogni schermata; le
schede auto erano **15 su 999**. Una sola resa di pagina ne genera 31-39,
misurato con un browser.

Combacia esattamente con lo zero di "scansionata ma non indicizzata": Google
le conosceva tutte e non ne scaricava nessuna, perche' il tempo lo spendeva
sui pacchetti. Chiuso con una riga in `robots.txt` (`Disallow: /*_rsc`),
verificata prima con un browser vero -- pagine rese con quelle richieste
abortite, contenuto identico byte per byte -- e con tre motori robots
indipendenti. Il giro completo sta in `src/app/robots.ts` e il guardiano in
`src/lib/pacchetti-del-router-fuori.test.ts`.

**La misura del dopo sta nelle Statistiche di scansione** (*Impostazioni →
Statistiche di scansione*), e i due numeri da rileggere fra qualche
settimana sono:

| riga | oggi (21/09/2026) | cosa deve fare |
|---|---|---|
| tipo di file **HTML** | **6%** | salire molto |
| finalita' **Rilevamento** | **3%** | salire |

Sono i due numeri che dicono se il tempo di Google e' tornato sulle pagine.

**LE DUE DATE DI VERIFICA, e prima di quelle un numero fermo non vuol dire
niente.**

| quando | cosa si guarda | cosa deve fare |
|---|---|---|
| **24-25 settembre 2026** | *Impostazioni → Statistiche di scansione*: tipo di file **HTML**, e finalita' **Rilevamento** | HTML ben sopra il **6%**, Rilevamento sopra il **3%** |
| **verso il 10 ottobre 2026** | *Pagine*: il numero delle **indicizzate** | salire dalle 57 di oggi |

**E quel giorno, oltre a leggere Search Console, si copiano qui a mano le
due cifre del giro di sincronizzazione** -- schede ripassate e schede
cambiate davvero, dal riepilogo del lavoro su GitHub. Il riepilogo dura
novanta giorni, questo file no: un confronto a sei mesi ricadrebbe nel buco
del righello che si consuma, chiuso il 21/09 e descritto sotto *"Come si
rifa' questa misura"*.

**Perche' due date e non una.** Le due cose si muovono con tempi diversi:
la ripartizione delle scansioni cambia appena Google rilegge robots.txt,
l'indicizzazione arriva dopo che le pagine sono state scaricate e valutate.
Guardare le indicizzate il 25 settembre darebbe "fermo" e sarebbe una
risposta senza senso, non una brutta notizia.

**E il 21 settembre sono state fatte tre correzioni in un giorno** -- la
data di modifica che non si muove piu' a vuoto, i pacchetti del router
fuori dalle scansioni, la home che non serve piu' una pagina vuota. Sono
gia' al limite di quello che si riesce a distinguere: una quarta renderebbe
illeggibile il risultato. **Da qui al 24 settembre non si tocca altro su
questo fronte.**
Vanno letti li' e non si possono misurare da qui: il controllo quotidiano
verifica che la riga di robots.txt **ci sia ancora**, non come Google spende
il suo tempo.

**La causa coerente con lo stato misurato, e l'unica corretta il 20/09:** la
data di ultima modifica che dichiaravamo falsa. Ogni giorno la sitemap diceva
che **241 schede su 276 (l'87%) erano cambiate nelle ultime 24 ore**, e non
era cambiata nessuna. E' l'unica ipotesi che regge con "mai scaricate":
riguarda cosa Google decide di **andare a prendere**, non cosa trova quando
arriva. La correzione sta in `campiDelRipasso`
(`src/lib/dealer-site-sync.ts`), il guardiano in
`src/lib/updated-at-si-muove-solo-se-cambia.test.ts`.

**Una nota di metodo sull'ora della pubblicazione, perche' e' lo stesso
righello su cui si e' gia' sbagliato.** L'ora del **record** della
pubblicazione e l'ora in cui la rete comincia a servire la copia nuova
**non coincidono**. Misurato il 21/09/2026 sul deploy delle 09:53:34:

| lettura | eta' della copia | quando e' nata | cosa serviva |
|---|---|---|---|
| 09:53:37 (tre secondi dopo il record) | 63 s | **09:52:34**, un minuto *prima* del record | la pagina **vecchia** |
| 09:55:12 | 95 s | 09:53:37, tre secondi *dopo* il record | la pagina nuova |

Cioe': leggendo tre secondi dopo il record si misura ancora la versione
precedente, e la si scambia per la prova della correzione. E' successo, ed
e' stato preso solo perche' l'eta' non tornava.

**La regola: una misura ancorata "alla pubblicazione" si ancora all'eta'
della copia, non all'orologio del record.** Il marcatore affidabile e'
`age`, che dice quando quel file e' nato; il record dice quando GitHub ha
scritto una riga.

**Misurato il 21/09/2026: ha funzionato.** E il modo in cui e' stato
misurato conta quanto il risultato, perche' la prima versione della misura
era sbagliata.

**Si confronta un giro con un giro, non tre ore con tre ore.** Una finestra
di tre ore presa alle 09:15 comincia alle 06:15 e contiene la coda del giro
delle 06:00, che girava **senza** la correzione: due numeri presi con
righelli diversi. I ripassi si raggruppano da soli -- fra un giro e l'altro
passano ore -- e per ciascuno si contano le schede **rilette** in quella
finestra e quante di quelle hanno una data di modifica **dentro la stessa
finestra**:

| giro | rilette | riscritte | quota |
|---|---|---|---|
| 20/09 21:05-21:16 | 20 | 15 | 75% |
| 21/09 00:17-00:24 | 20 | 16 | 80% |
| 21/09 03:07-03:18 | 73 | 70 | 96% |
| 21/09 06:13-06:22 | 73 | 64 | **88%** |
| **21/09 09:08-09:16** (con la correzione) | **71** | **0** | **0%** |
| **21/09 15:05-15:16** (con la correzione) | **110** | **0** | **0%** |

**Il denominatore non e' crollato**, ed e' la cosa da guardare per prima: 71
schede rilette contro 73. La sincronizzazione ha girato normalmente e ha
semplicemente smesso di riscrivere. Se fossero crollati tutti e due, non
avremmo misurato la correzione: avremmo misurato un giro che non c'e' stato.

**Perche' zero e non "una manciata".** Zero e' la risposta giusta se in quel
giro nessun campo e' cambiato davvero, che su tre siti di concessionaria e'
normale in un intervallo di tre ore. Il guardiano comportamentale prova che
un prezzo diverso **fa** ancora muovere la data. Se restasse zero per giorni
mentre sui siti i prezzi cambiano a vista, quello sarebbe il segnale che il
confronto e' troppo largo -- ed e' la prossima cosa da guardare, non una
conclusione di oggi.

### Come si rifa' questa misura, ed e' l'unico modo che la rende ripetibile

**Il numero da confrontare e' 71, 110 -- non 362.** Il 21/09/2026, riportando
il giro delle 15:00, e' stato scritto *"tutte e tre le concessionarie
riallineate, 111 + 83 + 168 = 362 schede"*. Quel 362 e' il **catalogo intero**
-- ogni vettura che i tre siti abbiano mai dichiarato -- e le tre cifre sono
le sue fette per concessionaria. Non e' il lavoro di quel giro: e' una
costante che si muove solo quando nasce o muore un'auto. Il lavoro di quel
giro e' **110**.

E' la famiglia gia' descritta in [AGENTS.md](../AGENTS.md) sotto *"contare una
cosa e chiamarla con il nome di un'altra"*: il conteggio era esatto, sbagliata
era la parola. Con "riallineate" accanto a un numero cinque volte piu' grande
di "rilette", il confronto con la riga sopra diventa impossibile -- e chi lo
rifara' fra due settimane non sapra' se la correzione ha smesso di funzionare
o se ha in mano un righello diverso.

**Le due definizioni, e sono due insiemi annidati.**

| parola | cosa conta | colonna |
|---|---|---|
| **riletta** | la sincronizzazione ha **rivisto** quella scheda sul sito durante il giro | `import_synced_at` dentro la finestra |
| **riscritta** | ...e **ha anche cambiato** qualcosa nella riga | `import_synced_at` **e** `updated_at`, tutti e due dentro la finestra |

Le riscritte sono un **sottoinsieme** delle rilette, mai un insieme a parte.
Contare le sole `updated_at` nella finestra da' un numero piu' grande e di
un'altra cosa: comprende le schede che una persona ha modificato dal
gestionale, che con la sincronizzazione non c'entrano. Provato il 21/09/2026
sulla finestra delle 03:07 -- **120** contando la sola `updated_at`, **32**
contando l'intersezione.

**La finestra e' il giro, dal suo inizio alla sua fine**, letti da GitHub:

```bash
gh run list --workflow=sincronizza-siti.yml --limit 3 \
  --json databaseId,createdAt,updatedAt,conclusion
```

**Le due interrogazioni, per intero.** Si leggono con la chiave di servizio e
non scrivono niente. Il conteggio arriva nell'intestazione `content-range`,
perche' le funzioni di aggregazione su questo progetto sono spente
(`PGRST123`): `Prefer: count=exact` e' un'altra strada e funziona.

```bash
set -a; . ./.env.production; set +a
DA=2026-09-21T15:05:39Z; A=2026-09-21T15:16:45Z    # inizio e fine del giro

conta() {
  curl -s -I -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Prefer: count=exact" -H "Range: 0-0" \
       "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/vehicles?select=id&$1" \
    | grep -i '^content-range' | tr -d '\r' | sed 's#.*/##'
}

# RILETTE
conta "import_synced_at=gte.$DA&import_synced_at=lte.$A"
# RISCRITTE (l'intersezione, non la sola updated_at)
conta "import_synced_at=gte.$DA&import_synced_at=lte.$A&updated_at=gte.$DA&updated_at=lte.$A"
```

**E la cosa che rende questa misura diversa da tutte le altre: il righello si
consuma.** `import_synced_at` non e' un registro di eventi, e' un *"l'ultima
volta che l'ho vista"*: il giro successivo la sovrascrive, e la scheda **esce
dalla finestra vecchia**. Rileggere oggi la finestra di stamattina non da' il
numero di stamattina, e non perche' qualcuno abbia sbagliato: da' *"quante
schede hanno ancora come ultimo avvistamento quel giro"*, che e' un'altra
domanda.

Misurato il 21/09/2026 alle 15:40, contro i numeri presi subito dopo ciascun
giro:

| finestra | rilette allora | rilette alle 15:40 | riscritte allora | riscritte alle 15:40 | quota allora | quota alle 15:40 |
|---|---|---|---|---|---|---|
| 20/09 21:05-21:16 | 20 | 8 | 15 | -- | 75% | -- |
| 21/09 00:17-00:24 | 20 | 13 | 16 | -- | 80% | -- |
| 21/09 03:07-03:18 | 73 | 34 | 70 | 32 | 96% | 94% |
| 21/09 06:13-06:22 | 73 | 63 | 64 | 54 | 88% | 86% |
| 21/09 09:08-09:16 | 71 | 48 | 0 | 0 | 0% | 0% |

**Le tre regole che ne escono, in ordine di importanza:**

1. **il numero assoluto si legge subito dopo il giro**, prima che il
   successivo lo mangi. Fra un giro e l'altro passano tre ore: e' tutto il
   tempo che c'e', e va usato;
2. **la quota sopravvive, il numero assoluto no.** 96% e' diventato 94%, 88%
   e' diventato 86%: le due colonne si consumano insieme e il rapporto tiene.
   E' **la quota** il numero da confrontare fra due date lontane, e il numero
   assoluto serve solo a dire che il giro e' avvenuto davvero -- un
   denominatore crollato vuol dire che non si sta misurando la correzione, si
   sta misurando un giro che non c'e' stato;
3. **nel database non esiste un registro che non si consuma.** Verificato
   il 21/09/2026: `audit_logs` ha 135 righe, l'ultima del 19/09, e
   **nessuna** scritta dalla sincronizzazione. Nessuna tabella dice, di un
   giro passato, quante schede ha visto e quante ne ha cambiate.

**E c'e' una quarta via, che dal 21/09/2026 rende le tre regole qui sopra
quasi inutili -- e le tiene scritte lo stesso, perche' valgono per i giri
precedenti a quella data e per qualunque altra colonna "ultima volta che".**

Invece di leggere il numero dopo, **lo dichiara il giro mentre lo produce**.
Non e' costato quasi niente: l'endpoint restituiva gia' `rilette` e
`riscritte` per ogni sito a ogni chiamata, e il riepilogo archiviava gia' la
risposta per intero -- ma sparsa su venti blocchi JSON da sommare a mano,
cioe' archiviata e non leggibile. Adesso il passo li somma e scrive una riga
di questa forma:

> In N chiamate riuscite: **X schede ripassate**, di cui **Y** cambiate
> davvero.

(la forma e' quella che il codice stampa davvero: il primo numero non e' in
grassetto, il secondo lo e' insieme alla parola. Copiata a occhio, la citazione
diceva un'altra cosa -- ed e' la meta' della misura che si rompe da sola, il
riportare.)

**I tre numeri stanno insieme apposta.** Se la fermata dicesse il numero di
chiamate in una frase e il totale in un'altra, i due potrebbero divergere
senza che nessuno se ne accorga -- ed e' successo mentre si scriveva questa
riga: *"fermato al 3-esimo tentativo"* accanto a *"30 schede"*, due numeri
veri e letti da due posti, che insieme non tornavano (tre chiamate riuscite
fanno trenta; "al terzo tentativo" si legge come "durante la terza", cioe'
due finite). Nella stessa riga, dallo stesso contatore, non possono piu'
raccontare cose diverse, e chi legge il riepilogo puo' fare la divisione da
se'.

**Per il giro delle 15:00 del 21/09 -- che girava ancora senza questa riga --
X e Y valevano 110 e 0**, misurati a mano quel pomeriggio con le due
interrogazioni qui sopra. **N non lo sappiamo**, e non si scrive: quel giro
non lo ha dichiarato, e inventarlo per completare la frase sarebbe
esattamente il difetto che questa riga esiste per chiudere. La prima riga
completa comparira' nel primo giro programmato dopo l'unione, e da li' si
confronta.

(Una prima stesura di questo paragrafo mostrava *"200 schede, di cui 60"*:
era l'aritmetica del finto endpoint del banco -- venti giri per dieci e per
tre -- cioe' un numero inventato messo accanto a numeri veri, e il titolare
l'ha preso per un giro reale al 30%. Tolto il 21/09/2026.)

Il riepilogo di GitHub resta **novanta giorni** e nessuno lo sovrascrive:
`import_synced_at` puo' cambiare quanto vuole, quella riga no. Da li' in
avanti *"com'era il 21 settembre?"* ha una risposta, invece di *"era 71, ma
la stessa interrogazione oggi dice 48 e nessuno dei due e' sbagliato"*.

Due cose da sapere prima di fidarsene:

- **novanta giorni non sono per sempre.** Oltre quel termine GitHub butta via
  il riepilogo, e si torna alle tre regole. Un numero che deve durare piu' a
  lungo va copiato **qui**, in questo file, mentre lo si legge;
- **il totale non ha un valore predefinito, e lo dice -- con il nome di chi
  non ha dichiarato.** Se una sola voce della risposta non dichiara il suo
  conteggio, il riepilogo scrive *"non e' leggibile: al giro 3 autogepy.it
  non dichiara riscritte"* invece di una somma. Una somma a cui manca una
  voce non e' un totale parziale: qui sarebbe un numero **piu' basso del
  vero**, cioe' la correzione di `updated_at` che sembra funzionare meglio
  di quanto funziona. E senza il colpevole, fra due settimane nessuno
  saprebbe dove guardare;
- **uno zero dichiarato e' un numero, e si somma.** Un sito senza novita'
  risponde `rilette: 0`, ed e' un dato; trattarlo come "non dichiarato"
  marchierebbe illeggibile un giro sano. E' lo stesso confine di `null` e
  `0` nel conto economico, e le due direzioni si distinguono a valle **solo
  se il lettore le distingue**. Per questo il banco ha due casi gemelli, con
  il segno girato: `conteggi-non-leggibili` (un conteggio manca -> "non e'
  leggibile") e `un-sito-a-zero` (tutti dichiarano, uno a zero -> il
  totale). Con un ripiego a zero il primo passerebbe per la ragione
  sbagliata; con lo zero letto come assente cadrebbe il secondo. E si
  accetta **solo un intero vero, non negativo** -- un corridoio, non una
  porta: il primo intruso trovato era un `true` (per Python un intero, che
  sommato vale uno), ma una stringa `"5"`, un decimale, un `null` o un `-1`
  arrivano dalla stessa strada, e il `-1` abbasserebbe il totale. Provato su
  dieci risposte costruite, e il caso `conteggi-non-leggibili` del banco ne
  manda quattro in un giro solo, verificando alla lettera che ognuno sia
  nominato.

**Perche' il giro delle 15:00 ne ha rilette 110 contro le 71 delle 09:00.**
Non e' una variazione da spiegare col caso: in mezzo c'e' il giro delle 12:00
che e' caduto, quindi quello delle 15:00 aveva **sei ore** di arretrato invece
di tre. Il numero piu' grande e' coerente con quello che era successo, e le
riscritte restano **zero** su un campione piu' grande: la correzione regge
meglio di prima, non peggio.

**Quanto del 262 e' "rifiuto" e quanto e' "catalogo cresciuto dopo".**
Domanda giusta, e la risposta e' parziale -- misurata il 21/09/2026 sulle
274 auto pubblicate:

| | quante | quota |
|---|---|---|
| gia' esistenti durante la finestra di scansione (fino al 30/08) | **209** | 76% |
| nate **dopo** che Google aveva smesso di passare | 65 | 24% |

**Quindi no, in generale non regge**: tre quarti del catalogo c'era gia' e
non e' stato preso.

**Il conto esatto delle non indicizzate e' IN VERIFICA, e finche' non lo e'
piu' qui non si scrive nessun numero.** Per un motivo che vale la pena
lasciare scritto: e' l'unico pezzo di tutta questa analisi che poggia su una
**sola fonte non verificabile**.

**Cosa e' stabilito**, misurato il 21/09/2026 incrociando i 43
identificativi indicizzati con lo stato di oggi:

| dove stanno le 43 | quante |
|---|---|
| pubblicate oggi e create prima del 31/08 | **28** |
| pubblicate oggi e create dopo | 3 |
| **non piu' pubblicate** (vendute o tolte dal sito) | **12** |

Le quindici che non stanno fra le 28 **non sono quindici auto nate dopo**:
sono 3 nate dopo e **12 che oggi non sono piu' in catalogo**. E torna con
l'export: delle 43, quelle lette da Google a settembre sono **quattro**, e
tutte e quattro risultano **create a inizio settembre** (02/09, 02/09,
04/09, 04/09), cioe' prima di essere lette. Nessuna incongruenza.

**Cosa NON e' stabilito, ed e' il motivo per cui il numero non si scrive.**
La divisione fra "esisteva durante la finestra" e "nata dopo" poggia tutta
su `created_at`, e **non esiste una seconda fonte**: `audit_logs` non ha
nessun evento di nascita per nessuna delle 43 (cercato: zero su 43). Una
reimportazione che riscrivesse la riga sposterebbe quella data senza che
l'indirizzo sia nuovo, e il conto si sposterebbe con lei.

Quello che si e' potuto escludere: **nessuna delle 43 ha una data di
creazione posteriore alla scansione di Google** (zero su 43). Se le
reimportazioni avessero spostato le date in avanti, qualcuna delle schede
lette il 23-24 agosto risulterebbe creata a settembre. Nessuna lo e'.
**Esclude lo spostamento grosso, non quello dentro la finestra.**

**Cosa lo chiuderebbe**: una data di prima pubblicazione che nessuna
reimportazione tocca. Oggi non c'e'. Finche' non c'e', l'ordine di grandezza
si puo' dire -- **la grande maggioranza delle non indicizzate esisteva gia'
durante la finestra di scansione** -- ma il numero preciso no.

**Ma per concessionaria cambia tutto**, ed e' qui che la domanda paga:

| concessionaria | auto | nate dopo il 30/08 |
|---|---|---|
| De Lorenzi Srl | 93 | 1 (1%) |
| AUTOGEPY SPA | 131 | 14 (11%) |
| **Ponginibbi Spa** | **50** | **50 (100%)** |

**Tutto il catalogo di Ponginibbi e' arrivato dopo.** Il suo zero indicizzato
non e' un rifiuto e non e' un difetto: e' un'assenza di occasioni.

> **Da tenere in evidenza per fra tre settimane, quando si misurera'
> l'effetto della correzione: le tre concessionarie partono da condizioni
> diverse, e una media le confonderebbe.** De Lorenzi aveva quasi tutto il
> catalogo gia' pubblicato durante la finestra di scansione, Ponginibbi
> nessuna auto. Un miglioramento medio del catalogo non direbbe se la cura
> ha funzionato: **si guarda concessionaria per concessionaria**, e su
> Ponginibbi si guarda se Google **comincia** a passare, non se recupera.

**Ponginibbi non e' rotta, e il dubbio e' smentito con una misura.** Era
l'unica delle tre concessionarie non indicizzata, e compariva negli
esportati **solo** nella forma `?_rsc=`, mai come pagina: sembrava un
difetto della pagina. Non lo e'. Resa con un browser vero il 21/09/2026:
**7.224 caratteri di testo, un titolo, 134 collegamenti, 50 immagini**,
canonico suo, nessun `noindex`, in sitemap e collegata da
`/concessionarie`. Identica per struttura alle due indicizzate. **Non e'
mai stata indicizzata perche' Google non ci e' mai arrivato**: l'account e'
del 02/09 e la prima auto del 04/09, cioe' dopo la finestra in cui Google
ha scansionato (23-30 agosto), e da allora il suo tempo se lo mangiavano i
pacchetti del router.

*(A margine, e va in elenco: quella pagina serve **486 KB di HTML**. Non e'
indicizzazione, e' peso. Da guardare, non adesso.)*

**Quello che resta un lavoro di prodotto, e non e' una causa.** Le schede
hanno poco contenuto proprio: 80 su 276 senza descrizione, 53 sotto i 200
caratteri, 67 auto con lo stesso identico nome di un'altra, e in una pagina
servita solo il 19-37% delle parole non e' cornice ripetuta su tutte. **Oggi
non sposterebbe il numero di una pagina**, perche' Google quelle pagine non
le legge. Vale il giorno in cui comincera' a leggerle, e dipende dai
concessionari: aiutarli a scrivere le descrizioni, e distinguere le schede
con i dati che gia' abbiamo.

## La home era vuota per chi indicizza, e il motivo si chiama `/index` (21/09/2026)

**Chiuso.** La sonda ha risposto lo stesso giorno in cui e' stata messa, ed
e' gia' stata tolta.

**Il difetto.** La home serviva **63 caratteri** -- il guscio di attesa
dell'autenticazione, *"Verifica autenticazione..."* -- a chiunque non
eseguisse JavaScript, quindi anche alla prima passata di chi indicizza. Non
sempre: **solo nelle copie ricostruite**, che su quella pagina sono tutte
tranne la prima dopo ogni pubblicazione. Misurato al secondo seguendo una
pubblicazione dal suo atterraggio:

| ora | stato | caratteri | eta' | cache |
|---|---|---|---|---|
| 06:56:46 | piena | 6.118 | 0 | **PRERENDER** |
| 07:01:49 | piena | 6.118 | 302 | STALE |
| **07:02:15** | **vuota** | **65** | 22 | HIT |

Cinque minuti e mezzo di pagina giusta dopo ogni pubblicazione, vuota per
tutto il resto del tempo.

**La causa: `usePathname()` restituisce `/index`.** Durante la ricostruzione
a runtime su Vercel il percorso della radice non e' `"/"` e non e' vuoto: e'
**`/index`**, il nome del file prerenderizzato. Il guscio confronta il
percorso con l'elenco delle pagine pubbliche, `/index` non c'e', la home
finisce fra le protette e mostra il guscio di attesa. Il ripiego scritto nel
2026 copriva solo il percorso **vuoto**, che e' un'altra delle tre forme.

**Perche' solo la home.** Una scheda auto, ricostruita con lo stesso
meccanismo, vede `/auto/<identificativo>`, che comincia con `/auto/` -- una
voce dell'elenco -- quindi resta pubblica. Solo la radice non ha un prefisso
che la salvi. Misurato: una scheda attraverso piu' ricostruzioni resta
sempre piena, e non mostra mai il guscio.

**Come si e' trovato, e vale piu' del difetto.** L'ipotesi -- che
riguardasse la radice -- era plausibile e non bastava. Invece di dedurre il
valore leggendo il codice di Next, si e' messa una **sonda temporanea** che
scriveva il percorso grezzo dentro il guscio: quell'attributo finisce nella
copia sbagliata, che e' proprio l'oggetto che si va a leggere. Risposta in
cinque minuti, letta due volte a venti secondi di distanza:
`data-percorso-grezzo="/index"`.

Non un'intestazione, perche' una pagina statica non puo' scriverne una al
momento della ricostruzione, e i log di quella ricostruzione potrebbero non
arrivare mai.

**La cura** sta in `src/lib/percorso-della-home.ts`, con le tre forme e il
perche'. E' in un file suo e non dentro il guscio per una ragione precisa:
il guscio e' un componente client e non si puo' montare nei test di questo
progetto, quindi i suoi guardiani **ricopiavano** la regola -- e un test che
confronta con una propria trascrizione prova la trascrizione. Adesso la
chiamano.

**Provata rossa** togliendo il riconoscimento di `/index`: cade il caso che
lo nomina. E la porta non si e' allargata -- `/indexof` e `/index/qualcosa`
restano fuori.

## Credenziali

Il controllo ha bisogno di due segreti su GitHub
(*Settings → Secrets and variables → Actions*):

| Segreto | Dove si trova |
|---|---|
| `SUPABASE_PROJECT_ID` | Project Settings → *General* → *Reference ID* |
| `SUPABASE_SECRET_KEY` | Project Settings → *API Keys* → una chiave segreta dedicata (`sb_secret_...`), creata apposta per il controllo; non è la chiave di servizio del sito |

La chiave serve a chiamare `public.inventario_schema()`, che è riservata al
ruolo di servizio e restituisce solo com'è fatto lo schema, mai i dati. Non
serve più né la password del database né un token personale di Supabase.
