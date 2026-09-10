begin;

-- ============================================================
-- Via le due differenze rimaste fra produzione e file
-- ============================================================
--
-- Trovate confrontando la ricostruzione da zero con la produzione, tabella
-- per tabella. Servono a far dire la stessa cosa al database e al codice:
-- finche' divergono, il controllo settimanale sarebbe rosso dal primo giorno
-- per due cose che sappiamo gia'.
--
-- ------------------------------------------------------------
-- 1) leads_inserimento_marketplace
-- ------------------------------------------------------------
-- I file la cancellano gia': lo fa 20260822030000, che mette al suo posto un
-- trigger. Quella migration **e' arrivata in produzione** -- verificato: il
-- database risponde con il messaggio esatto di quel trigger -- quindi la
-- regola e' stata rimessa a mano dopo. Qui si ripete cio' che il file dice.
--
-- **Non e' una porta aperta**, e conviene scrivere perche', perche' a prima
-- vista sembra di si': la regola vale per `anon` e `authenticated`, e il suo
-- controllo non chiede che l'automobile sia tua.
--
--   * `anon` non ha **nessun** permesso su `leads` dal 05/09 (`revoke all`
--     su ogni tabella fuori dalla vetrina), quindi non puo' inserire.
--   * `authenticated` il permesso ce l'ha, ma il controllo contiene un
--     `exists` su `vehicles`, e **quel sotto-comando gira con i permessi di
--     chi scrive**: un concessionario vede solo le proprie automobili.
--     Misurato in laboratorio: `exists` sull'auto di un altro -> falso,
--     inserimento respinto.
--
-- Per le proprie automobili basta gia' `leads_inserimento_proprio`, che
-- resta. Provato dopo la pulizia: creazione manuale dal gestionale con e
-- senza concessionaria indicata, contatto dal sito con la chiave di
-- servizio, e il tentativo di scrivere nel gestionale di un altro -- tutti
-- con l'esito giusto.

-- Il controllo sulla tabella viene **prima di ogni modifica**: se si
-- ferma qui, non e' stato ancora cambiato niente. Misurato: mettendolo
-- dopo, il freno scattava ma la regola dei lead era gia' stata tolta.
do $$
declare
  v_righe bigint;
begin
  if to_regclass('public.storage_objects') is null then
    return;
  end if;

  execute 'select count(*) from public.storage_objects' into v_righe;

  if v_righe > 0 then
    raise exception
      'public.storage_objects contiene % righe: non si cancella una tabella con dentro dei dati.', v_righe
      using errcode = 'P0001';
  end if;
end $$;

drop policy if exists leads_inserimento_marketplace on public.leads;

-- ------------------------------------------------------------
-- 2) public.storage_objects
-- ------------------------------------------------------------
-- Tabella **vuota**, che nessuna migration crea e che nessuna riga di codice
-- nomina. Veniva dai due file persi del ramo di salvataggio
-- (20260704000001 e 20260705000001), rimasti fuori da main: in produzione e'
-- nata e li' e' restata.
--
-- Si cancella **senza CASCADE**: se un domani qualcosa dipendesse da lei, il
-- comando deve fermarsi senza cambiare niente, invece di portarsi via anche
-- quello. E prima si controlla che sia davvero vuota: cancellare una tabella
-- con dentro dei dati non si annulla.
--
-- Su una ricostruzione da zero la tabella non esiste, e questo blocco non fa
-- niente invece di fallire.

drop table if exists public.storage_objects;

commit;
