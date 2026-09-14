-- Ritorno di 20260914030000_via_le_dieci_tabelle_senza_codice.sql.
--
-- Ricrea le dieci tabelle **com'erano in produzione il 14/09/2026**: tipi
-- enumerati, colonne con i loro valori predefiniti, vincoli, indici, trigger,
-- protezione per riga accesa e forzata, regole di accesso e permessi.
--
-- Non e' stato scritto a mano ne' copiato dalle migration: e' stato generato
-- dallo schema ricostruito e poi allineato alla produzione, perche' su queste
-- tabelle i due lati non dicevano la stessa cosa. I cinque trigger
-- `set_updated_at` delle tabelle `import_` esistono in produzione e **non**
-- nei file: qui ci sono, perche' un ritorno deve rimettere quello che c'era,
-- non quello che avrebbe dovuto esserci.
--
-- **Una sola cosa non torna, ed e' voluto: le quattro regole di accesso di
-- `email_queue`** (lettura, inserimento, modifica e cancellazione per
-- `authenticated`, ognuna sulla propria concessionaria). Erano dormienti --
-- dal 10/09/2026 quella tabella non ha piu' nessun permesso per `anon` e
-- `authenticated`, e una regola senza permesso non fa passare nessuno -- ma
-- rimetterle vorrebbe dire riportare in vita requisiti scritti il 22/08/2026
-- per una coda di invio che non e' mai esistita. Se un giorno servira', si
-- riprogettera' con i requisiti di allora.
--
-- Le altre tabelle mantengono le loro regole: sono lo specchio di com'erano.

begin;

-- I tipi enumerati vanno creati prima delle tabelle che li usano.
create type public.import_source_type_t as enum ('csv', 'api', 'manual', 'feed');
create type public.import_schedule_t as enum ('manual', 'daily', 'weekly', 'monthly');
create type public.import_run_status_t as enum ('pending', 'running', 'completed', 'completed_with_errors', 'failed');
create type public.import_item_status_t as enum ('pending', 'imported', 'updated', 'duplicate', 'error', 'skipped');

\restrict llaXkO1pH4KP4MFh6otrwYeJwh0gsCLv4IcGxIi513HVESB12Q8jIa2A37VhGBE

CREATE TABLE public.dealer_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    subject_template text NOT NULL,
    body_text_template text,
    body_html_template text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dealer_email_templates_body_required CHECK ((COALESCE(NULLIF(btrim(body_text_template), ''::text), NULLIF(btrim(body_html_template), ''::text)) IS NOT NULL)),
    CONSTRAINT dealer_email_templates_name_not_empty CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT dealer_email_templates_subject_not_empty CHECK ((btrim(subject_template) <> ''::text))
);

ALTER TABLE ONLY public.dealer_email_templates FORCE ROW LEVEL SECURITY;

CREATE TABLE public.email_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    message_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    content_id text,
    disposition text DEFAULT 'attachment'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_attachments_disposition_check CHECK ((disposition = ANY (ARRAY['attachment'::text, 'inline'::text]))),
    CONSTRAINT email_attachments_size_positive CHECK ((size_bytes > 0))
);

ALTER TABLE ONLY public.email_attachments FORCE ROW LEVEL SECURITY;

CREATE TABLE public.email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    message_id uuid NOT NULL,
    queue_status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    lock_token uuid,
    lock_expires_at timestamp with time zone,
    last_error_code text,
    last_error_message text,
    dead_lettered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_queue_attempts_check CHECK (((attempts >= 0) AND (max_attempts >= 1) AND (attempts <= max_attempts))),
    CONSTRAINT email_queue_lock_required_for_locked_processing_check CHECK (((queue_status <> ALL (ARRAY['locked'::text, 'processing'::text])) OR ((locked_at IS NOT NULL) AND (lock_token IS NOT NULL) AND (lock_expires_at IS NOT NULL)))),
    CONSTRAINT email_queue_status_check CHECK ((queue_status = ANY (ARRAY['pending'::text, 'locked'::text, 'processing'::text, 'retry_wait'::text, 'completed'::text, 'dead_letter'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.email_queue FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_dedup_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    source_id uuid NOT NULL,
    dedup_key text NOT NULL,
    vehicle_id uuid,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_dedup_keys FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    item_id uuid,
    dealer_id uuid NOT NULL,
    error_code text,
    error_message text NOT NULL,
    details_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_errors FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    dealer_id uuid NOT NULL,
    source_id uuid NOT NULL,
    raw_hash text,
    normalized_key text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    mapped_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.import_item_status_t NOT NULL,
    vehicle_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_items FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    source_id uuid NOT NULL,
    name text NOT NULL,
    mapping_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    transform_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    validation_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_profiles FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    source_id uuid NOT NULL,
    import_profile_id uuid,
    status public.import_run_status_t NOT NULL,
    mode text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    total_rows integer DEFAULT 0 NOT NULL,
    imported_rows integer DEFAULT 0 NOT NULL,
    updated_rows integer DEFAULT 0 NOT NULL,
    error_rows integer DEFAULT 0 NOT NULL,
    duplicate_rows integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_runs FORCE ROW LEVEL SECURITY;

CREATE TABLE public.import_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    name text NOT NULL,
    source_type public.import_source_type_t NOT NULL,
    endpoint_url text,
    auth_type text,
    schedule_type public.import_schedule_t NOT NULL,
    active boolean DEFAULT true NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text
);

ALTER TABLE ONLY public.import_sources FORCE ROW LEVEL SECURITY;

CREATE TABLE public.platform_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text,
    subject_template text NOT NULL,
    body_text_template text,
    body_html_template text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_email_templates_body_required CHECK ((COALESCE(NULLIF(btrim(body_text_template), ''::text), NULLIF(btrim(body_html_template), ''::text)) IS NOT NULL)),
    CONSTRAINT platform_email_templates_code_not_empty CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT platform_email_templates_name_not_empty CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT platform_email_templates_subject_not_empty CHECK ((btrim(subject_template) <> ''::text))
);

ALTER TABLE ONLY public.platform_email_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.dealer_email_templates
    ADD CONSTRAINT dealer_email_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_storage_unique UNIQUE (dealer_id, message_id, storage_path);

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_sources
    ADD CONSTRAINT import_sources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_email_templates
    ADD CONSTRAINT platform_email_templates_pkey PRIMARY KEY (id);

CREATE INDEX dealer_email_templates_dealer_active_category_idx ON public.dealer_email_templates USING btree (dealer_id, is_active, category);

CREATE UNIQUE INDEX dealer_email_templates_name_ci_unique_idx ON public.dealer_email_templates USING btree (dealer_id, lower(name));

CREATE UNIQUE INDEX email_queue_active_message_unique_idx ON public.email_queue USING btree (dealer_id, message_id) WHERE (queue_status = ANY (ARRAY['pending'::text, 'locked'::text, 'processing'::text, 'retry_wait'::text]));

CREATE INDEX email_queue_dealer_status_next_attempt_idx ON public.email_queue USING btree (dealer_id, queue_status, next_attempt_at);

CREATE INDEX email_queue_status_next_attempt_idx ON public.email_queue USING btree (queue_status, next_attempt_at);

CREATE UNIQUE INDEX import_dedup_keys_dealer_source_dedup_unique_idx ON public.import_dedup_keys USING btree (dealer_id, source_id, dedup_key);

CREATE INDEX import_dedup_keys_dealer_source_last_seen_desc_idx ON public.import_dedup_keys USING btree (dealer_id, source_id, last_seen_at DESC);

CREATE INDEX import_errors_dealer_created_desc_idx ON public.import_errors USING btree (dealer_id, created_at DESC);

CREATE INDEX import_errors_run_id_idx ON public.import_errors USING btree (run_id);

CREATE INDEX import_items_dealer_source_status_idx ON public.import_items USING btree (dealer_id, source_id, status);

CREATE INDEX import_items_run_status_idx ON public.import_items USING btree (run_id, status);

CREATE INDEX import_runs_dealer_source_started_desc_idx ON public.import_runs USING btree (dealer_id, source_id, started_at DESC);

CREATE INDEX import_runs_dealer_status_started_desc_idx ON public.import_runs USING btree (dealer_id, status, started_at DESC);

CREATE INDEX platform_email_templates_active_category_idx ON public.platform_email_templates USING btree (is_active, category);

CREATE UNIQUE INDEX platform_email_templates_code_ci_unique_idx ON public.platform_email_templates USING btree (lower(code));

CREATE TRIGGER trg_dealer_email_templates_set_updated_at BEFORE UPDATE ON public.dealer_email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_email_queue_set_updated_at BEFORE UPDATE ON public.email_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_dedup_keys_set_updated_at BEFORE UPDATE ON public.import_dedup_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_items_set_updated_at BEFORE UPDATE ON public.import_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_profiles_set_updated_at BEFORE UPDATE ON public.import_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_runs_set_updated_at BEFORE UPDATE ON public.import_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_import_sources_set_updated_at BEFORE UPDATE ON public.import_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_platform_email_templates_set_updated_at BEFORE UPDATE ON public.platform_email_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.dealer_email_templates
    ADD CONSTRAINT dealer_email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dealer_email_templates
    ADD CONSTRAINT dealer_email_templates_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dealer_email_templates
    ADD CONSTRAINT dealer_email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_attachments
    ADD CONSTRAINT email_attachments_message_fk FOREIGN KEY (message_id, dealer_id) REFERENCES public.email_messages(id, dealer_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_message_fk FOREIGN KEY (message_id, dealer_id) REFERENCES public.email_messages(id, dealer_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.import_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_dedup_keys
    ADD CONSTRAINT import_dedup_keys_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.import_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.import_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.import_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.import_sources(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.import_sources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_import_profile_id_fkey FOREIGN KEY (import_profile_id) REFERENCES public.import_profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.import_sources(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_sources
    ADD CONSTRAINT import_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_sources
    ADD CONSTRAINT import_sources_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_sources
    ADD CONSTRAINT import_sources_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_sources
    ADD CONSTRAINT import_sources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.dealer_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_email_templates_cancellazione_propria ON public.dealer_email_templates FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY dealer_email_templates_inserimento_proprio ON public.dealer_email_templates FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY dealer_email_templates_lettura_propria ON public.dealer_email_templates FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY dealer_email_templates_modifica_propria ON public.dealer_email_templates FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_attachments_cancellazione_propria ON public.email_attachments FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY email_attachments_inserimento_proprio ON public.email_attachments FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY email_attachments_lettura_propria ON public.email_attachments FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY email_attachments_modifica_propria ON public.email_attachments FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;





ALTER TABLE public.import_dedup_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_dedup_keys_cancellazione_propria ON public.import_dedup_keys FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_dedup_keys_inserimento_proprio ON public.import_dedup_keys FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_dedup_keys_lettura_propria ON public.import_dedup_keys FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_dedup_keys_modifica_propria ON public.import_dedup_keys FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_errors_cancellazione_propria ON public.import_errors FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_errors_inserimento_proprio ON public.import_errors FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_errors_lettura_propria ON public.import_errors FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_errors_modifica_propria ON public.import_errors FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_items_cancellazione_propria ON public.import_items FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_items_inserimento_proprio ON public.import_items FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_items_lettura_propria ON public.import_items FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_items_modifica_propria ON public.import_items FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.import_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_profiles_cancellazione_propria ON public.import_profiles FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_profiles_inserimento_proprio ON public.import_profiles FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_profiles_lettura_propria ON public.import_profiles FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_profiles_modifica_propria ON public.import_profiles FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_runs_cancellazione_propria ON public.import_runs FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_runs_inserimento_proprio ON public.import_runs FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_runs_lettura_propria ON public.import_runs FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_runs_modifica_propria ON public.import_runs FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_sources_cancellazione_propria ON public.import_sources FOR DELETE TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_sources_inserimento_proprio ON public.import_sources FOR INSERT TO authenticated WITH CHECK ((COALESCE(dealer_id, public.current_dealer_id()) = public.current_dealer_id()));

CREATE POLICY import_sources_lettura_propria ON public.import_sources FOR SELECT TO authenticated USING ((dealer_id = public.current_dealer_id()));

CREATE POLICY import_sources_modifica_propria ON public.import_sources FOR UPDATE TO authenticated USING ((dealer_id = public.current_dealer_id())) WITH CHECK ((dealer_id = public.current_dealer_id()));

ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_email_templates_select_active ON public.platform_email_templates FOR SELECT TO authenticated USING ((is_active = true));

GRANT ALL ON TABLE public.dealer_email_templates TO service_role;

GRANT ALL ON TABLE public.email_attachments TO service_role;

GRANT ALL ON TABLE public.email_queue TO service_role;

GRANT ALL ON TABLE public.import_dedup_keys TO service_role;

GRANT ALL ON TABLE public.import_errors TO service_role;

GRANT ALL ON TABLE public.import_items TO service_role;

GRANT ALL ON TABLE public.import_profiles TO service_role;

GRANT ALL ON TABLE public.import_runs TO service_role;

GRANT ALL ON TABLE public.import_sources TO service_role;

GRANT ALL ON TABLE public.platform_email_templates TO service_role;

\unrestrict llaXkO1pH4KP4MFh6otrwYeJwh0gsCLv4IcGxIi513HVESB12Q8jIa2A37VhGBE

commit;
