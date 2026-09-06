-- Il freno alle richieste ripetute, condiviso fra tutti i server.
--
-- Fino al 06/09/2026 il conteggio stava in una `Map` dentro il processo
-- (src/lib/api-rate-limit.ts). Su Vercel i server sono molti e usa-e-getta:
-- richieste mandate insieme finiscono su istanze diverse, ognuna col suo
-- contatore azzerato, e il freno non stringe. Non era rotto: era locale, in un
-- posto dove "locale" non vuol dire niente.
--
-- Qui il conteggio e' uno solo, nel database che gia' c'e'. Niente fornitori
-- nuovi, niente segreti nuovi.

create table if not exists public.rate_limits (
  chiave text primary key,
  conteggio integer not null default 0,
  scade_il timestamptz not null
);

-- Serve alla pulizia dei periodi scaduti, non alle letture: la tabella si
-- interroga sempre e solo per chiave primaria.
create index if not exists rate_limits_scade_il_idx on public.rate_limits (scade_il);

-- Nessuno deve poter leggere o scrivere questa tabella con la chiave pubblica
-- del sito: conterrebbe gli indirizzi di rete di chi ha compilato i moduli, e
-- soprattutto chi la sapesse svuotare disattiverebbe il freno.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

/**
 * Consuma un colpo del freno e dice se si e' superato il limite.
 *
 * Tutto in una istruzione sola: `insert ... on conflict do update` e'
 * atomico, quindi due server che chiamano nello stesso istante non possono
 * leggere lo stesso conteggio e scriverlo tutti e due. Era proprio il difetto
 * da togliere: contare in due posti diversi.
 *
 * Il periodo scaduto non si cancella, si riparte da 1 sulla stessa riga --
 * cosi' non serve nessun passaggio di pulizia prima di poter contare.
 */
create or replace function public.consuma_freno(
  p_chiave text,
  p_finestra_ms integer,
  p_massimo integer
)
returns table (superato boolean, restanti integer, scade_il timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ora timestamptz := now();
  v_conteggio integer;
  v_scade timestamptz;
begin
  if p_finestra_ms is null or p_finestra_ms <= 0 or p_massimo is null or p_massimo < 0 then
    raise exception 'consuma_freno: finestra e massimo devono essere positivi';
  end if;

  insert into public.rate_limits as r (chiave, conteggio, scade_il)
  values (p_chiave, 1, v_ora + make_interval(secs => p_finestra_ms / 1000.0))
  on conflict (chiave) do update
    set conteggio = case when r.scade_il <= v_ora then 1 else r.conteggio + 1 end,
        scade_il = case
                     when r.scade_il <= v_ora then v_ora + make_interval(secs => p_finestra_ms / 1000.0)
                     else r.scade_il
                   end
  returning r.conteggio, r.scade_il into v_conteggio, v_scade;

  -- Una riga ogni cento ripulisce i periodi finiti. Non serve un lavoro
  -- notturno in piu', e il costo si spalma su chi passa di qui: senza questo
  -- la tabella crescerebbe per sempre di una riga per indirizzo di rete.
  if random() < 0.01 then
    delete from public.rate_limits where scade_il < v_ora - interval '1 hour';
  end if;

  return query select
    v_conteggio > p_massimo,
    greatest(0, p_massimo - v_conteggio),
    v_scade;
end;
$$;

-- La chiave pubblica del sito non deve poter consumare il freno per conto di
-- qualcun altro, ne' azzerarlo: la funzione la chiama solo il server.
revoke all on function public.consuma_freno(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consuma_freno(text, integer, integer) to service_role;
