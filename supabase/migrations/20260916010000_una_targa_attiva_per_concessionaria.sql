-- Una sola auto attiva per targa, dentro la stessa concessionaria.
--
-- **Perche' serve.** Il 16/09/2026 "Duplica" copiava ogni colonna della
-- scheda, targa e telaio compresi. Due auto con la stessa targa non sono un
-- fastidio: sono un dato sbagliato che si propaga -- con quella targa si
-- segnano vendute tutte e due (`auto-da-chiudere.ts`), i documenti delle due
-- si mescolano (`archivio-documenti.ts`), e la ricerca a pagamento si paga
-- due volte per la stessa vettura. Il giorno prima si era impedito di
-- *scrivere* una targa finta (`src/lib/targa.ts`), non di *duplicare* una
-- vera. Il codice della duplicazione e' stato corretto; questo indice fa si'
-- che la prossima porta -- un'importazione da file con la colonna "Targa",
-- una scheda scritta due volte -- non possa rifare lo stesso danno.
--
-- **Cosa conta come "attiva".** Tutto cio' che non e' venduto ne'
-- archiviato: bozza, pubblicata, in revisione, e qualunque stato nuovo che
-- verra'. Si esclude per elenco (`sold`, `archived`) e non si include per
-- elenco, cosi' uno stato aggiunto domani nasce protetto invece che
-- scoperto.
--
-- **Il caso legittimo che deve passare:** la stessa auto che torna --
-- venduta, poi ripresa in permuta. La riga vecchia e' `sold`, la nuova e'
-- attiva: non sono in conflitto.
--
-- **La forma confrontata e' quella normalizzata**, non il testo com'e':
-- "ga 123 bc" e "GA123BC" sono la stessa targa scritta da due persone
-- diverse. E' la stessa normalizzazione di `normalizzaTarga` in
-- `src/lib/targa.ts`: maiuscolo, senza spazi, punti, trattini e sottolineature.
--
-- **In produzione il 16/09/2026:** 5 targhe distinte, 0 ripetute nella
-- stessa concessionaria. L'indice entra senza rifiutare niente.
--
-- **Quando scatta** il database risponde `23505` nominando questo indice; il
-- gestionale lo traduce in "Hai gia' un'auto attiva con questa targa"
-- (`messaggioTargaDoppia` in `src/lib/targa.ts`). Un errore tecnico mostrato
-- al concessionario e' un difetto, non un dettaglio.
--
-- Il telaio **non** e' qui: in produzione due auto portano il telaio `12345`,
-- un segnaposto, e il telaio non ha ancora un controllo di forma. Prima il
-- controllo, poi la pulizia, poi il suo indice (migration a parte).
--
-- Provata su Postgres 17 il 16/09/2026: doppione rifiutato, doppione con
-- spazi rifiutato, venduta + attiva accettate, due targhe vuote accettate.

begin;

create unique index if not exists vehicles_una_targa_attiva_per_concessionaria
  on public.vehicles (dealer_id, upper(regexp_replace(plate, '[\s.\-_]', '', 'g')))
  where plate is not null and status not in ('sold', 'archived');

commit;
