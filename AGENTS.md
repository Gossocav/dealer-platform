<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Come si lavora su questo progetto

## Prima di tutto

**Si risponde in italiano.** Chi legge non e' un tecnico: e' il titolare della
piattaforma. Niente gergo dove si puo' evitarlo, e i passaggi che deve fare lui
si scrivono come clic da fare, non come comandi da capire.

**Niente si dichiara fatto senza averlo verificato.** Non "dovrebbe funzionare":
provato, con il risultato sotto gli occhi. Se una cosa non e' stata verificata,
si dice quale e perche'.

**Un dato che non c'e' non si finge.** Un numero scritto nel codice e mostrato
accanto a numeri veri e' peggio di un dato assente, perche' chi guarda lo crede.
E' successo due volte: la barra del pannello (PR #146) e le "Visualizzazioni"
sulle schede veicolo, ferme a zero per mesi (PR #172).

## Prima di aprire una modifica

La CI e' bloccante ed esegue quattro controlli, su Node 22. Vanno eseguiti
tutti, in quest'ordine, **prima** di spedire:

```bash
npx tsc --noEmit    # i tipi: "npm run lint" NON li controlla
npm run lint
npm run test
npm run build
```

`npx tsc --noEmit` e' quello che sfugge piu' spesso e quello che rompe la CI
piu' spesso.

## Commit e pull request

Il messaggio descrive **l'effetto per chi usa la piattaforma**, in italiano,
minuscolo dopo i due punti, con gli apostrofi ASCII:

```
fix(veicoli): l'elenco si ordina per prezzo e per chilometri
feat(importazione): il prezzo si legge anche dai siti che non lo dichiarano
```

Ambiti in uso: `veicoli`, `marketplace`, `importazione`, `ricerca`, `home`,
`demo`, `admin`, `gestionale`, `seo`, `sicurezza`, `anteprime`, `lead`,
`privacy`, `misurazione`, `email`, `impostazioni`, `registrazione`, `accesso`,
`ci`, `chore`.

Nel corpo si spiega **perche'**, non cosa: il diff dice gia' cosa. Se una
scelta ha un'alternativa scartata, si scrive quale e per quale ragione. Il
numero della PR lo aggiunge GitHub da solo con lo squash.

Si lavora su un ramo, si apre la PR, si aspetta la CI verde, si unisce con
squash. Il repository ha un solo collaboratore: non c'e' nessuno a cui
chiedere una revisione. Dopo uno squash `git branch` puo' dire "non unito" a
torto: si verifica con `gh pr list --state merged`.

## Il database

**Le modifiche si applicano a mano**, dall'editor SQL di Supabase, e le applica
il titolare. `supabase db push` e' vietato. Il motivo sta scritto in
`.github/workflows/db-migrations.yml`: diverse migration di questo progetto
toccano i dati, e una cancella righe da `profiles` -- riapplicare tutto alla
cieca su una produzione con lo storico incompleto le rieseguirebbe.

**Una migration si prova su un Postgres vero prima di spedirla.** I test di
questo progetto leggono il *testo* dei file SQL: dicono che la regola e'
scritta, non che il database la applichi. Docker c'e':

```bash
docker run -d --name prova -e POSTGRES_PASSWORD=postgres postgres:17   # la stessa versione della produzione
# ricostruire i ruoli anon/authenticated/service_role, auth.uid() da
# request.jwt.claim.sub, le tabelle coinvolte, poi applicare la migration e
# interrogare come ciascun ruolo
```

E' cosi' che si e' verificato l'isolamento fra concessionarie prima di toccare
la produzione, ed e' l'unico modo per sapere davvero cosa fa una politica.

**Lo schema di produzione e' andato alla deriva rispetto alle migration**, piu'
di una volta. Prima di dare per scontato che una colonna o una politica esista,
si guarda la produzione.

## Isolamento fra concessionarie

E' la regola che non si infrange mai. Il 22 agosto 2026, alla prima prova con
due concessionarie, la seconda vedeva i dati della prima -- e con la sola
chiave pubblica del sito si leggevano nome, email e telefono dei clienti.

Da allora, **due serrature**:

1. **il database.** Protezione per riga accesa su ogni tabella di
   concessionaria, con `public.current_dealer_id()` come unico fondamento. Il
   permesso di lettura pubblica vale solo per `anon`, mai per `authenticated`:
   il marketplace legge sempre senza sessione (`publicSupabase`), quindi chi ha
   fatto login non ha nessun motivo di vedere i veicoli altrui.
2. **il codice.** Ogni interrogazione dichiara `dealer_id`, anche se il
   database lo impone comunque. Un test
   (`src/lib/tenant-scoped-queries.test.ts`) ripercorre il gestionale e
   fallisce se ne ricompare una senza.

Per verificare la produzione dall'esterno, come farebbe un estraneo:

```bash
set -a; . ./.env.production; set +a
node scripts/verifica-isolamento.mjs
```

La chiave di servizio si usa solo dove la chiave pubblica non puo' arrivare, e
solo sul server: mai in un componente del browser.

## Struttura e punti fissi

| Dove | Cosa |
|---|---|
| `src/proxy.ts` | Next 16 ha sostituito il Middleware con il Proxy. Qui vivono la Content-Security-Policy e `X-Robots-Tag`, **sorgente unica**: non duplicarle in `next.config.ts` |
| `src/lib/private-areas.ts` | l'elenco delle sezioni fuori dai motori di ricerca, letto sia da `robots.txt` sia dal proxy |
| `src/lib/dealer-id-resolution.ts` | da utente a concessionaria, con il controllo di appartenenza |
| `src/lib/active-tenant.ts` | `resolveDealerIdForCurrentUser`: l'aggancio che le pagine del gestionale usano per sapere di chi sono i dati |
| `src/lib/carica-tutto.ts` | legge un elenco per intero: il database ne consegna mille per volta e non lo dice |
| `src/lib/dealer-plan.ts` | il piano in vigore. **Mai** leggerlo da `dealers.subscription_plan`: e' una colonna vecchia che la conversione non aggiorna |
| `dealers.subscription_plan` | la colonna murata. Dice "base" per tutti da sempre. Il 14/09/2026 due vincoli che la limitavano a `('base','pro')` sono stati **tolti dai file** invece di essere messi in produzione: una serratura su una porta murata fa credere che la porta serva, e quell'elenco avrebbe rifiutato `elite` il giorno che qualcuno avesse provato a scrivere il valore giusto |
| `src/lib/vehicle-body-types.ts` | l'unico elenco delle carrozzerie: i valori sono anche quelli scritti nel database |
| `src/lib/tetto-del-piano.ts` | la regola del tetto del piano: quali auto stanno in vetrina quando sono piu' del consentito. **Una funzione sola** per sincronizzazione, importazione e pubblicazione a mano |
| `src/lib/dealer-site-import.ts` | legge lo stock dal sito della concessionaria; non parla col database, quindi si puo' provare su dati veri senza rischi |

Gli endpoint stanno in `src/app/api/**/route.ts` e seguono sempre lo stesso
ordine: normalizza, valida (400), variabili d'ambiente (500), scrittura
principale, effetti collaterali come "meglio se riesce", errore stabile (500).
Un effetto collaterale fallito non fa fallire una scrittura riuscita.
Riferimento: `src/app/api/marketplace/lead/route.ts`.

## I test

Vitest, con l'alias `@/` configurato in `vitest.config.ts`. Due stili
convivono, e servono a cose diverse:

- **comportamentali**: si chiama una funzione e si guarda cosa restituisce. E'
  la prova vera.
- **sul testo del sorgente**: si legge un file e si controlla che una riga ci
  sia. Servono a fissare decisioni che il tipo non puo' esprimere -- che una
  pagina usi l'involucro comune, che una politica sia scritta -- ma **non
  provano che il codice funzioni**. Un test cosi' su una migration dice solo
  che la regola e' scritta.

Un test spiega nel commento **quale difetto impedisce**, con il caso reale che
lo ha prodotto. Serve a chi un giorno lo vedra' fallire.

## Trappole gia' pagate

**Il tetto del piano si applica con una regola, non con un rifiuto.** Quando
una concessionaria ha sul suo sito piu' auto di quante il piano ne consente
(Ponginibbi, 10/09/2026: 81 auto, piano Base da 50), KeyAuto ne pubblica
esattamente quante il piano permette, scelte cosi': **prima le usate**, poi le
altre; a parita' di tipo prima quelle **gia' pubblicate** (la scelta non deve
cambiare a ogni sincronizzazione), poi le piu' recenti. Il limite vale sul
**totale** delle pubblicate, comprese quelle inserite a mano, e si legge sempre
dal piano in vigore (`resolve_dealer_listing_cap`): **mai un numero nel
codice**. Le auto oltre il tetto restano nell'archivio *in revisione*, con
l'origine e senza data di sparizione, e salgono da sole quando si libera un
posto; se il piano scende, escono nello stesso ordine, le usate per ultime. Il
concessionario legge nel gestionale quante ne restano fuori e cosa fare, e se
prova a pubblicare quando il posto non c'e' il clic viene **rifiutato subito**,
non a meta' di un'operazione di gruppo con la frase del database.

La regola sta in `src/lib/tetto-del-piano.ts` ed e' **una sola**. Le porte da
cui un'auto entra in vetrina pero' sono **dodici**, non tre, e chi ne aggiunge
una tredicesima deve passare di li': i tre bottoni di Gestione Veicoli
(singola, selezione, "pubblica tutte"), la scheda in modifica, il dettaglio
veicolo, l'importazione da file, quella da feed e quella dal sito con le loro
rotte, la sincronizzazione notturna, e `applicaTettoDelPiano` stessa. **Due di
queste scrivono con la chiave di servizio** (`/api/vehicles/feed` e la
sincronizzazione): li' il trigger del database non e' nemmeno l'ultima
serratura, perche' non scatta.

Due trappole nel contarli, tutte e due gia' pagate: i posti liberi si contano
**dal database** con la stessa definizione del trigger (`published` vero **e**
`status` "published") -- in giro ce ne sono altre due che contano cose diverse,
e l'elenco a video e' una pagina di nove righe gia' filtrata; e un'auto
portata in vetrina occupa un posto **anche quando e' un aggiornamento** di una
gia' in archivio, non solo quando e' nuova.

**Un sito che frena perde il turno, non il lavoro.** Quando il sito di una
concessionaria risponde "troppe richieste" (429), insistere e' esattamente
quello che ci ha chiesto di non fare: si passa la mano e il tempo va agli
altri. Ma il turno perso vale **solo per il passo che ha trovato il no**.

Il difetto, misurato l'11/09/2026 su autogepy.it: sul sito c'erano 17 auto mai
entrate in KeyAuto perche' le loro pagine non si leggevano. Ogni chiamata
provava prima quelle, prendeva il 429 alla prima, e passava la mano
all'**intero sito** -- senza mai arrivare alle 138 schede che c'erano gia' e
andavano solo ripassate. E siccome quelle 17 non entravano mai, restavano 17
per sempre. Quattro giorni con **zero** schede aggiornate, mentre l'indice del
sito si leggeva benissimo e le singole pagine, a ritmo lento, pure.

Due regole da tenere insieme: l'importazione delle nuove e il ripasso delle
esistenti **si alternano** (il cursore ricorda quale passo ha trovato il
freno), e un sito che ha appena frenato si legge con una **pausa lunga**
(`PAUSA_DOPO_IL_FRENO_MS`). Quel numero si corregge guardando quante schede
passano davvero: le risposte di un sito che limita non sono una soglia netta.

**Un contatto senza `dealer_id` non lo vede nessuno.** Oggi i contatti nascono
in un posto solo -- `/api/marketplace/lead`, che imposta sempre la
concessionaria -- e **il gestionale non ne crea a mano**. Il giorno che si
aggiunge "nuovo contatto" al pannello, quel modulo **deve impostare
`dealer_id`**: il trigger `enforce_lead_dealer_id` riempie quel campo solo per
i contatti di origine `marketplace`, quindi un contatto creato a mano senza
concessionaria resta orfano e non compare nell'elenco di nessuno. Non da'
errore: si perde in silenzio. Verificato su Postgres vero il 10/09/2026.

**Aggiornamento del 14/09/2026, e la nota qui sopra andava corretta.** Quella
protezione in produzione **non c'era**: `enforce_lead_dealer_id()` era fermo
alla versione del 28/06 -- identificata per confronto di impronte, non a
memoria -- che rifiuta un `dealer_id` sbagliato ma **non riempie** quello
vuoto. La versione che riempie stava solo nei file dal 22/08.
`20260914040000_il_contatto_senza_concessionaria_non_nasce_piu.sql` la porta
in produzione.

**Ma chiude solo il percorso `marketplace`.** Il trigger entra in azione
soltanto quando `source` vale `marketplace` (o e' vuoto): un contatto con
un'origine diversa **non e' protetto dal database, ne' prima ne' dopo**. E'
esattamente il caso di "nuovo contatto" dal gestionale il giorno che lo si
aggiungera': quel modulo **deve** impostare `dealer_id` da se', oppure il
trigger va esteso alla sua origine. Verificato in laboratorio su Postgres 17
il 14/09/2026, sette casi: il contatto con origine diversa esce con
`dealer_id` vuoto e nessun errore.

Un piano piu' sotto la stessa protezione c'e' ed e' scritta bene:
`enforce_lead_activity_dealer_id()` sulle **attivita'** dei contatti riempie
il campo e rifiuta la concessionaria altrui. Girava in produzione e non stava
in nessun file: se il database fosse stato ricostruito da zero si sarebbe
persa. Messa nei file il 14/09/2026.

**Un ripiego non inventa dati.** Quando un dato non c'e' -- la tabella non
esiste, la sessione e' scaduta, il database non risponde -- la tentazione e'
rispondere con qualcosa di plausibile per non lasciare la pagina vuota. E' il
difetto piu' ripetuto di questo progetto: la barra del pannello (PR #146), le
"Visualizzazioni" ferme a zero (PR #172), e le "Ultime sincronizzazioni" della
pagina Importazione, che per due mesi e mezzo hanno mostrato a ogni
concessionaria due importazioni mai avvenute -- 27 auto un'ora fa, 19 ieri --
perche' le tre tabelle interrogate non erano mai esistite.

Le regole, in ordine di importanza:

1. **Niente dati di esempio sul percorso vero.** Se servono a un test, stanno
   nel file di test e da nessun'altra parte.
2. **Un elenco vuoto e un errore non sono la stessa cosa.** "Non c'e' niente"
   e' un fatto e si dice; "non sono riuscito a leggerlo" e' un guasto e si
   dice diversamente. Un errore non diventa mai una lista vuota consegnata
   come successo.
3. **Un segnale `mock: true` nella risposta non salva niente**, perche' chi
   disegna la pagina non lo guarda: era li' anche stavolta.
4. Il suggerimento dentro una casella vuota (`placeholder`) e' un'altra cosa e
   va bene: non e' un dato mostrato come vero.

Il guardiano e' `src/lib/sincronizzazioni-veicoli.test.ts`.

**Un dato mancante non vale zero, in nessun calcolo.** E' la stessa famiglia
della trappola qui sopra, ma dentro i conti invece che dentro gli elenchi, e
in questo progetto e' gia' costata tre volte:

1. le "Ultime sincronizzazioni", due importazioni mai avvenute (PR #146, #172);
2. il **margine**, che valeva il prezzo di vendita intero quando l'acquisto non
   era scritto -- una vettura venduta a 11.500 senza acquisto risultava con
   11.500 di margine, visto su una riga vera in produzione (31/08/2026);
3. il **costo totale**, che sommava le altre voci ignorando l'acquisto
   mancante: 500 euro di trasporto su una vettura pagata 14.000 rispondevano
   "costo totale 500 euro" (14/09/2026);
4. il **prezzo d'acquisto scritto a zero**, che il modulo del conto economico
   rilegge come **vuoto** (`vehicle-economics-card.tsx`: un importo pari a
   zero diventa stringa vuota, e la stringa vuota torna `null`). A schermo
   compare "manca il prezzo di acquisto" su una vettura il cui prezzo
   d'acquisto c'e' ed e' zero -- una permuta a saldo, un'auto della casa
   madre. E' la stessa famiglia al contrario: qui non e' il vuoto che diventa
   zero, e' lo zero che diventa vuoto, e la regola che li distingue e' la
   stessa. **Trovato leggendo il 18/09/2026, non ancora provato su una riga
   vera: si prova prima di correggere.**

La forma e' sempre la stessa: **un numero plausibile al posto di "non lo so"**.
Chi guarda lo schermo non ha nessun modo di distinguerli, e ci crede. Le
regole:

- una somma a cui manca una voce **non e' un totale parziale, e' un totale
  sbagliato**: si restituisce `null`, non la somma del resto;
- il trattino non va mai da solo: accanto si scrive **perche'** manca, come fa
  `percheIlCosto`. Un trattino muto si legge come zero o come un guasto;
- il campo scritto a **zero** e' un dato e il conto si fa. La differenza fra
  `null` e `0` e' la differenza fra "non lo so" e "non e' costata niente", e
  nel database esiste gia': non va appiattita;
- se la stessa formula vive anche come **colonna calcolata** nel database,
  vanno cambiate tutte e due insieme. Due formule che dicono cose diverse sono
  peggio di una sola, e nel conto economico le schermate leggono l'una e le
  statistiche l'altra.

I guardiani sono in `src/lib/conto-economico.test.ts`, sotto "un dato mancante
non vale zero".

**E un si'/no che ammette il vuoto e' un terzo stato che nessuno gestisce.**
E' la stessa famiglia, sulle colonne invece che sui conti. Misurato il
14/09/2026: in produzione `vehicles.published` ammetteva il vuoto. Il tetto del
piano conta `published = true`, il marketplace filtra `published = true`, la
scheda mostra "in vetrina" o "no": una riga con quel campo vuoto **non sta ne'
di qua ne' di la'**, e nessuna parte del codice sa cosa farne. Non e' un errore
che si vede: e' un'auto che sparisce da tutti e due gli elenchi.

Prima di allineare una colonna cosi' si contano le righe vuote: se sono zero --
e lo erano, su tutte e quindici le colonne trovate quel giorno -- il dato c'e'
sempre e manca solo la regola che lo pretende. Chiuse in
`20260914080000_le_ultime_colonne_come_in_produzione.sql`.

**Una scelta documentata non e' una scelta giusta.** Il terzo caso non era una
svista: era una decisione, fissata da un test che la spiegava -- *"e' una
risposta onesta anche senza acquisto: dice quanto si e' speso finora"*. Letta
da sola suonava ragionevole. Era sbagliata di quattordicimila euro.

Il commento che motiva una scelta dice **perche' fu presa**, non che regga
ancora: chi l'ha scritta aveva in testa un caso, e il caso che la rompe e'
quasi sempre un altro. Quando un difetto porta a una riga che sembra voluta,
si legge la motivazione e la si mette alla prova con un numero vero, invece di
fermarsi davanti al commento. Se cade, si cambia la riga **e** si riscrive la
motivazione con la data e il caso che l'ha fatta cadere.

**E una regola scritta giusta puo' essere applicata a meta'.** E' il caso
gemello, e in questo progetto e' capitato quattro volte. L'ultima, il
14/09/2026: l'inventario dello schema ha una famiglia per i permessi **colonna
per colonna**, e il commento che la introduce spiega benissimo il pericolo --
*"un grant di troppo aprirebbe subscription_plan, e il confronto resterebbe
verde"*. La regola pero' guardava solo `INSERT` e `UPDATE`. I sessantuno
permessi di **lettura** colonna per colonna -- quelli che decidono cosa il
mondo vede di `vehicles` e `dealers` con la sola chiave pubblica, e che
tengono chiusi targa, telaio, codice fiscale e piano dell'abbonamento -- erano
fuori dalla sorveglianza. Un `grant select (plate) on public.vehicles to anon`
avrebbe aperto la targa di ogni vettura **lasciando verde il controllo
settimanale**.

Le altre tre: la protezione per riga accesa ma senza `force` (chi possiede la
tabella la scavalcava); `revoke ... from public` che non toglie il permesso
che Supabase concede ad `anon` (sette funzioni `security definer` restavano
eseguibili dal sito, per due mesi); e `dealer_users`, dove si toglievano
`insert/update/delete` ma non `all`.

**Come si evita la quinta volta.** Quando una regola nomina un elenco --
comandi, ruoli, tabelle, tipi di oggetto -- la domanda non e' "l'elenco e'
giusto?" ma **"cosa resta fuori dall'elenco, e perche'?"**. Se la risposta non
sta in una riga, l'elenco e' incompleto. E davanti a un controllo che dice
"nessuna differenza", la frase da tenere in mente e' quella con cui il difetto
e' stato trovato:

> **"Zero differenze li' vuol dire non guardato, non tutto a posto."**

Un conteggio a zero e' una risposta solo se si sa **cosa** e' stato contato.
Prima di riportarlo come rassicurazione si apre la regola e si guarda il suo
filtro: una famiglia che non viene interrogata risponde zero esattamente come
una famiglia sana. Il giro completo di quali serrature
l'inventario sorveglia e quali no sta in
`supabase/migrations/20260914020000_il_guardiano_vede_anche_la_lettura.sql`.

**L'importazione da file non sa cosa sia una targa.** In
`src/lib/vehicle-import.ts` i campi riconosciuti sono ventisette e comprendono il
telaio (`vin`, con gli alias "telaio" e "chassis"), ma **la targa non c'e'**.
Una colonna "Targa" in un CSV oggi non viene agganciata a niente: **si perde in
silenzio**, senza un avviso, e il concessionario crede di averla importata.

Non e' ancora costato niente perche' nessuno ha importato un file con le
targhe, ma e' una bomba a orologeria: il giorno che un cliente arriva con il
suo listino, la chiave piu' importante che possiede sparisce durante il
caricamento. E' il primo lavoro della fase che riempie i dati gestionali.

Quando si aggiunge, la targa passa **sempre** da `src/lib/targa.ts`: una targa
che non ha una forma italiana valida non si salva come targa, si segnala nel
riepilogo dell'importazione insieme alle righe ambigue.

**Una targa sbagliata e' peggio di una targa mancante.** Leggendo le schede
dei tre siti collegati il 14/09/2026, su **62 targhe pubblicate due valevano
`XXX` e `XXXX`**: segnaposto lasciati nel gestionale del concessionario.
Scritte nel nostro archivio sarebbero indistinguibili da una targa vera, e la
targa e' una chiave: con quella una vettura si segna venduta
(`auto-da-chiudere.ts`), si raggruppano i suoi documenti
(`archivio-documenti.ts`), e si interroga la ricerca a pagamento, **che si paga
a interrogazione anche quando la targa non esiste**.

La forma sta in `src/lib/targa.ts`, **un posto solo**, e vale sia per
l'inserimento a mano sia per qualunque importazione. Due cose da sapere prima
di toccarla:

- **le targhe moderne non usano I, O, Q, U** (si confondono con 1, 0 e fra
  loro), ma **le sigle delle province si'**: Milano, Bologna, L'Aquila. Il
  primo tentativo di quel file escludeva quelle lettere dappertutto e
  rifiutava `MI123456`;
- **un campo vuoto non e' un errore.** Una vettura importata dal sito non ha
  quasi mai la targa, e nessuno deve inventarsene una per salvare la scheda.
  Quello che non si fa e' salvare come targa qualcosa che targa non e'.

**Una regola messa in un posto solo non chiude le porte che non la
chiamano.** "Un posto solo" e' dove la regola **vive**, non quante porte la
usano: il lavoro e' finito solo quando **ogni** scrittura di quella colonna
passa di li'. Il 15/09/2026 la forma della targa e' entrata in `targa.ts` ed
e' stata agganciata alla scheda in modifica; **"Segna venduta"** continuava a
scrivere la targa com'era digitata -- proprio nel momento in cui diventa
l'unica cosa che identifica l'auto venduta. Trovato il 16/09/2026 facendo la
stessa cosa per il telaio. E' lo stesso schema del guardiano che guardava le
schermate sbagliate e del tetto del piano corretto in un posto e aggirato in
dodici.

Come si evita: quando una regola entra in una libreria, si cerca **chi scrive
quella colonna** (`grep -rn "plate:" src`, non "chi nomina la targa"), si
elenca ogni porta trovata, e ognuna passa dalla libreria o finisce in un
elenco esplicito con il perche'. Poi un test sul testo dei sorgenti fissa
l'elenco, come `il telaio ha una casa sola` in `src/lib/telaio.test.ts`: il
difetto arrivera' dalla porta che nessuno ha contato.

**La verifica di sicurezza sulle targhe lette dai siti** (14/09/2026, 126
pagine): la targa si prende **solo** dal blocco dati il cui identificativo
coincide con quello della scheda che si sta leggendo. Misurato: 62 targhe
lette, **62 distinte**, **zero** pagine contenenti i dati di un'altra vettura,
**mai piu' di un blocco veicolo per pagina**. Il controllo resta scritto anche
se su questi tre siti non ha trovato niente: il giorno che un sito mettera' due
vetture nella stessa pagina e' l'unica cosa che impedisce di attribuire la
targa dell'una all'altra.

**Le notifiche non distinguono gli utenti della stessa concessionaria.** Dal
22/08/2026 le quattro regole di accesso su `notifications` chiedono soltanto
la concessionaria (`dealer_id = current_dealer_id()`), non l'utente: al
livello del database chiunque abbia una sessione attiva su una concessionaria
puo' leggere -- e segnare come lette -- le notifiche di un suo collega. Le
regole precedenti chiedevano `user_id = auth.uid()`; la migration
dell'isolamento le ha sostituite tutte.

**Oggi non fa danni perche' ogni piano ha un utente solo.** E' la stessa
condizione della correzione descritta piu' sopra in
[MIGRAZIONI.md](supabase/MIGRAZIONI.md): **va risolto prima di vendere un
piano con piu' di un utente**, Elite compreso. Sono due voci della stessa
lista, e vanno guardate insieme il giorno che quella lista si apre.

**Scrivere una regola nei file non chiude una differenza.** La chiude solo
quando la regola arriva nel database vero. Sono due numeri diversi e vanno
tenuti separati in ogni resoconto: *"le differenze scendono a N scrivendo i
file"* e *"scendono a M quando il titolare applica la migration"*. Confonderli
fa sembrare risolto qualcosa che nel database che gira e' ancora com'era.

La prova che la distinzione conta: il 14/09/2026 quindici colonne erano
dichiarate obbligatorie **nei file** e libere in produzione. Scriverle
nuovamente nei file non cambiava niente -- li' lo erano gia'. Il conteggio si
muove solo con l'`alter table` sulla produzione.

**I valori di un tipo enumerato si leggono senza chiedere niente al titolare.**
L'inventario dice soltanto `USER-DEFINED`, e il nome del tipo e i suoi valori
sembrano richiedere una query sulla produzione. Non e' cosi': PostgREST
pubblica la descrizione dello schema, e li' ci sono per esteso.

```bash
set -a; . ./.env.production; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Accept: application/openapi+json" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  | jq '.definitions.audit_logs.properties.actor_type'
```

Risponde `{"enum": ["user","system","api"], "format": "public.audit_actor_type_t"}`.
E' cosi' che si e' saputo com'era fatto `audit_logs.actor_type` senza
indovinarlo.

**Una colonna nominata da una regola di accesso non cambia tipo.** Postgres
rifiuta con *"cannot alter type of a column used in a policy definition"*, e
lo rifiuta **a meta' della transazione**: se quella riga sta dentro una
migration che il titolare incolla nell'editor SQL, si ferma li'. Successo il
14/09/2026 convertendo `demo_requests.vehicle_count` da testo a numero, perche'
`demo_requests_insert_public` pretende `vehicle_count is not null`.

Si toglie la regola, si cambia il tipo, si rimette la regola **identica** --
stesso nome, stesso comando, stesso ruolo, stesso controllo -- e si verifica
dopo la ricostruzione che sia tornata bit per bit quella di prima.

**Provare invece di dedurre ha gia' evitato quattro guasti nell'editor SQL del
titolare**, e tutte e quattro le volte il difetto era invisibile leggendo il
codice:

1. **l'ordine di cancellazione delle tabelle**: `drop table import_sources`
   viene rifiutato, perche' quattro tabelle dipendono da lei;
2. **il primo `src/lib/targa.ts`**, che escludeva le lettere I, O, Q, U anche
   dalle sigle delle province e rifiutava `MI123456`;
3. **il tipo di una colonna nominata da una regola di accesso**, qui sopra;
4. **`notifications_type_check`**: quel vincolo elenca i tipi di notifica
   ammessi, e aggiungerne uno nuovo senza toccarlo fa **rifiutare
   l'inserimento a meta' della transazione**. Trovato il 14/09/2026
   aggiungendo `vehicle_import` e `piano_pieno`. Il contrario e' altrettanto
   vero: un tipo vecchio **non si toglie** dall'elenco finche' esistono righe
   che lo portano, o le si rende illegali.

La forma comune: **un vincolo, un permesso o una dipendenza che il codice non
nomina**, e che si scopre solo quando il database dice di no. Una migration si
prova su Postgres vero **prima** di consegnarla, sempre -- ricostruendo lo
schema da zero, non su una tabella finta scritta a mano, perche' meta' di
queste quattro non sarebbero comparse.

**Ogni migration ha la data nel nome, e un file che non ce l'ha gira per
ultimo.** In una ricostruzione le migration si applicano in ordine
**alfabetico** (`scripts/ricostruisci-schema.sh`), e nell'alfabeto del computer
**le cifre vengono prima delle lettere**: un file che comincia per lettera
finisce dopo **tutti** quelli datati, comprese le migration scritte mesi dopo.
Qualunque cosa ridefinisca, vince -- e nessuna correzione futura potra' avere
la meglio, perche' arrivera' sempre prima.

Il 14/09/2026 `supabase/migrations/rls_vehicles_policies.sql`, senza data nel
nome, ridefiniva `enforce_vehicle_dealer_id()` ed
`enforce_vehicle_image_dealer_id()` -- due protezioni dell'isolamento fra
concessionarie -- con una versione piu' vecchia di quella in produzione, e
girando per ultimo era quella a sopravvivere. Questa volta le due versioni si
comportavano allo stesso modo (un `if` annidato invece di un `and`); la
prossima potrebbe non essere cosi'.

**I due file esistenti non si rinominano** -- cambierebbe l'ordine in modi che
nessuno ha verificato -- e il loro contenuto si tiene allineato alla
produzione. Il guardiano e' `src/lib/migrazioni-in-ordine.test.ts`, che
fallisce se ne compare un terzo.

**Le notifiche: tre difetti corretti il 14/09/2026, e uno lasciato apposta.**

I tre corretti, trovati leggendo il testo delle funzioni in produzione:

1. **Meta' di `sync_stale_notifications` non trovava mai niente.** Cercava i
   contatti con `status = 'created'`, il vecchio nome inglese. Gli stati di
   questo progetto sono italiani (`src/lib/leads.ts`), e `leads_status_check`
   -- in produzione -- ammette **solo** quei sei: scrivere `created` viene
   rifiutato dal database. La condizione era morta due volte, e **l'avviso
   "Lead non contattato da 24 ore" non e' mai arrivato a nessuno**.
2. **Diceva una cosa falsa.** Annunciava *"Veicolo in bozza da oltre 7 giorni"*
   per ogni vettura non pubblicata, comprese le **76 in `in_review`** che il
   **tetto del piano** aveva messo da parte. Ora le bozze vere e le auto
   fermate dal tetto si distinguono, e le seconde producono **una sola**
   notifica per concessionaria: *"Il tuo piano include 50 auto: 76 del tuo
   sito non sono pubblicate."*
3. **Una sincronizzazione allagava la campanella.** Un trigger per riga
   scriveva una notifica per ogni auto importata: delle 411 in produzione,
   **373 erano `vehicle_new`**. Ora si raggruppano per sito e per giorno
   (`vehicle_import`, con la colonna `conteggio`), e **un'auto inserita a mano
   non produce piu' niente**: annunciare al concessionario una cosa che ha
   appena fatto lui e' rumore.

**Il quarto e' ancora li', ed e' voluto.** Le due interrogazioni fanno
`cross join` sugli utenti della concessionaria: **un inserimento per ogni cosa
per ogni utente**. Oggi ogni piano ha un utente solo e non si vede. Va risolto
**prima di vendere un piano multiutente**, ed e' la **terza voce** di quella
lista, insieme alle notifiche leggibili fra colleghi e alla correzione su
`dealer_users` descritta in [MIGRAZIONI.md](supabase/MIGRAZIONI.md). Il
raggruppamento lo rende molto meno grave: tre utenti moltiplicano **una**
notifica per sito, non centoquaranta.

**Due cose da sapere prima di aggiungere un tipo di notifica.**
`notifications_type_check` elenca i tipi ammessi: un tipo nuovo va aggiunto li'
o l'inserimento viene rifiutato **a meta' della transazione**. E i tipi vecchi
non si tolgono dall'elenco finche' esistono righe che li portano. Le due cose
insieme sono state trovate provando la migration su Postgres vero, non
leggendola.

Il guardiano e' `src/lib/notifiche.test.ts`.

**E una quarta cosa, minore:** `set_updated_at()` in produzione non ha
`set search_path`, mentre i file ce l'avevano. I file erano piu' prudenti. La
funzione **non e' `security definer`**, quindi gira con i permessi di chi la
chiama e un `search_path` non fissato non permette di scavalcare niente: e'
un'imprudenza, non un buco. Da sistemare dopo la pulizia, insieme ai tre difetti
qui sopra.

**Un controllo che non e' mai diventato rosso non e' un controllo, e' una
decorazione.** E' la sorella di "zero differenze li' vuol dire non guardato".
Il 15/09/2026 il guardiano della provenienza (`src/lib/provenienza-dati.test.ts`)
elencava tre schermate "da collegare" -- ed erano **tre falsi allarmi**: la
pagina delle perizie scrive su `vehicle_appraisals`, le altre due cambiano
solo stato e pubblicazione. Il controllo guardava chi **nominava**
`registration_date` da qualche parte nel file, non chi lo **scriveva** su
`vehicles`; e proteggeva tre campi invece dei ventidue che il sito manda.
Intanto le porte vere -- il feed, il file, la duplicazione -- passavano verdi.

Un controllo cosi' rassicura esattamente come uno che funziona, e per un
giorno l'ha fatto. Le due regole:

1. **prima di fidarsi del verde, si produce il rosso**: si mette una porta
   finta -- un `.from("vehicles").update({ price: 1 })` in un file qualsiasi
   -- e si guarda che il test la trovi. Se non la trova, il test non guarda
   quello che dice di guardare. Rifatto il 16/09/2026 seguendo la catena da
   `.from("vehicles")` alla scrittura, provato rosso, e da allora ha un caso
   dentro (`il guardiano vede una porta nuova`) che lo tiene rosso per
   costruzione;
2. **un elenco di eccezioni si rilegge quando cambia il controllo.** Le tre
   di ieri non "si sono accorciate": erano sbagliate, e l'elenco vero ne ha
   cinque. Un elenco che cambia contenuto va riscritto con la data e il
   motivo, non aggiustato in silenzio per far tornare il conto.

**Le funzioni che oggi nessuno tocca sono quelle dove aspettarsi le
sorprese.** "Duplica" e' rimasto rotto **dieci giorni** (dal 06/09 al
16/09/2026) senza che nessuno se ne accorgesse. Non e' colpa di nessuno: e'
la conseguenza di non avere clienti. Nessuno lo usa, quindi nessuno lo
segnala, e un test che non c'era non poteva dirlo. Vale come promemoria per il
giorno del primo cliente vero: le funzioni che oggi non passano mai sotto un
clic -- duplicazione, foglio di consegna, perizie, importazione da file,
archivio documenti -- sono quelle da provare **prima** che le provi lui, e
per ognuna la prova migliore e' un test comportamentale che le chiami davvero.

**"Vuoto" non e' una prova: il criterio per cancellare e' che nessuna riga di
codice la usi.** I tre account in produzione sono **di prova**, creati dal
titolare, e non esiste ancora nessun cliente pagante. Quindi *"oggi non lo usa
nessuno"* non e' mai un argomento: **non c'e' nessuno che possa usarlo**. Una
tabella vuota oggi puo' essere un guscio mai costruito, oppure una cosa che
aspetta il primo cliente vero -- e le due si assomigliano moltissimo.

Vale per **tabelle, colonne, funzioni e trigger**. Prima di proporre una
cancellazione:

1. **si cerca in tutto il progetto** -- `src/`, `scripts/`, `.github/`,
   `supabase/`, test compresi -- chi la nomina, e si riporta **il risultato
   grezzo della ricerca**, non la conclusione. Chi legge deve poter vedere le
   righe trovate e giudicare da se';
2. **se il codice la usa ma e' vuota, NON si cancella**: si annota come "in
   attesa del primo cliente";
3. **se non la usa nessuno, si dice anche a cosa doveva servire**, cosi' il
   titolare decide se e' un disegno mai costruito o un disegno da costruire;
4. **nel dubbio non si cancella.** Ricreare una tabella e' facile; ricostruire
   un'idea persa no.

**Sono due domande diverse e si riportano separate.**

| la domanda | a cosa si risponde | cosa la risponde |
|---|---|---|
| **serve a qualcuno?** | se si cancella, qualcosa smette di funzionare | **la ricerca nel codice** |
| **si perdono dati?** | se si cancella, qualcosa sparisce per sempre | **il conteggio delle righe** |

Riportarle insieme, come se pesassero uguale, fa sembrare che due prove deboli
ne facciano una forte. Non e' cosi': **solo la prima autorizza a cancellare**,
la seconda dice se serve un travaso prima di farlo. Il 14/09/2026 le dieci
tabelle senza codice sono state raccontate con le due prove appaiate, ed era
un modo sbagliato di dirlo anche se la conclusione reggeva.

**Un passo obbligatorio della ricerca: controllare che nessuno usi `select *`.**
Se una sola interrogazione chiede tutte le colonne, cercare il nome di una
colonna non prova niente -- quella colonna arriva lo stesso a chi legge, e
toglierla puo' rompere qualcosa che non la nomina mai. Si guarda quindi ogni
`select` sulla tabella, non solo quelli che contengono il nome cercato. Il
15/09/2026 su `vehicle_images` sono stati controllati tutti e nove: nessuno usa
`*`, e nessuno chiede `updated_at`.

**E un `select *` che poi si riscrive copia anche cio' che non si puo'
scrivere.** Stesso costrutto, danno diverso: nelle ricerche rende inutile una
verifica, in una copia rompe l'inserimento. "Duplica" leggeva la scheda con
`select("*")` e la reinseriva intera: da quando `ricerca_testo` e' una colonna
**generata** (06/09/2026), Postgres rifiutava ogni copia -- *"cannot insert a
non-DEFAULT value into column ricerca_testo"* -- e portava con se' anche
targa, telaio, cliente e l'aggancio al sito dell'originale. Una copia dichiara
cosa **non** porta, in un posto solo (`src/lib/duplica-veicolo.ts`), e non
parte mai da "tutto".

**Difetti trovati leggendo il 18/09/2026, annotati e non corretti.** Sono
usciti preparando la fetta che mostra i dati, e nessuno si corregge dentro una
modifica che parla d'altro. In ordine di quanto gia' fanno danno:

1. **Lo zero riletto come vuoto nel conto economico** -- vedi il punto 4 qui
   sopra. E' un numero falso **gia' a video**, non un difetto latente: si
   prova su una riga vera e si corregge **subito dopo la fetta che mostra**.
2. **Il prezzo assente mostrato come "0 €"** sulla scheda del veicolo e in
   Gestione Veicoli (`formatCurrency(Number(vehicle.price ?? 0))`): un'auto
   senza prezzo dichiara zero euro. Anche questo e' gia' a video, e si
   corregge **dentro** la fetta che mostra, perche' mettergli accanto "dal tuo
   sito" lo trasformerebbe in un numero falso **firmato**.
3. **"Invia al cliente" e l'email rispondono in due modi allo stesso vuoto**:
   la finestra scrive "Su richiesta" per un prezzo assente, l'email scrive
   "-". "Su richiesta" e' per giunta una frase che il concessionario non ha
   detto.
4. **La "Completezza" della Salute veicolo conta un dato proposto** come se
   fosse acquisito (conta `registration_date` senza guardare se e'
   confermato). Va sistemata **quando esistera' la conferma**, non prima:
   oggi, senza un modo per confermare, escluderla farebbe scendere il
   punteggio di tutti senza che nessuno possa farci niente.

E una nota sul guardiano dei nomi dei fornitori: cerca soltanto la parola
"Supabase". "MotorK" o "DealerK" in una dicitura non verrebbero fermati. La
forma resta "deciso dal tuo sito", per disciplina e non per guardiano.

**Un controllo si dimentica, un campo che non arriva non si puo' scrivere.**
Quando una regola dice "questo dato non si tocca", non la si affida a chi
scrive: **non gli si consegna il dato protetto**. Chi sincronizza passa a
`scriviDalSito` cio' che il sito dichiara e riceve indietro **solo cio' che
puo' scrivere** -- i campi del concessionario non compaiono nel risultato,
quindi non c'e' niente da saltare e niente da dimenticare.

Non e' una questione di stile. Un controllo **dentro** chi scrive si aggira
aprendo una porta nuova che non lo fa: e' esattamente quello che e' successo al
tetto del piano, corretto in un posto e aggirato in **dodici**. Una funzione
che **non restituisce** il campo protetto non si aggira, perche' chi la usa non
ha in mano niente da scrivere. La regola sta in `src/lib/provenienza-dati.ts`.

**I due test servono a cose diverse, e servono tutti e due.** Il primo --
comportamentale -- dice che la funzione fa la cosa giusta. Il secondo -- sul
testo dei sorgenti -- dice che **nessuno puo' farla per conto suo**: nessun
file, fuori da quella funzione, scrive un campo protetto. Il difetto arrivera'
da una porta nuova, non da quella gia' scritta, e il primo test non la vedrebbe
mai.

Quando il secondo trova qualcosa che non si puo' correggere subito, il nome del
file si scrive in un **elenco esplicito** dentro il test, con il perche' e la
regola che quell'elenco puo' solo accorciarsi -- come
`SENZA_DATA_CONOSCIUTI` per le migration senza data. Un elenco di eccezioni che
cresce e' il modo in cui un controllo diventa rumore.

**Un dato che il sito dichiara e noi scartiamo senza lasciare traccia e'
indistinguibile da un dato che il sito non ha mai detto.** Vale oltre il caso
che l'ha prodotto: ogni volta che si sceglie di **non** usare
un'informazione arrivata, la scelta va registrata da qualche parte, altrimenti
fra sei mesi nessuno sapra' se quell'informazione non c'era o se c'era e
l'abbiamo buttata. Sul disaccordo fra sito e concessionario si scrive in
`origine_dati` sotto `il_sito_dice`, senza toccare il valore.

**Cio' che si scrive e non si mostra ancora va in
[SCRITTE_NON_MOSTRATE.md](SCRITTE_NON_MOSTRATE.md)**, nello stesso momento in
cui si scrive il codice che lo salva -- non dopo. Costruire prima il posto dove
mettere i dati e poi la schermata che li racconta e' l'ordine giusto, ma
lascia per un po' informazioni che il database ha e lo schermo no: quell'elenco
esiste perche' nessuna si perda per strada.

**`.env.local` batte `.env.production`.** Una prova in locale legge il database
di sviluppo anche quando si crede di guardare la produzione: la pagina risponde
"non trovato" e sembra che tutto funzioni. Per provare sui dati veri si
esportano le variabili nella shell **prima di compilare**, perche' le
`NEXT_PUBLIC_*` finiscono dentro la compilazione.

**Un inserimento che rilegge la riga appena scritta.** Con la protezione per
riga attiva, `.insert().select()` fallisce se manca il permesso di lettura -- e
Postgres lo segnala come *violazione della regola di scrittura*, indicando la
regola sbagliata. Si distingue cosi': senza rilettura 201, con rilettura 401.

**Il limite delle mille righe.** Il database consegna mille righe per richiesta
e non lo dice. Per gli elenchi si usa `caricaTutto`, che avvisa quando tocca il
tetto.

**I valori mancanti in coda.** Postgres considera un valore assente come il piu'
grande: in ordine decrescente le auto senza prezzo aprirebbero l'elenco. Si
ordina sempre con `nullsFirst: false`.

**Il nome di un filtro non e' un dato.** Leggendo le pagine dei siti delle
concessionarie, `"price"` e `"bodyType"` compaiono anche come etichette dei
filtri di ricerca ("Qualsiasi prezzo"). Un valore si prende solo se e'
agganciato all'identificativo della vettura, o se sulla pagina compare una
volta sola.

**La cache di Turbopack** si corrompe se si cancella `.next` mentre `next dev`
sta ancora chiudendo. Si spegne il processo, si controlla che la porta sia
libera, poi si cancella.

## Come si lavora

Modifica minima, sullo scopo richiesto. Se serve toccare altro, lo si dice
invece di farlo di nascosto. Non si commetta ne' si spinga niente senza che sia
stato chiesto.

Quando si trova un difetto mentre se ne corregge un altro, lo si segnala con la
prova; non lo si corregge in silenzio dentro una modifica che parlava d'altro.

Le pagine del gestionale e il pannello amministrativo chiedono credenziali che
un agente non ha: la resa a video non e' verificabile da qui, e va detto invece
di lasciarlo intendere.

## Dove sta scritto il resto

- [README.md](README.md) — cos'e' il progetto e come si fa girare
- [ARCHITECTURE.md](ARCHITECTURE.md) — architettura e modello multi-concessionaria
- [PRODUCT_BOOK.md](PRODUCT_BOOK.md) — prodotto e ambito funzionale
- [supabase/MIGRAZIONI.md](supabase/MIGRAZIONI.md) — come si applica una modifica al database
- `.github/instructions/` — regole valide per percorsi specifici

## Variabili d'ambiente

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`APP_BASE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `CRON_SECRET`.

Le `NEXT_PUBLIC_*` sono visibili a chiunque apra il sito: non ci si mette mai
niente che debba restare riservato.
