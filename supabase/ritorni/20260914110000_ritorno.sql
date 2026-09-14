-- Ritorno di 20260914110000_gli_ultimi_indici_e_il_trigger_che_non_serve.sql.
--
-- Toglie i cinque indici e rimette il trigger su `demo_requests`.
--
-- **In produzione quei cinque indici c'erano gia' prima**: eseguire questo
-- ritorno sulla produzione li toglierebbe davvero, ed e' una perdita, non un
-- ripristino. Serve solo a un database ricostruito.

begin;

drop index if exists public.audit_logs_dealer_created_desc_idx;
drop index if exists public.audit_logs_request_id_idx;
drop index if exists public.audit_logs_session_id_idx;
drop index if exists public.appointments_dealer_lead_start_desc_idx;
drop index if exists public.dealers_user_id_unique;

create or replace function public.set_demo_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_demo_requests_updated_at
  before update on public.demo_requests
  for each row
  execute function public.set_demo_requests_updated_at();

commit;
