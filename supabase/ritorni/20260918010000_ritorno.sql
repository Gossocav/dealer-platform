-- Ritorno di 20260918010000_la_provenienza_delle_auto_sparite_dal_sito.sql.
--
-- Rimette a vuoto `origine_dati` **solo** sulle schede che quella migration ha
-- scritto. Riconoscerle e' il punto delicato di tutto il file, e ci sono
-- volute tre versioni.
--
-- **La prima era sbagliata.** Cercava le schede sparite dal sito con ogni
-- segno uguale a `{"fonte": "sito", "confermato_il": null}`, ma quella forma
-- e' **identica** a quella di una scheda che il ripasso aveva segnato mentre
-- era ancora sul sito e che e' sparita il giorno dopo. In produzione ce ne
-- sono due, e una delle due sarebbe stata svuotata da un ritorno che
-- prometteva di non toccarla. Un piano di ritorno che cancella cio' che
-- dichiarava di rispettare e' peggio di non averlo, perche' lo si usa proprio
-- quando le cose vanno gia' male.
--
-- **La seconda distingueva le schede da `vehicle_category`**, che il ripasso
-- segna sempre e la migration mai. Funzionava, ma si appoggiava a
-- un'imprecisione del ripasso che va corretta: il giorno della correzione
-- questo ritorno si sarebbe rotto **in silenzio**, e nessuno avrebbe fatto il
-- collegamento.
--
-- **Questa versione non si appoggia a niente di esterno.** La migration
-- scrive in ogni segno `ricostruito_il`, che dice una cosa vera -- quel segno
-- e' stato dedotto, non osservato -- e che **nessun'altra porta scrive**. Il
-- ritorno cerca esattamente quello: o il segno c'e', e allora l'ha scritto
-- quella migration, o non c'e'. Nessuna correzione futura del ripasso, dei
-- campi o delle diciture puo' farlo sbagliare.
--
-- E se una di quelle schede tornasse sul sito e venisse riletta davvero, il
-- ripasso sostituirebbe il segno intero: `ricostruito_il` sparirebbe e il
-- ritorno la lascerebbe stare. Che e' la cosa giusta, perche' quel segno non
-- sarebbe piu' suo.
--
-- Nessun dato del veicolo si perde: si cancella soltanto la registrazione di
-- **da dove** arrivava, e le schede tornano a dire "provenienza non
-- registrata" come prima.

begin;

update public.vehicles v
   set origine_dati = '{}'::jsonb
 where v.origine_dati <> '{}'::jsonb
   -- Ogni segno della scheda deve essere esattamente quello che la migration
   -- scrive. Basta un segno diverso -- una conferma, un disaccordo, una fonte
   -- diversa, un campo riletto davvero -- perche' la scheda resti com'e'.
   and not exists (
     select 1
       from jsonb_each(v.origine_dati) as s(campo, segno)
      where s.segno <> jsonb_build_object(
              'fonte', 'sito',
              'confermato_il', null,
              'ricostruito_il', '2026-09-18'
            )
   );

commit;

-- Come per la migration, l'ultima istruzione e' il conto: senza, l'editor SQL
-- direbbe soltanto "Success. No rows returned" e non si saprebbe quante
-- schede sono tornate indietro.
select
  count(*) filter (where v.origine_dati @? '$.*.ricostruito_il') as schede_ancora_ricostruite,
  count(*) filter (where v.origine_dati = '{}'::jsonb) as schede_senza_provenienza,
  count(*) filter (
    where v.origine_dati <> '{}'::jsonb and not (v.origine_dati @? '$.*.ricostruito_il')
  ) as segnate_dal_ripasso_intatte
from public.vehicles v
where v.import_source is not null
  and v.import_missing_since is not null;
