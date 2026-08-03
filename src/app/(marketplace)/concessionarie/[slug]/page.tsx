import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, createMarketplaceSlug, formatText, logMarketplaceQueryError, normalizeVehicleDealerName, publicSupabase, toAbsoluteUrl, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";
import { JsonLd } from "@/components/marketplace/json-ld";
import { buildBreadcrumbJsonLd, buildDealerJsonLd } from "@/lib/structured-data";
import { resolveClickableWebsite } from "@/lib/website-url";

export const dynamic = "force-dynamic";

const DEALER_PAGE_VEHICLES_LIMIT = 120;

async function resolveDealerBySlug(slug: string) {
  const { data, error } = await publicSupabase
    .from("dealers")
    // I recapiti servono ai dati strutturati: sono quelli che permettono a
    // Google di riconoscere la concessionaria come un'azienda con una sede,
    // invece che come una pagina qualsiasi.
    .select("id, name, logo_url, legal_name, city, province, address, phone, email, website")
    .eq("status", "approved");

  if (error) {
    return null;
  }

  const dealerCandidates = (data ?? []) as MarketplaceDealer[];
  return (
    dealerCandidates.find((dealer) => {
      const dealerSlug = createMarketplaceSlug(normalizeVehicleDealerName(dealer));
      return dealerSlug === slug || createMarketplaceSlug(dealer.legal_name ?? dealer.name) === slug;
    }) ?? null
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const canonical = toAbsoluteUrl(`/concessionarie/${slug}`);
  const fallbackDescription = "Pagina concessionaria con i veicoli pubblicati nel marketplace KeyAuto.";
  const matchedDealer = await resolveDealerBySlug(slug);

  if (!matchedDealer) {
    // Come per la scheda veicolo: nessun indirizzo canonico su una pagina che
    // non esiste, e richiesta esplicita di tenerla fuori dall'indice.
    return {
      title: "Concessionaria non trovata",
      description: fallbackDescription,
      robots: { index: false, follow: true },
    };
  }

  const dealerName = String(matchedDealer.legal_name ?? matchedDealer.name ?? "Concessionaria").trim() || "Concessionaria";
  const description = `${dealerName}: scopri tutti i veicoli pubblicati dalla concessionaria nel marketplace pubblico.`;

  return {
    title: dealerName,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${dealerName} | KeyAuto`,
      description,
      url: canonical,
      type: "website",
      images: [{ url: `/og/concessionaria/${slug}`, width: 1200, height: 630, alt: dealerName }],
    },
  };
}

export default async function DealerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const matchedDealer = await resolveDealerBySlug(slug);

  if (!matchedDealer?.id) {
    notFound();
  }

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, registration_date, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)")
    .eq("dealer_id", matchedDealer.id)
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .order("created_at", { ascending: false })
    .limit(DEALER_PAGE_VEHICLES_LIMIT);

  // Un guasto del database non e' una concessionaria che non esiste:
  // dichiararla sparita la farebbe togliere dall'indice per un'interruzione
  // momentanea. Stessa distinzione gia' fatta sulla scheda veicolo.
  if (error) {
    logMarketplaceQueryError("dealer-page", error);
    throw new Error(`Impossibile caricare la pagina concessionaria: ${error.message}`);
  }

  const dealerVehicles = (data ?? []) as unknown as MarketplaceVehicle[];

  if (dealerVehicles.length === 0) {
    notFound();
  }

  const dealer = Array.isArray(dealerVehicles[0].dealers) ? dealerVehicles[0].dealers[0] ?? null : dealerVehicles[0].dealers ?? null;
  const dealerLegalName = String(dealer?.legal_name ?? "").trim();
  const dealerFallbackName = String(dealer?.name ?? "").trim();
  const dealerName = dealerLegalName || dealerFallbackName || "Concessionaria";
  const cities = Array.from(new Set(dealerVehicles.map((vehicle) => formatText(vehicle.city)).filter((value) => value !== "-")));
  const totalVehicles = dealerVehicles.length;

  const canonicalUrl = toAbsoluteUrl(`/concessionarie/${slug}`);
  const dealerJsonLd = buildDealerJsonLd({
    url: canonicalUrl,
    name: dealerName,
    city: matchedDealer.city ?? null,
    province: matchedDealer.province ?? null,
    address: matchedDealer.address ?? null,
    postalCode: null,
    phone: matchedDealer.phone ?? null,
    email: matchedDealer.email ?? null,
    // Passa dal controllo in lettura: nel database puo' esserci ancora un
    // indirizzo che non e' un indirizzo, e consegnarlo a Google come
    // "stessa azienda altrove" lo renderebbe un dato sbagliato dichiarato.
    website: resolveClickableWebsite(matchedDealer.website),
    vehiclesCount: totalVehicles,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: toAbsoluteUrl("/") },
    { name: "Concessionarie", url: toAbsoluteUrl("/concessionarie") },
    { name: dealerName, url: canonicalUrl },
  ]);

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={dealerJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Concessionaria pubblica</p>
          <h1 className="relative mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
            {dealerName}
          </h1>
          <p className="relative mt-4 text-base leading-7 text-slate-400 sm:text-lg">
            {totalVehicles} veicoli pubblicati{cities.length > 0 ? ` • ${cities.join(" • ")}` : ""}
          </p>
        </section>

        <section className="flex flex-col gap-5 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-white via-blue-100 to-blue-300 text-xl font-extrabold text-slate-950">
              {dealerName.charAt(0)}
            </div>
            <h2 className="min-w-0 break-words text-lg font-bold text-white [overflow-wrap:anywhere]">{dealerName}</h2>
          </div>
          <div className="flex flex-none flex-wrap gap-3">
            <Link
              href="/concessionarie"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Tutte le concessionarie
            </Link>
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
            >
              Catalogo auto
            </Link>
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Veicoli della concessionaria</p>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dealerVehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
