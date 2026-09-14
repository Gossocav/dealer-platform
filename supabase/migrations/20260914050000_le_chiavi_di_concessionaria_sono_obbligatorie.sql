-- Le quattro chiavi dell'isolamento diventano obbligatorie nel database.
--
-- **Perche'.** Il confronto settimanale segnala venti colonne dove i file
-- dicono "obbligatoria" e la produzione ammette il vuoto. La tentazione era
-- allineare i file alla produzione, perche' e' la produzione a girare; su
-- sedici di quelle venti puo' anche starci, ma su **quattro no**, e sono le
-- chiavi con cui ogni riga sa a quale concessionaria appartiene:
--
--     vehicles.dealer_id
--     appointments.dealer_id
--     customers.dealer_id
--     vehicle_images.vehicle_id
--
-- Rilassare i file vorrebbe dire scrivere nero su bianco che una chiave di
-- concessionaria puo' essere vuota. Una riga senza concessionaria non la vede
-- **nessuno**: non il gestionale, che filtra sempre per concessionaria, e non
-- il pubblico. Non da' errore: si perde in silenzio, e resta li' per sempre
-- perche' nessuno puo' nemmeno cancellarla dall'interfaccia.
--
-- **Non e' teoria: c'era gia' una riga cosi'.** Misurato il 14/09/2026 sulla
-- produzione: su `customers`, 1 riga su 5 aveva `dealer_id` vuoto. E' un
-- detrito lasciato dalle prove di isolamento del 22/08/2026 -- si chiama
-- "PROVA-SENZA-RETURN", ha l'indirizzo `p3@example.invalid` e **nessun
-- contatto collegato**. Va tolta prima del vincolo, altrimenti il vincolo non
-- entra.
--
-- Le altre tre colonne sono gia' pulite: `vehicles.dealer_id` 0 vuote su 372,
-- `appointments.dealer_id` 0 su 0, `vehicle_images.vehicle_id` 0 su 4.779.
--
-- **La riga si cancella per identificativo, non per nome.** Un nome si ripete;
-- un identificativo no. Se quella riga non ci fosse piu' -- gia' tolta a mano,
-- oppure identificativo diverso -- la cancellazione non fa niente e il
-- controllo qui sotto se ne accorge da solo.
--
-- **Nessuna riga viva viene toccata.** Il controllo si ferma se qualcuna delle
-- quattro colonne ha ancora un vuoto dopo la cancellazione: in quel caso c'e'
-- un'altra riga orfana che nessuno sapeva di avere, e va guardata prima.

begin;

-- Il detrito del 22/08/2026, per identificativo.
delete from public.customers
where id = '0ca91b18-304b-4545-9feb-d8cef0a639b7'
  and dealer_id is null;

-- Se restasse anche un solo vuoto, il vincolo fallirebbe a meta' e con un
-- messaggio che non dice dove. Meglio fermarsi qui e dirlo per esteso.
do $$
declare
  n bigint;
  orfane text[] := '{}';
  coppia text[];
begin
  foreach coppia slice 1 in array array[
    array['vehicles', 'dealer_id'],
    array['appointments', 'dealer_id'],
    array['customers', 'dealer_id'],
    array['vehicle_images', 'vehicle_id']
  ] loop
    execute format('select count(*) from public.%I where %I is null', coppia[1], coppia[2]) into n;
    if n > 0 then
      orfane := orfane || format('%s.%s (%s righe senza valore)', coppia[1], coppia[2], n);
    end if;
  end loop;

  if array_length(orfane, 1) > 0 then
    raise exception 'Non rendo obbligatorio niente: ci sono ancora righe senza chiave -> %', array_to_string(orfane, ', ')
      using hint = 'Guardare quelle righe prima: sono invisibili a chiunque, e nessuno puo cancellarle dall interfaccia.';
  end if;
end
$$;

alter table public.vehicles       alter column dealer_id  set not null;
alter table public.appointments   alter column dealer_id  set not null;
alter table public.customers      alter column dealer_id  set not null;
alter table public.vehicle_images alter column vehicle_id set not null;

commit;
