import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  createMarketplaceSlug,
  normalizeVehicleDealerName,
  publicSupabase,
  resolveDealerLocality,
  type MarketplaceDealer,
} from "@/lib/public-marketplace";
import { renderOgCard } from "@/lib/og-card";

// Vedi la nota in /og/veicolo/[id]: stesso motivo per cui non usiamo la
// convenzione a file di Next e stiamo fuori da /api.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data } = await publicSupabase
    .from("dealers")
    .select("id, name, legal_name, city, province")
    .in("status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

  // Stessa risoluzione della pagina: l'indirizzo nasce dal nome, non esiste
  // una colonna da interrogare.
  const dealer = ((data ?? []) as MarketplaceDealer[]).find(
    (record) => createMarketplaceSlug(normalizeVehicleDealerName(record)) === slug,
  );

  if (!dealer) {
    return renderOgCard({
      eyebrow: "Concessionaria",
      title: "Concessionaria non trovata",
      subtitle: "Scopri le concessionarie verificate presenti su KeyAuto.",
    });
  }

  const locality = resolveDealerLocality(dealer);

  return renderOgCard({
    eyebrow: "Concessionaria",
    title: normalizeVehicleDealerName(dealer),
    subtitle: locality ? `${locality} · Veicoli disponibili su KeyAuto` : "Veicoli disponibili su KeyAuto",
  });
}
