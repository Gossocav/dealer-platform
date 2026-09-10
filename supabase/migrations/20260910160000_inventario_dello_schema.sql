-- ============================================================
-- L'inventario dello schema, per confrontare produzione e file
-- ============================================================
--
-- **Perche' esiste.** Il controllo settimanale precedente leggeva il
-- *quaderno* delle migration (`supabase migration list`) e non il database:
-- in questo progetto le migration si applicano a mano, quel quaderno e' fermo
-- a luglio, e il controllo diceva "ne mancano 77" da sempre. Un allarme che
-- suona sempre e' un allarme che si smette di leggere.
--
-- Adesso si confronta lo **schema vero** con quello che i file producono. Ma
-- il catalogo di Postgres (`pg_policies`, `pg_tables`, ...) non e'
-- raggiungibile dall'esterno: PostgREST espone solo lo schema `public`.
-- Questa funzione fa da finestra, e restituisce l'inventario in una forma
-- gia' ordinata e confrontabile riga per riga.
--
-- **La stessa funzione gira sui due lati.** Nasce da questa migration, quindi
-- una ricostruzione da zero ce l'ha identica: il confronto non puo' sbagliare
-- perche' le due interrogazioni sono diverse.
--
-- **Sola lettura.** Legge il catalogo e non tocca niente. E' `security
-- definer` perche' deve vedere il catalogo per intero, e per questo e'
-- riservata alla sola chiave di servizio: a un estraneo direbbe com'e' fatta
-- ogni serratura della piattaforma.

create or replace function public.inventario_schema()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tabelle', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname
          || ' | rls=' || c.relrowsecurity::text
          || ' | forzata=' || c.relforcerowsecurity::text as riga
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ) t
    ),
    'colonne', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select table_name || '.' || column_name
          || ' | ' || data_type
          || ' | null=' || is_nullable
          || ' | default=' || coalesce(column_default, '-') as riga
        from information_schema.columns
        where table_schema = 'public'
      ) t
    ),
    'politiche', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select tablename || ' | ' || policyname
          || ' | ' || cmd
          || ' | ' || coalesce(roles::text, '-')
          || ' | using=' || coalesce(qual, '-')
          || ' | check=' || coalesce(with_check, '-') as riga
        from pg_policies
        where schemaname = 'public'
      ) t
    ),
    'permessi', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select table_name || ' | ' || grantee || ' | ' || privilege_type as riga
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('anon', 'authenticated', 'service_role')
      ) t
    ),
    'vincoli', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname || ' | ' || con.conname
          || ' | ' || pg_get_constraintdef(con.oid) as riga
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
      ) t
    ),
    'funzioni', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
          -- Il corpo si riduce a un'impronta: interessa **che cambi**, non
          -- vederlo per intero in un messaggio d'errore lungo trecento righe.
          || ' | ' || md5(pg_get_functiondef(p.oid)) as riga
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      ) t
    ),
    'trigger', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname || ' | ' || tg.tgname
          || ' | ' || pg_get_triggerdef(tg.oid) as riga
        from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
      ) t
    ),
    'indici', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select tablename || ' | ' || indexname || ' | ' || indexdef as riga
        from pg_indexes
        where schemaname = 'public'
      ) t
    )
  )
$$;

-- Riservata al server. A un estraneo direbbe com'e' fatta ogni serratura.
revoke all on function public.inventario_schema() from public;
revoke all on function public.inventario_schema() from anon;
revoke all on function public.inventario_schema() from authenticated;
grant execute on function public.inventario_schema() to service_role;
