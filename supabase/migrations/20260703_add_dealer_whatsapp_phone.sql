begin;

alter table public.dealers
add column if not exists whatsapp_phone text;

commit;
