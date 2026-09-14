-- Ritorno di 20260915020000_il_regime_iva_arriva_dal_sito.sql.
--
-- Rimette `vat_exposed` com'era -- un si'/no vuoto su tutte le righe, che e'
-- esattamente com'era il 15/09/2026 -- e toglie `vat_regime`.
--
-- **Il regime IVA gia' letto dai siti si perde**, e con lui le conferme del
-- concessionario. Non e' un dato che si puo' ricostruire da `vat_exposed`,
-- perche' quella colonna non ha mai contenuto niente.
--
-- Il permesso pubblico su `vat_exposed` si rimette: era fra le colonne che il
-- marketplace legge.

begin;

alter table public.vehicles add column if not exists vat_exposed boolean;
grant select (vat_exposed) on public.vehicles to anon;

alter table public.vehicles drop constraint if exists vehicles_vat_regime_check;
alter table public.vehicles drop column if exists vat_regime;

commit;
