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

**Come si misura se ha funzionato**, e va fatto dopo che la correzione e' in
produzione **e** la sincronizzazione ha girato un giro intero (tre ore):
si contano le schede pubblicate con `updated_at` nelle ultime 24 ore. Erano
**241 su 276**. Se scendono a una manciata, ha funzionato; se restano tante,
la scrittura arriva da un'altra porta e va trovata quella.

**Quanto del 262 e' "rifiuto" e quanto e' "catalogo cresciuto dopo".**
Domanda giusta, e la risposta e' parziale -- misurata il 21/09/2026 sulle
274 auto pubblicate:

| | quante | quota |
|---|---|---|
| gia' esistenti durante la finestra di scansione (fino al 30/08) | **209** | 76% |
| nate **dopo** che Google aveva smesso di passare | 65 | 24% |

**Quindi no, in generale non regge**: tre quarti del catalogo c'era gia' e
non e' stato preso.

**Il conto fino in fondo, e corregge anche la prima stima.** Sembrerebbe
209 meno le 43 indicizzate, cioe' 166 -- ma quel sottrarre assume che tutte
e 43 stiano dentro le 209, e non e' vero. Le 43 si dividono cosi':

| dove stanno le 43 indicizzate | quante |
|---|---|
| pubblicate oggi e gia' esistenti al 30/08 | **28** |
| pubblicate oggi ma nate dopo il 30/08 | 3 |
| non piu' pubblicate (vendute o tolte dal sito) | 12 |

Quindi, sulle 274 pubblicate di oggi:

| | quante |
|---|---|
| esistevano durante la finestra di scansione | 209 |
| di queste, lette e indicizzate | **28** |
| **potevano essere lette e non lo sono state** | **181** |
| non hanno mai avuto occasione (nate dopo) | 62 |

**181, non 166.** L'attenuante del "catalogo cresciuto dopo" copre **un
quarto** del problema, non il problema: tre auto su quattro fra quelle non
indicizzate erano li', pubblicate e leggibili, mentre Google passava.

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
