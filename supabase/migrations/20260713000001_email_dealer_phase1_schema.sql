begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_threads_id_dealer_unique unique (id, dealer_id)
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  thread_id uuid not null,
  direction text not null default 'outbound',
  status text not null default 'draft',
  subject text not null default '',
  from_email text,
  from_name text,
  reply_to_email text,
  to_recipients jsonb not null default '[]'::jsonb,
  cc_recipients jsonb not null default '[]'::jsonb,
  bcc_recipients jsonb not null default '[]'::jsonb,
  body_text text,
  body_html text,
  provider text,
  provider_message_id text,
  idempotency_key text,
  error_code text,
  error_message text,
  queued_at timestamptz,
  processing_at timestamptz,
  sending_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_messages_direction_check check (direction in ('outbound', 'inbound')),
  constraint email_messages_status_check check (status in ('draft', 'queued', 'processing', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'cancelled')),
  constraint email_messages_recipients_json_check check (
    jsonb_typeof(to_recipients) = 'array'
    and jsonb_typeof(cc_recipients) = 'array'
    and jsonb_typeof(bcc_recipients) = 'array'
  ),
  constraint email_messages_outbound_ready_subject_check check (
    not (direction = 'outbound' and status in ('queued', 'processing', 'sending', 'sent', 'delivered', 'bounced', 'complained'))
    or btrim(subject) <> ''
  ),
  constraint email_messages_outbound_ready_from_check check (
    not (direction = 'outbound' and status in ('queued', 'processing', 'sending', 'sent', 'delivered', 'bounced', 'complained'))
    or (
      from_email is not null
      and btrim(from_email) <> ''
      and from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
  ),
  constraint email_messages_outbound_ready_to_check check (
    not (direction = 'outbound' and status in ('queued', 'processing', 'sending', 'sent', 'delivered', 'bounced', 'complained'))
    or jsonb_array_length(to_recipients) > 0
  ),
  constraint email_messages_outbound_ready_body_check check (
    not (direction = 'outbound' and status in ('queued', 'processing', 'sending', 'sent', 'delivered', 'bounced', 'complained'))
    or coalesce(nullif(btrim(body_text), ''), nullif(btrim(body_html), '')) is not null
  ),
  constraint email_messages_id_dealer_unique unique (id, dealer_id),
  constraint email_messages_thread_fk foreign key (thread_id, dealer_id)
    references public.email_threads(id, dealer_id) on delete cascade
);

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  message_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  content_id text,
  disposition text not null default 'attachment',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_attachments_size_positive check (size_bytes > 0),
  constraint email_attachments_disposition_check check (disposition in ('attachment', 'inline')),
  constraint email_attachments_message_fk foreign key (message_id, dealer_id)
    references public.email_messages(id, dealer_id) on delete cascade,
  constraint email_attachments_storage_unique unique (dealer_id, message_id, storage_path)
);

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  message_id uuid not null,
  event_type text not null,
  event_source text not null,
  event_status text,
  provider text,
  provider_message_id text,
  provider_event_id text,
  idempotency_hash text not null,
  payload_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint email_delivery_events_type_check check (
    event_type in ('queued', 'send_started', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'opened', 'clicked', 'retry_requested', 'cancelled')
  ),
  constraint email_delivery_events_source_check check (
    event_source in ('application', 'provider_api', 'provider_webhook')
  ),
  constraint email_delivery_events_provider_required_for_provider_sources_check check (
    event_source not in ('provider_api', 'provider_webhook')
    or (provider is not null and btrim(provider) <> '')
  ),
  constraint email_delivery_events_payload_object_check check (
    jsonb_typeof(payload_json) = 'object'
  ),
  constraint email_delivery_events_message_fk foreign key (message_id, dealer_id)
    references public.email_messages(id, dealer_id) on delete cascade,
  constraint email_delivery_events_idempotency_unique unique (dealer_id, idempotency_hash)
);

create table if not exists public.platform_email_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text,
  subject_template text not null,
  body_text_template text,
  body_html_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_email_templates_code_not_empty check (btrim(code) <> ''),
  constraint platform_email_templates_name_not_empty check (btrim(name) <> ''),
  constraint platform_email_templates_subject_not_empty check (btrim(subject_template) <> ''),
  constraint platform_email_templates_body_required check (
    coalesce(nullif(btrim(body_text_template), ''), nullif(btrim(body_html_template), '')) is not null
  )
);

create table if not exists public.dealer_email_templates (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null,
  category text,
  subject_template text not null,
  body_text_template text,
  body_html_template text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_email_templates_name_not_empty check (btrim(name) <> ''),
  constraint dealer_email_templates_subject_not_empty check (btrim(subject_template) <> ''),
  constraint dealer_email_templates_body_required check (
    coalesce(nullif(btrim(body_text_template), ''), nullif(btrim(body_html_template), '')) is not null
  )
);

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  message_id uuid not null,
  queue_status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  lock_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_queue_status_check check (queue_status in ('pending', 'locked', 'processing', 'retry_wait', 'completed', 'dead_letter', 'cancelled')),
  constraint email_queue_attempts_check check (attempts >= 0 and max_attempts >= 1 and attempts <= max_attempts),
  constraint email_queue_lock_required_for_locked_processing_check check (
    queue_status not in ('locked', 'processing')
    or (locked_at is not null and lock_token is not null and lock_expires_at is not null)
  ),
  constraint email_queue_message_fk foreign key (message_id, dealer_id)
    references public.email_messages(id, dealer_id) on delete cascade
);

create or replace function public.enforce_email_thread_relations_dealer_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_dealer_id uuid;
begin
  if tg_op = 'UPDATE' and new.dealer_id is distinct from old.dealer_id then
    raise exception 'dealer_id non puo essere modificato.' using errcode = '42501';
  end if;

  if new.lead_id is not null then
    select l.dealer_id
    into v_linked_dealer_id
    from public.leads l
    where l.id = new.lead_id
    limit 1;

    if v_linked_dealer_id is null or v_linked_dealer_id <> new.dealer_id then
      raise exception 'lead_id non appartiene al dealer del thread.' using errcode = '42501';
    end if;
  end if;

  if new.customer_id is not null then
    select c.dealer_id
    into v_linked_dealer_id
    from public.customers c
    where c.id = new.customer_id
    limit 1;

    if v_linked_dealer_id is null or v_linked_dealer_id <> new.dealer_id then
      raise exception 'customer_id non appartiene al dealer del thread.' using errcode = '42501';
    end if;
  end if;

  if new.vehicle_id is not null then
    select v.dealer_id
    into v_linked_dealer_id
    from public.vehicles v
    where v.id = new.vehicle_id
    limit 1;

    if v_linked_dealer_id is null or v_linked_dealer_id <> new.dealer_id then
      raise exception 'vehicle_id non appartiene al dealer del thread.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create unique index if not exists email_messages_dealer_idempotency_unique_idx
  on public.email_messages (dealer_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists email_messages_dealer_provider_message_unique_idx
  on public.email_messages (dealer_id, provider, provider_message_id)
  where provider_message_id is not null;

create unique index if not exists email_delivery_events_provider_event_unique_idx
  on public.email_delivery_events (dealer_id, provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists email_queue_active_message_unique_idx
  on public.email_queue (dealer_id, message_id)
  where queue_status in ('pending', 'locked', 'processing', 'retry_wait');

create unique index if not exists platform_email_templates_code_ci_unique_idx
  on public.platform_email_templates (lower(code));

create unique index if not exists dealer_email_templates_name_ci_unique_idx
  on public.dealer_email_templates (dealer_id, lower(name));

create index if not exists email_messages_dealer_created_desc_idx
  on public.email_messages (dealer_id, created_at desc);

create index if not exists email_messages_dealer_status_created_desc_idx
  on public.email_messages (dealer_id, status, created_at desc);

create index if not exists email_messages_dealer_thread_created_desc_idx
  on public.email_messages (dealer_id, thread_id, created_at desc);

create index if not exists email_messages_dealer_direction_created_desc_idx
  on public.email_messages (dealer_id, direction, created_at desc);

create index if not exists email_threads_dealer_updated_desc_idx
  on public.email_threads (dealer_id, updated_at desc);

create index if not exists email_threads_dealer_last_message_desc_idx
  on public.email_threads (dealer_id, last_message_at desc);

create index if not exists email_threads_dealer_lead_idx
  on public.email_threads (dealer_id, lead_id);

create index if not exists email_threads_dealer_customer_idx
  on public.email_threads (dealer_id, customer_id);

create index if not exists email_threads_dealer_vehicle_idx
  on public.email_threads (dealer_id, vehicle_id);

create index if not exists email_delivery_events_dealer_message_occurred_desc_idx
  on public.email_delivery_events (dealer_id, message_id, occurred_at desc);

create index if not exists email_queue_status_next_attempt_idx
  on public.email_queue (queue_status, next_attempt_at);

create index if not exists email_queue_dealer_status_next_attempt_idx
  on public.email_queue (dealer_id, queue_status, next_attempt_at);

create index if not exists platform_email_templates_active_category_idx
  on public.platform_email_templates (is_active, category);

create index if not exists dealer_email_templates_dealer_active_category_idx
  on public.dealer_email_templates (dealer_id, is_active, category);

alter table public.email_threads enable row level security;
alter table public.email_threads force row level security;
alter table public.email_messages enable row level security;
alter table public.email_messages force row level security;
alter table public.email_attachments enable row level security;
alter table public.email_attachments force row level security;
alter table public.email_delivery_events enable row level security;
alter table public.email_delivery_events force row level security;
alter table public.platform_email_templates enable row level security;
alter table public.platform_email_templates force row level security;
alter table public.dealer_email_templates enable row level security;
alter table public.dealer_email_templates force row level security;
alter table public.email_queue enable row level security;
alter table public.email_queue force row level security;

drop policy if exists email_threads_select_own on public.email_threads;
drop policy if exists email_threads_insert_own on public.email_threads;
drop policy if exists email_threads_update_own on public.email_threads;
drop policy if exists email_threads_delete_own on public.email_threads;

create policy email_threads_select_own
on public.email_threads
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and (lead_id is null or exists (
    select 1 from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  ))
  and (customer_id is null or exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.dealer_id = public.current_dealer_id()
  ))
  and (vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  ))
);

create policy email_threads_insert_own
on public.email_threads
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (lead_id is null or exists (
    select 1 from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  ))
  and (customer_id is null or exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.dealer_id = public.current_dealer_id()
  ))
  and (vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  ))
);

create policy email_threads_update_own
on public.email_threads
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (lead_id is null or exists (
    select 1 from public.leads l
    where l.id = lead_id
      and l.dealer_id = public.current_dealer_id()
  ))
  and (customer_id is null or exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.dealer_id = public.current_dealer_id()
  ))
  and (vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and v.dealer_id = public.current_dealer_id()
  ))
);

create policy email_threads_delete_own
on public.email_threads
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

drop policy if exists email_messages_select_own on public.email_messages;
drop policy if exists email_messages_insert_own on public.email_messages;
drop policy if exists email_messages_update_own on public.email_messages;
drop policy if exists email_messages_delete_own on public.email_messages;

create policy email_messages_select_own
on public.email_messages
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1 from public.email_threads t
    where t.id = thread_id
      and t.dealer_id = public.current_dealer_id()
  )
);

create policy email_messages_insert_own
on public.email_messages
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
  and exists (
    select 1 from public.email_threads t
    where t.id = thread_id
      and t.dealer_id = public.current_dealer_id()
  )
);

create policy email_messages_update_own
on public.email_messages
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
  and exists (
    select 1 from public.email_threads t
    where t.id = thread_id
      and t.dealer_id = public.current_dealer_id()
  )
);

create policy email_messages_delete_own
on public.email_messages
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

drop policy if exists email_attachments_select_own on public.email_attachments;
drop policy if exists email_attachments_insert_own on public.email_attachments;
drop policy if exists email_attachments_update_own on public.email_attachments;
drop policy if exists email_attachments_delete_own on public.email_attachments;

create policy email_attachments_select_own
on public.email_attachments
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1 from public.email_messages m
    where m.id = message_id
      and m.dealer_id = public.current_dealer_id()
  )
);

create policy email_attachments_insert_own
on public.email_attachments
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and exists (
    select 1 from public.email_messages m
    where m.id = message_id
      and m.dealer_id = public.current_dealer_id()
  )
);

create policy email_attachments_update_own
on public.email_attachments
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and exists (
    select 1 from public.email_messages m
    where m.id = message_id
      and m.dealer_id = public.current_dealer_id()
  )
);

create policy email_attachments_delete_own
on public.email_attachments
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

drop policy if exists email_delivery_events_select_own on public.email_delivery_events;

create policy email_delivery_events_select_own
on public.email_delivery_events
for select
to authenticated
using (
  dealer_id = public.current_dealer_id()
  and exists (
    select 1 from public.email_messages m
    where m.id = message_id
      and m.dealer_id = public.current_dealer_id()
  )
);

drop policy if exists platform_email_templates_select_active on public.platform_email_templates;

create policy platform_email_templates_select_active
on public.platform_email_templates
for select
to authenticated
using (is_active = true);

drop policy if exists dealer_email_templates_select_own on public.dealer_email_templates;
drop policy if exists dealer_email_templates_insert_own on public.dealer_email_templates;
drop policy if exists dealer_email_templates_update_own on public.dealer_email_templates;
drop policy if exists dealer_email_templates_delete_own on public.dealer_email_templates;

create policy dealer_email_templates_select_own
on public.dealer_email_templates
for select
to authenticated
using (dealer_id = public.current_dealer_id());

create policy dealer_email_templates_insert_own
on public.dealer_email_templates
for insert
to authenticated
with check (
  coalesce(dealer_id, public.current_dealer_id()) = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

create policy dealer_email_templates_update_own
on public.dealer_email_templates
for update
to authenticated
using (dealer_id = public.current_dealer_id())
with check (
  dealer_id = public.current_dealer_id()
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

create policy dealer_email_templates_delete_own
on public.dealer_email_templates
for delete
to authenticated
using (dealer_id = public.current_dealer_id());

grant select, insert, update, delete on public.email_threads to authenticated;
grant select, insert, update, delete on public.email_messages to authenticated;
grant select, insert, update, delete on public.email_attachments to authenticated;
grant select on public.email_delivery_events to authenticated;
grant select on public.platform_email_templates to authenticated;
grant select, insert, update, delete on public.dealer_email_templates to authenticated;

drop trigger if exists trg_email_threads_set_updated_at on public.email_threads;
create trigger trg_email_threads_set_updated_at
before update on public.email_threads
for each row
execute function public.set_updated_at();

drop trigger if exists trg_enforce_email_thread_relations_dealer_id on public.email_threads;
create trigger trg_enforce_email_thread_relations_dealer_id
before insert or update on public.email_threads
for each row
execute function public.enforce_email_thread_relations_dealer_id();

drop trigger if exists trg_email_messages_set_updated_at on public.email_messages;
create trigger trg_email_messages_set_updated_at
before update on public.email_messages
for each row
execute function public.set_updated_at();

drop trigger if exists trg_platform_email_templates_set_updated_at on public.platform_email_templates;
create trigger trg_platform_email_templates_set_updated_at
before update on public.platform_email_templates
for each row
execute function public.set_updated_at();

drop trigger if exists trg_dealer_email_templates_set_updated_at on public.dealer_email_templates;
create trigger trg_dealer_email_templates_set_updated_at
before update on public.dealer_email_templates
for each row
execute function public.set_updated_at();

drop trigger if exists trg_email_queue_set_updated_at on public.email_queue;
create trigger trg_email_queue_set_updated_at
before update on public.email_queue
for each row
execute function public.set_updated_at();

commit;
