-- Il regime IVA di una vettura, letto dal sito e non piu' indovinato.
--
-- **Cosa c'era.** `vehicles.vat_exposed`, un si'/no. Al 15/09/2026 in
-- produzione vale `true` su **zero righe su 372**, e **nessuna riga di codice
-- la legge o la scrive**: zero riferimenti in tutto `src/`, nemmeno nei test.
-- E' una colonna nata e mai usata.
--
-- **Perche' non si travasa.** Travasare quello zero vorrebbe dire scrivere su
-- 372 schede "non e' a IVA esposta". Non e' quello che dice: dice **"nessuno
-- l'ha mai detto"**. E' la stessa distinzione fra `null` e `0` che questo
-- progetto ha gia' pagato tre volte -- lo storico finto, il margine a zero, il
-- costo totale parziale -- e la regola sta in AGENTS.md sotto "un dato
-- mancante non vale zero". Si cancella.
--
-- **Cosa arriva al suo posto.** `vat_regime`, con due valori e il vuoto:
--
--     'esposta'   IVA esposta al 22%: il compratore con partita IVA la scarica
--     'margine'   regime del margine: l'IVA non si espone e non si scarica
--     null        non lo sappiamo ancora
--
-- Il vuoto **e' un valore**, non una dimenticanza: su una vettura appena
-- importata da un sito che non lo dichiara, "non lo so" e' la risposta giusta.
--
-- **Arriva gratis, e si autoverifica.** Il blocco dati di MotorK che i siti
-- delle concessionarie pubblicano contiene il campo `vat`, e la
-- sincronizzazione scarica gia' quelle pagine. Misurato il 14/09/2026 su 80
-- schede di ponginibbigroup.it: **presente su tutte e 80**, e l'incrocio con
-- la categoria e' pulitissimo --
--
--     km 0     vat = 22 su 17 schede su 17   (una km 0 e' sempre a IVA esposta)
--     usate    vat = 22 su 20, vat = 0 su 28  (la distribuzione normale)
--
-- Diciassette km 0 su diciassette a IVA esposta non e' un caso: se quel campo
-- fosse spazzatura non produrrebbe questa regolarita'. `vat = 22` diventa
-- `esposta`, `vat = 0` diventa `margine`.
--
-- **Si mostra sull'annuncio pubblico**, come faceva `vat_exposed`: per un
-- compratore con partita IVA e' un'informazione che cambia il prezzo vero. Il
-- permesso e' colonna per colonna, quindi va concesso a mano -- una colonna
-- nuova nasce chiusa.
--
-- **E resta una proposta finche' il concessionario non conferma**: la fonte
-- viene scritta in `vehicles.origine_dati` (vedi 20260915010000), e un dato
-- proposto si mostra ma non si usa.

begin;

alter table public.vehicles
  add column if not exists vat_regime text;

comment on column public.vehicles.vat_regime is
  'Regime IVA: esposta (22% scaricabile), margine (non si espone), oppure vuoto = non lo sappiamo. Letto dal campo vat del blocco MotorK, confermato dal concessionario. Ha sostituito vat_exposed, che nessuno usava.';

alter table public.vehicles drop constraint if exists vehicles_vat_regime_check;
alter table public.vehicles
  add constraint vehicles_vat_regime_check
  check (vat_regime is null or vat_regime in ('esposta', 'margine'));

-- Il pubblico la legge, come leggeva quella vecchia. I permessi su `vehicles`
-- sono colonna per colonna: `grant select (...)` si affianca a quelli gia'
-- dati, non li sostituisce.
grant select (vat_regime) on public.vehicles to anon;

-- La colonna vecchia: vergine su tutte e 372 le righe, e nessuna riga di
-- codice la nomina. Il suo permesso pubblico se ne va con lei.
alter table public.vehicles drop column if exists vat_exposed;

commit;
