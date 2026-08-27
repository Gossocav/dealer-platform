-- Il mese di immatricolazione delle vetture importate dai siti delle
-- concessionarie.
--
-- Perche' una colonna a se' e non dentro "registration_date": quella e' una
-- data piena e per scriverla servirebbe un giorno che il sito di origine non
-- dichiara. Le pagine scrivono "Immatricolazione 09/2018" e basta. Un primo
-- del mese inventato comparirebbe sulle schede come se fosse il giorno vero
-- dell'immatricolazione -- lo stesso difetto gia' pagato due volte con i dati
-- finti mostrati accanto a quelli veri.
--
-- Testo e non numero: e' un dato letto da una pagina altrui e si conserva
-- come lo si e' letto, normalizzato a due cifre ("01".."12").
alter table public.vehicles
  add column if not exists registration_month text;

-- Il vincolo vale come seconda serratura: il codice scarta gia' i mesi fuori
-- scala (src/lib/vehicles.ts), ma un "13" scritto da un'importazione futura
-- non deve poter entrare nel database.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicles_registration_month_valido'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_registration_month_valido
      check (registration_month is null or registration_month ~ '^(0[1-9]|1[0-2])$');
  end if;
end
$$;

comment on column public.vehicles.registration_month is
  'Mese di immatricolazione "01".."12", quando si conosce il mese ma non il giorno (importazioni dai siti delle concessionarie).';
