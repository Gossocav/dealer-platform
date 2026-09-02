-- Due concessionarie non possono avere la stessa email.
--
-- Trovato durante la verifica del 02/09/2026 chiesta dal titolare. Fino a qui
-- l'unicita' dell'email esisteva solo nel codice: l'attivazione controlla se
-- c'e' gia' un account con quell'indirizzo e si ferma. Ma la stessa colonna la
-- puo' riscrivere il concessionario da solo, dalle Impostazioni, nel campo
-- "Email commerciale" -- e li' non controllava niente nessuno. Bastava
-- scriverci l'indirizzo di un'altra concessionaria.
--
-- Non e' un dettaglio estetico, perche' `dealers.email` non e' solo un
-- recapito: e' la chiave con cui l'attivazione decide "questo account esiste
-- gia'". Con due righe uguali, l'attivazione diretta si ferma con un errore
-- (la lettura si aspetta una riga sola e ne trova due) e un'attivazione da
-- Richieste demo puo' agganciarsi alla concessionaria sbagliata e
-- sovrascriverla con i dati di un'altra.
--
-- **Indice parziale e non vincolo di colonna**, per tre motivi:
--   1. `lower(btrim(email))`: "Mario@x.it" e "mario@x.it" sono lo stesso
--      indirizzo, e un vincolo che non lo sapesse si aggirerebbe con una
--      maiuscola;
--   2. la condizione esclude le righe senza email e quelle con la stringa
--      vuota: alcune concessionarie non l'hanno ancora messa, e due caselle
--      vuote non sono un doppione (Postgres tratta gia' NULL cosi', ma la
--      stringa vuota no);
--   3. un vincolo di colonna avrebbe imposto anche il confronto esatto, cioe'
--      meno di quello che serve.
--
-- Provata su un Postgres 15 vero prima di spedirla, non solo letta da un test:
-- inserimento uguale rifiutato, stessa email con maiuscole diverse rifiutata,
-- due righe senza email accettate, due righe con email vuota accettate.

begin;

-- Se in produzione ci fossero gia' dei doppioni, l'indice non nascerebbe e
-- Postgres direbbe soltanto "could not create unique index". Meglio fermarsi
-- prima dicendo **quali** indirizzi sono ripetuti: sono quelli da correggere a
-- mano prima di riprovare. Al 02/09/2026 non ce n'erano (verificato sui dati
-- di produzione: 3 concessionarie, nessuna email ripetuta).
do $$
declare
  ripetute text;
begin
  select string_agg(indirizzo, ', ')
    into ripetute
    from (
      select lower(btrim(email)) as indirizzo
        from public.dealers
       where email is not null
         and btrim(email) <> ''
       group by 1
      having count(*) > 1
    ) as doppioni;

  if ripetute is not null then
    raise exception 'Queste email sono usate da piu'' di una concessionaria: %. Correggile prima di applicare questa modifica.', ripetute
      using errcode = '23505';
  end if;
end
$$;

create unique index if not exists dealers_email_unica_idx
  on public.dealers (lower(btrim(email)))
  where email is not null and btrim(email) <> '';

comment on index public.dealers_email_unica_idx is
  'Una email appartiene a una sola concessionaria. Confronto senza distinzione fra maiuscole e minuscole e senza spazi ai lati; le righe senza email o con email vuota restano fuori.';

commit;
