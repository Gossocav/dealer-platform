-- Ritorno di 20260910200000_il_sito_pubblico_legge_soltanto.sql:
-- rimette ad anon esattamente i permessi che aveva in produzione il
-- 10/09/2026 su vehicles, dealers e vehicle_images. La lettura non viene
-- toccata da nessuna delle due direzioni.

begin;

grant insert, update, delete, truncate, references, trigger on public.vehicles to anon;
grant insert, update, delete, truncate, references, trigger on public.dealers to anon;
grant insert, update, delete, truncate, references, trigger on public.vehicle_images to anon;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on public.vehicles, public.dealers, public.vehicle_images to anon';
  end if;
end
$$;

commit;
