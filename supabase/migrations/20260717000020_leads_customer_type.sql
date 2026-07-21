begin;

-- Lets the public request-information form capture whether the inquiry is
-- from a private individual or a company, so the dealer can see it on the
-- lead. Additive column, same style as 20260628_add_source_to_leads.sql.
alter table public.leads add column if not exists customer_type text check (customer_type in ('privato', 'azienda'));

commit;
