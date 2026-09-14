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

## Dove siamo rimasti (10/09/2026)

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
5. Rilancia il controllo da GitHub (scheda **Actions** → *Lo schema di
   produzione combacia con i file* → **Run workflow**) e verifica che diventi
   verde.

Applica i file **in ordine di data**, dal più vecchio al più recente: alcuni
danno per scontato quello che ha fatto il precedente.

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
