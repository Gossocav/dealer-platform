import { resolveDealerSlug, type MarketplaceDealer } from "@/lib/public-marketplace";

export type PartnerDealer = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  vehicleCount: number;
};

type RigaPubblicata = {
  dealer_id?: string | null;
  dealers?: unknown;
};

/**
 * Le concessionarie della sezione "Concessionarie partner" in home.
 *
 * Va nutrita con l'elenco intero del pubblicato, una riga per veicolo: la
 * sezione nasceva invece dai 24 veicoli delle "ultime arrivate", e mostrava
 * solo chi aveva caricato per ultimo. Il 23 agosto 2026, in produzione, i
 * primi 24 erano tutti di AUTOGEPY: De Lorenzi spariva dalla rete pur avendo
 * 98 auto in vetrina, e la scheda di AUTOGEPY diceva "24 veicoli disponibili"
 * invece di 51. Il numero "Concessionarie partner" poco sopra, che gia'
 * leggeva l'elenco intero, diceva 2 e contraddiceva la sezione sotto.
 *
 * Ordinate per quanti veicoli hanno davvero: le prime della sezione sono le
 * piu' fornite, non le piu' recenti.
 */
export function raggruppaConcessionariePartner(righe: RigaPubblicata[]): PartnerDealer[] {
  const mappa = new Map<string, PartnerDealer>();

  for (const riga of righe) {
    const grezzo = riga.dealers as MarketplaceDealer | MarketplaceDealer[] | null | undefined;
    const dealer = (Array.isArray(grezzo) ? grezzo[0] ?? null : grezzo ?? null) as MarketplaceDealer | null;
    const dealerId = String(riga.dealer_id ?? dealer?.id ?? resolveDealerSlug(dealer ? [dealer] : null));

    const gia = mappa.get(dealerId);
    if (gia) {
      gia.vehicleCount += 1;
      continue;
    }

    mappa.set(dealerId, { dealerId, dealer, vehicleCount: 1 });
  }

  return [...mappa.values()].sort((a, b) => b.vehicleCount - a.vehicleCount);
}
