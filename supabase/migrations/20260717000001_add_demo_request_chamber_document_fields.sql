-- Demo requests: required VAT + chamber document metadata for verified demo onboarding.
-- NOTE: Migration proposal only. Do not apply without explicit approval.

begin;

alter table public.demo_requests
  add column if not exists vat_number text,
  add column if not exists chamber_document_path text,
  add column if not exists chamber_document_name text,
  add column if not exists chamber_document_mime_type text,
  add column if not exists chamber_document_size bigint;

alter table public.demo_requests
  add constraint demo_requests_vat_number_format_chk
    check (vat_number is null or vat_number ~ '^[0-9]{11}$');

alter table public.demo_requests
  add constraint demo_requests_chamber_document_consistency_chk
    check (
      (
        chamber_document_path is null
        and chamber_document_name is null
        and chamber_document_mime_type is null
        and chamber_document_size is null
      )
      or
      (
        chamber_document_path is not null
        and chamber_document_name is not null
        and chamber_document_mime_type is not null
        and chamber_document_size is not null
        and chamber_document_size > 0
      )
    );

create index if not exists demo_requests_vat_number_idx
  on public.demo_requests(vat_number);

create index if not exists demo_requests_document_path_idx
  on public.demo_requests(chamber_document_path)
  where chamber_document_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demo-documents',
  'demo-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
