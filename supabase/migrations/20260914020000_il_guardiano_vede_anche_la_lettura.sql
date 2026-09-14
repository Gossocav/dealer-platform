-- Il guardiano vedeva solo meta' delle serrature che deve sorvegliare.
--
-- **Cosa mancava.** I permessi **colonna per colonna** si leggevano soltanto
-- per INSERT e UPDATE. Ma su `vehicles` e `dealers` la serratura che conta e'
-- in **lettura**: sessantuno permessi di colonna decidono cosa il mondo vede
-- con la sola chiave pubblica del sito, e oggi tengono chiusi la targa, il
-- numero di telaio, il codice fiscale della concessionaria e il piano del suo
-- abbonamento. Nessuno di quei sessantuno compariva nell'inventario.
--
-- Misurato il 14/09/2026 interrogando la produzione come farebbe un estraneo:
-- su `vehicles` 39 colonne su 46 sono leggibili da chiunque e 7 no (targa,
-- telaio, cliente e i quattro campi dell'importazione); su `dealers` 22 su 39,
-- con chiusi piano, stato dell'abbonamento, codice fiscale e i campi della
-- demo. Le serrature ci sono e sono giuste: era il guardiano a non vederle.
--
-- Un "grant select (plate) on public.vehicles to anon" avrebbe aperto la targa
-- di ogni vettura **lasciando verde il controllo settimanale**.
--
-- **E' il quarto caso di "scritto giusto, fatto a meta'".** Il commento della
-- migration che ha creato questa famiglia spiegava perfettamente il pericolo
-- -- "un grant di troppo aprirebbe subscription_plan, e il confronto
-- resterebbe verde" -- e la regola e' stata applicata a UPDATE e non a SELECT,
-- che e' il verso da cui si legge.
--
-- **Cos'altro era fuori dalla sorveglianza.** Fatto il giro completo, si
-- aggiungono qui anche:
--
-- 1. i permessi concessi a **chiunque** (`to public`), che non portano il nome
--    di nessun ruolo e sfuggivano a tutte e due le famiglie dei permessi;
-- 2. le **viste**, che nessuna famiglia guardava perche' tutte filtrano
--    `relkind = 'r'`. Una vista legge con i permessi di chi l'ha creata, se
--    non e' dichiarata `security_invoker`.
--
-- Tutte e due sono vuote oggi, su tutti e due i lati: il confronto non cambia
-- di una riga. Servono perche' la prima che nascera' si veda.
--
-- **Cosa resta fuori, e va deciso a parte** (ognuna puo' far comparire
-- differenze vere, e va guardata una per volta, non dentro una pulizia):
-- l'appartenenza ai ruoli, i permessi sullo schema, le impostazioni
-- predefinite per le tabelle future, le sequenze, i permessi di esecuzione per
-- i ruoli diversi da anon e authenticated, e il contrassegno "pubblico" dei
-- magazzini di file.
--
-- **Nessun dato viene toccato**: si riscrive una funzione di sola lettura.

begin;

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
    -- I permessi si leggono dal catalogo vero (`relacl`), non da
    -- information_schema: quella vista elenca solo i sette permessi dello
    -- standard e **non vede MAINTAIN**, che Postgres 17 concede con
    -- `grant all` e che Supabase regala ad anon e authenticated. Misurato il
    -- 10/09/2026: stessa tabella, information_schema ne mostra sette,
    -- aclexplode otto.
    'permessi', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname || ' | ' || pg_get_userbyid(acl.grantee) || ' | ' || acl.privilege_type as riga
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        where n.nspname = 'public' and c.relkind = 'r'
          and pg_get_userbyid(acl.grantee) in ('anon', 'authenticated', 'service_role')
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
          --
          -- L'impronta si calcola sul testo **senza commenti e senza spazi**.
          -- In questo progetto le funzioni arrivano in produzione incollate a
          -- mano nell'editor SQL, e un rientro diverso o un commento in piu'
          -- non sono una differenza: sono lo stesso codice. Con l'impronta
          -- sul testo grezzo sedici funzioni identiche risultavano diverse.
          || ' | ' || md5(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
                   '/\*.*?\*/', '', 'g'),
                 '\s+', ' ', 'g')
             ) as riga
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
    -- Chi puo' **eseguire** le funzioni. E' la famiglia che avrebbe trovato
    -- da sola il difetto del 05/09: sette funzioni `security definer`
    -- restavano eseguibili con la sola chiave pubblica del sito, perche'
    -- `revoke ... from public` non toglie il permesso che Supabase concede
    -- ad `anon`. Nessuno se n'era accorto per due mesi.
    'permessi_funzioni', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
          || ' | ' || ruolo
          || ' | esegue=' || has_function_privilege(ruolo, p.oid, 'execute')::text as riga
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'), ('authenticated')) as r(ruolo)
        where n.nspname = 'public'
      ) t
    ),
    -- I permessi **colonna per colonna** in scrittura. Sono la serratura che
    -- tiene davvero: su `dealers` una concessionaria puo' aggiornare la
    -- propria riga -- la regola di accesso glielo consente -- ma non le
    -- colonne del piano e dell'abbonamento, perche' il permesso di scrittura
    -- non le nomina. Senza questa famiglia l'inventario direbbe "permesso di
    -- UPDATE presente" e non si accorgerebbe se un giorno quell'elenco
    -- diventasse la tabella intera: un `grant update on public.dealers to
    -- authenticated` di troppo aprirebbe subscription_plan e
    -- subscription_status, e il confronto resterebbe verde.
    --
    -- Si leggono da `pg_attribute.attacl`, che contiene **solo** i permessi
    -- dati colonna per colonna: dove il permesso e' sull'intera tabella qui
    -- non compare niente, e l'inventario non si riempie di una riga per ogni
    -- colonna di ogni tabella.
    'permessi_colonne', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname || '.' || a.attname
          || ' | ' || pg_get_userbyid(acl.grantee)
          || ' | ' || acl.privilege_type as riga
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        cross join lateral aclexplode(a.attacl) as acl
        where n.nspname = 'public'
          and c.relkind = 'r'
          and a.attnum > 0
          and not a.attisdropped
          and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
          and pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
      ) t
    ),
    -- Le regole dei magazzini dei file. Stanno nello schema `storage`, che
    -- non e' `public`: senza questa famiglia una fotografia aperta a tutti
    -- non comparirebbe da nessuna parte nel confronto.
    'politiche_storage', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select tablename || ' | ' || policyname
          || ' | ' || cmd
          || ' | ' || coalesce(roles::text, '-')
          || ' | using=' || coalesce(qual, '-')
          || ' | check=' || coalesce(with_check, '-') as riga
        from pg_policies
        where schemaname = 'storage'
      ) t
    ),
    -- **Chi ha dato un permesso a CHIUNQUE.** Le due famiglie qui sopra
    -- guardano i ruoli per nome, e un permesso concesso a `public` -- cioe' a
    -- tutti, compreso `anon` -- non porta il nome di nessun ruolo: in
    -- `aclexplode` il beneficiario e' zero. Restava quindi invisibile, e
    -- `grant select on public.vehicles to public` non avrebbe fatto suonare
    -- niente. Qui si guarda **solo** quel caso, perche' in questo progetto la
    -- risposta giusta e' sempre "nessuna riga": ogni permesso si da' a un
    -- ruolo per nome.
    'permessi_a_chiunque', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname || ' | tabella | ' || acl.privilege_type as riga
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        where n.nspname = 'public' and c.relkind = 'r' and acl.grantee = 0
        union all
        select c.relname || '.' || a.attname || ' | colonna | ' || acl.privilege_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        cross join lateral aclexplode(a.attacl) as acl
        where n.nspname = 'public' and c.relkind = 'r'
          and a.attnum > 0 and not a.attisdropped and acl.grantee = 0
      ) t
    ),
    -- **Le viste.** Tutte le famiglie qui sopra guardano solo le tabelle vere
    -- (`relkind = 'r'`). Una vista non ha protezione per riga propria: mostra
    -- quello che la sua interrogazione dice, e se e' definita
    -- `security_invoker = off` -- il modo predefinito -- legge con i permessi
    -- di chi l'ha creata, scavalcando le regole di chi la interroga. Al
    -- 14/09/2026 in `public` non ce n'e' nessuna, e questa famiglia serve
    -- perche' la prima che nascera' non passi inosservata.
    'viste', (
      select coalesce(jsonb_agg(riga order by riga), '[]'::jsonb) from (
        select c.relname
          || ' | ' || case c.relkind when 'v' then 'vista' else 'vista materializzata' end
          || ' | ' || md5(regexp_replace(pg_get_viewdef(c.oid), '\s+', ' ', 'g')) as riga
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v', 'm')
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

commit;
