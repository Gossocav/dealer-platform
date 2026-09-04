import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { DealerVehicleSearch } from "@/components/marketplace/dealer-vehicle-search";
import type { DealerVehicleFacets } from "@/lib/dealer-vehicle-filters";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, createMarketplaceSlug, logMarketplaceQueryError, logMarketplaceTruncatedList, normalizeVehicleDealerName, publicSupabase, resolveDealerLocality, resolveVehicleLabel, toAbsoluteUrl, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";
import { JsonLd } from "@/components/marketplace/json-ld";
import { LinkSitoConcessionaria, PulsanteNoleggio } from "@/components/marketplace/collegamenti-concessionaria";
import { buildBreadcrumbJsonLd, buildDealerJsonLd } from "@/lib/structured-data";
import { resolveClickableWebsite } from "@/lib/website-url";

// Cinque minuti: l'elenco delle concessionarie cambia molto piu' di rado del
// catalogo dei veicoli.
export const revalidate = 300;

/**
 * Perche' un elenco vuoto e non l'assenza di questa funzione: senza,
 * "revalidate" su una pagina a indirizzo variabile non ha effetto e ogni
 * visita ricalcola tutto -- e' scritto nella documentazione di Next.
 *
 * Vuoto e non pieno perche' il catalogo cambia di continuo: le pagine non si
 * costruiscono in anticipo, si costruiscono alla prima visita e da li' si
 * conservano per il minuto dichiarato sopra.
 */
export async function generateStaticParams() {
  return [];
}


// Il tetto del piano piu' capiente (Elite, 300 annunci): la ricerca avanzata
// di questa pagina filtra i veicoli gia' scaricati, quindi tagliarne una parte
// prima di filtrarli darebbe risultati incompleti senza dirlo. Se un giorno un
// piano superasse questo numero, l'avviso qui sotto lo scrive nei log.
const DEALER_PAGE_VEHICLES_LIMIT = 300;

async function resolveDealerBySlug(slug: string) {
  const { data, error } = await publicSupabase
    .from("dealers")
    // I recapiti servono ai dati strutturati: sono quelli che permettono a
    // Google di riconoscere la concessionaria come un'azienda con una sede,
    // invece che come una pagina qualsiasi.
    .select("id, name, logo_url, legal_name, city, province, address, phone, email, website, rental_url")
    // Gli stessi stati con cui il marketplace pubblica i veicoli, non il solo
    // "approved" che c'era qui: le due condizioni devono coincidere, altrimenti
    // una concessionaria in stato "active" avrebbe le sue auto in vetrina e la
    // propria pagina che risponde "non trovato" -- con il bottone della scheda
    // veicolo che ci punta dritto. Il resto del marketplace (/ricerca, e
    // l'immagine di anteprima di questa stessa pagina) usava gia' la costante.
    .in("status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

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
    // body_type e vehicle_condition non servono alla scheda: servono alle
    // tendine "Carrozzeria" e "Condizioni" della ricerca qui sotto.
    .select("id, brand, model, version, year, registration_date, registration_month, mileage, price, fuel, transmission, body_type, vehicle_condition, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)")
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

  // Un elenco arrivato esattamente al tetto e' quasi sempre un elenco tagliato:
  // resta scritto nei log, perche' da li' in avanti la ricerca filtrerebbe su
  // una parte dello stock credendo di averlo tutto.
  if (dealerVehicles.length === DEALER_PAGE_VEHICLES_LIMIT) {
    logMarketplaceTruncatedList("dealer-page", dealerVehicles.length);
  }

  const dealer = Array.isArray(dealerVehicles[0].dealers) ? dealerVehicles[0].dealers[0] ?? null : dealerVehicles[0].dealers ?? null;
  const dealerLegalName = String(dealer?.legal_name ?? "").trim();
  const dealerFallbackName = String(dealer?.name ?? "").trim();
  const dealerName = dealerLegalName || dealerFallbackName || "Concessionaria";
  // La sede della concessionaria, non le citta' scritte sui veicoli.
  //
  // Qui era rimasta l'unica lettura di `vehicles.city` sopravvissuta alla
  // decisione di far valere ovunque la sede (resolveDealerLocality). Si
  // vedeva: in produzione una sola auto su 235 aveva quella colonna
  // valorizzata, con dentro "Bard" (AO), e l'intestazione della pagina di
  // AUTOGEPY -- che sta a Reggio nell'Emilia -- annunciava "235 veicoli
  // pubblicati - Bard". Una citta' sbagliata, presa da un dato che nessuno
  // compila piu'.
  const dealerLocality = resolveDealerLocality(matchedDealer as unknown as MarketplaceDealer);
  const totalVehicles = dealerVehicles.length;

  // Il minimo indispensabile perche' il browser possa filtrare: nessuna foto,
  // nessun testo lungo. Le schede restano disegnate dal server.
  const searchFacets: DealerVehicleFacets[] = dealerVehicles.map((vehicle) => ({
    id: vehicle.id,
    label: resolveVehicleLabel(vehicle),
    brand: String(vehicle.brand ?? ""),
    model: String(vehicle.model ?? ""),
    bodyType: String(vehicle.body_type ?? ""),
    condition: String(vehicle.vehicle_condition ?? ""),
    fuel: String(vehicle.fuel ?? ""),
    transmission: String(vehicle.transmission ?? ""),
    year: resolveVehicleYear(vehicle),
    price: toFiniteNumber(vehicle.price),
    mileage: toFiniteNumber(vehicle.mileage),
    createdAt: Date.parse(String(vehicle.created_at ?? "")) || 0,
  }));

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
            {totalVehicles} veicoli pubblicati{dealerLocality ? ` • ${dealerLocality}` : ""}
          </p>
          {/* Il sito sta qui, sotto il nome e la citta': e' un'informazione su
              chi vende, non un pulsante da premere. Prima stava in un riquadro
              a se' intitolato "Dove trovarci", tolto il 04/09/2026. */}
          <LinkSitoConcessionaria website={matchedDealer.website ?? null} />
        </section>

        <section className="flex flex-col gap-5 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-white via-blue-100 to-blue-300 text-xl font-extrabold text-slate-950">
              {dealerName.charAt(0)}
            </div>
            <h2 className="min-w-0 break-words text-lg font-bold text-white [overflow-wrap:anywhere]">{dealerName}</h2>
          </div>
          {/* Il noleggio davanti agli altri, ed e' l'unico pieno: e' la cosa
              che si vende. "Catalogo auto" era pieno anche lui e i due si
              facevano concorrenza, quindi qui e' tornato un pulsante
              normale. */}
          <div className="flex flex-none flex-wrap gap-3">
            <PulsanteNoleggio rentalUrl={matchedDealer.rental_url ?? null} />
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Catalogo auto
            </Link>
            <Link
              href="/concessionarie"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Tutte le concessionarie
            </Link>
          </div>
        </section>

        <DealerVehicleSearch vehicles={searchFacets}>
          {dealerVehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </DealerVehicleSearch>
      </div>
    </main>
  );
}

/**
 * L'anno su cui filtra "Anno da / Anno a". Come nella ricerca del marketplace
 * si guarda prima l'immatricolazione vera; a differenza di li', se manca si
 * ripiega sulla colonna "year" -- i veicoli importati dai siti spesso portano
 * solo quella, e senza il ripiego resterebbero fuori da ogni intervallo di
 * anni pur essendo in vetrina.
 */
function resolveVehicleYear(vehicle: MarketplaceVehicle) {
  const fromRegistration = String(vehicle.registration_date ?? "").slice(0, 4);
  if (/^\d{4}$/.test(fromRegistration)) {
    return Number(fromRegistration);
  }

  const fromYear = String(vehicle.year ?? "").slice(0, 4);
  return /^\d{4}$/.test(fromYear) ? Number(fromYear) : null;
}

function toFiniteNumber(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}
