import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  formatMileage,
  formatPrice,
  getAppBaseUrl,
  publicSupabase,
  resolveDealerDisplayName,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import { renderOgCard } from "@/lib/og-card";

/**
 * L'anteprima social di una scheda veicolo, con la foto dell'auto.
 *
 * Non usa la convenzione `opengraph-image.tsx` di Next perche' su un segmento
 * dinamico quella produce un indirizzo con un codice generato in fase di
 * build, che non si puo' scrivere a mano dentro i metadati della pagina --
 * e la pagina i metadati Open Graph li dichiara gia', per tenersi og:url.
 *
 * Sta sotto /og e non sotto /api perche' robots.txt vieta /api, e il crawler
 * di Facebook quel divieto lo rispetta: l'immagine non verrebbe mai scaricata.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data } = await publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, year, mileage, price, dealer_id, dealers!inner(id, name, legal_name, company_name:legal_name, status), vehicle_images(image_url, position, is_cover)",
    )
    .eq("id", id)
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .maybeSingle();

  // Un veicolo tolto dal catalogo tiene comunque un'anteprima presentabile: il
  // link puo' essere gia' stato condiviso, e un riquadro rotto e' peggio di
  // un'immagine generica.
  if (!data) {
    return renderOgCard({
      eyebrow: "Scheda veicolo",
      title: "Veicolo non disponibile",
      subtitle: "Sfoglia il catalogo per trovare altre offerte dalle concessionarie verificate.",
    });
  }

  const vehicle = data as unknown as MarketplaceVehicle;
  const [coverImage] = resolveVehicleImages(vehicle.vehicle_images);
  const resolved = await resolveVehicleImageUrl(coverImage);

  // Le foto ospitate altrove passano dal nostro proxy, che risponde a un
  // indirizzo relativo: qui serve intero, perche' la richiesta parte dal
  // server e non dal browser.
  const photoUrl = resolved?.startsWith("/") ? `${getAppBaseUrl()}${resolved}` : resolved;

  const dettagli = [
    formatPrice(vehicle.price) !== "-" ? formatPrice(vehicle.price) : null,
    formatMileage(vehicle.mileage) !== "-" ? formatMileage(vehicle.mileage) : null,
    resolveDealerDisplayName(vehicle.dealers),
  ].filter((value): value is string => Boolean(value));

  return renderOgCard({
    eyebrow: "Scheda veicolo",
    title: resolveVehicleLabel(vehicle),
    subtitle: dettagli.join(" · "),
    photoUrl,
  });
}
