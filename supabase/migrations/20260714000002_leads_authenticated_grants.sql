begin;

grant select, insert, update, delete on public.leads to authenticated;

commit;
