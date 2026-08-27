import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedCounter } from "@/components/marketplace/animated-counter";
import { CategoryRail, type MarketplaceCategory } from "@/components/marketplace/category-rail";
import { HeroBrandModelFields } from "@/components/marketplace/hero-brand-model-fields";
import { MarqueeDealers, type MarqueeDealer } from "@/components/marketplace/marquee-dealers";
import { JsonLd } from "@/components/marketplace/json-ld";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/structured-data";
import { RevealOnScroll } from "@/components/marketplace/reveal-on-scroll";
import { SpecShowcase, type SpecShowcaseVehicle } from "@/components/marketplace/spec-showcase";
import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  createMarketplaceSlug,
  formatMileage,
  getAppBaseUrl,
  formatPrice,
  formatText,
  logMarketplaceQueryError,
  logMarketplaceTruncatedList,
  normalizeVehicleDealerName,
  resolveDealerLocality,
  publicSupabase,
  resolveDealerSlug,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  toAbsoluteUrl,
  type MarketplaceDealer,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import { caricaTutto } from "@/lib/carica-tutto";
import { raggruppaConcessionariePartner, type PartnerDealer } from "@/lib/marketplace-partner-dealers";
import { DISTANCE_OPTIONS } from "@/lib/search-distance";
import { pickShowcaseVehicleId, romeDayIndex } from "@/lib/showcase-rotation";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";
import { formatRegistrationLabel } from "@/lib/vehicles";

// La home si ricalcola a ogni richiesta, e non e' una scelta di comodo.
//
// Con una copia a scadenza (ISR) questa pagina si e' rivelata inaffidabile,
// misurato in produzione due volte a due giorni di distanza. La copia appena
// costruita e' corretta; quella conservata resta indietro e continua a
// rigenerarsi sbagliata, anche dopo una ripubblicazione senza cache e anche
// dopo aver cambiato l'impronta di questo file. L'ultima volta ha servito per
// ore, a Google e a chi non esegue JavaScript, la scritta "Verifica
// autenticazione..." al posto della pagina.
//
// Una pagina calcolata a ogni richiesta non ha nessuna copia da lasciare
// indietro. Si perde la cache di frontiera -- la home torna a costare quanto
// costava prima -- e per la porta d'ingresso del sito e' un prezzo che vale
// la pena pagare: meglio lenta e giusta che veloce e sbagliata.
//
// Le altre pagine tengono la loro cache: il difetto ha colpito solo questa.
export const dynamic = "force-dynamic";

// Le righe del pubblicato: una per veicolo, con la concessionaria agganciata.
// Servono ai conteggi della home, non a disegnare le schede dei veicoli.
type PublishedRow = {
  dealer_id: string | null;
  body_type: string | null;
  brand: string | null;
  dealers: { status: string | null; name: string | null; legal_name: string | null; city: string | null } | null;
};

const PRICE_BANDS = [
  { label: "Fino a 5.000 €", value: "5000" },
  { label: "Fino a 10.000 €", value: "10000" },
  { label: "Fino a 15.000 €", value: "15000" },
  { label: "Fino a 25.000 €", value: "25000" },
  { label: "Fino a 35.000 €", value: "35000" },
  { label: "Fino a 50.000 €", value: "50000" },
] as const;

export function generateMetadata(): Metadata {
  const description = "KeyAuto: il marketplace auto con concessionarie verificate. Esplora veicoli, confronta offerte e trova la tua prossima auto in tutta Italia.";
  const canonical = toAbsoluteUrl("/");

  return {
    // Intero, non completato dal template: la home dice gia' il nome del
    // sito, e "KeyAuto | Trova la tua prossima auto | KeyAuto" sarebbe goffo.
    title: { absolute: "KeyAuto | Trova la tua prossima auto" },
    description,
    alternates: { canonical },
    openGraph: {
      title: "KeyAuto | Trova la tua prossima auto",
      description,
      url: canonical,
      type: "website",
      images: ["/opengraph-image"],
    },
  };
}

export default async function MarketplaceHomePage() {
  const [{ data, error }, { count: totalVehicleCount }, { righe: publishedRows, troncato: elencoTroncato }] = await Promise.all([
    publicSupabase
      .from("vehicles")
      .select(
        "id, brand, model, version, registration_date, registration_month, year, mileage, price, fuel, transmission, body_type, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)"
      )
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
      .order("created_at", { ascending: false })
      .limit(24),
    // Head-only count for the true "Veicoli pubblicati" total: the query
    // above is capped at 24 rows (the "latest arrivals" window), so
    // vehicles.length alone would understate the real number.
    publicSupabase
      .from("vehicles")
      .select("id, dealers!inner(status)", { count: "exact", head: true })
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES),
    // dealer_id only (not head-only): counting distinct dealers needs the
    // actual values. This deliberately counts dealers that have at least one
    // published vehicle, not just any dealer marked active/approved in the
    // system — a "partner" with zero live inventory isn't a real partner yet.
    //
    // Letto con caricaTutto: il database consegna mille righe per richiesta e
    // non lo dice. Da queste righe escono le concessionarie della rete, i loro
    // conteggi, le citta' coperte, le categorie e le marche piu' presenti: al
    // millesimo veicolo pubblicato sarebbero tornati tutti a sbagliare in
    // silenzio, che e' il modo peggiore di accorgersene. Con i tetti dei piani
    // (50/150/300 annunci) il tetto si tocca con quattro o cinque
    // concessionarie, non con venti.
    caricaTutto<PublishedRow>((da, a) =>
      publicSupabase
        .from("vehicles")
        .select("dealer_id, body_type, brand, dealers!inner(status, name, legal_name, city)")
        .eq("published", true)
        .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
        .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
        // Un ordine stabile serve a caricaTutto: senza, due blocchi possono
        // consegnare due volte la stessa riga e saltarne un'altra.
        .order("created_at", { ascending: false })
        .range(da, a)
        .returns<PublishedRow[]>()
    ),
  ]);

  // Se si e' toccato il tetto di caricaTutto i conteggi qui sotto sono per
  // difetto: non si tace, si scrive nei log del server.
  if (elencoTroncato) {
    logMarketplaceTruncatedList("home", publishedRows.length);
  }

  const totalDealerCount = new Set(publishedRows.map((row) => row.dealer_id)).size;

  // "Citta' coperte" sono quelle dove c'e' una concessionaria, non quelle
  // scritte sui singoli veicoli: la copertura del marketplace la danno le sedi.
  const coveredCities = new Set(
    publishedRows
      .map((row) => {
        const dealer = row.dealers as unknown as { city?: string | null } | Array<{ city?: string | null }> | null;
        const first = Array.isArray(dealer) ? dealer[0] : dealer;
        return String(first?.city ?? "").trim();
      })
      .filter((city) => city.length > 0),
  ).size;

  // Le stesse righe che contano le concessionarie danno anche i nomi da far
  // scorrere: una Map su dealer_id perche' ogni concessionaria compare una
  // volta per veicolo pubblicato. Il nome viene risolto con lo stesso helper
  // usato ovunque nel marketplace, cosi' la scritta che scorre e la pagina
  // della concessionaria non si contraddicono.
  //
  // Lo slug nasce dal nome che si vede scorrere, e non dalla ragione sociale
  // grezza: e' la prima corrispondenza che cerca la pagina della
  // concessionaria, quindi il link porta per forza dove dice di portare.
  const marqueeDealers: MarqueeDealer[] = Array.from(
    new Map(
      publishedRows.map(
        (row) =>
          [row.dealer_id, normalizeVehicleDealerName(row.dealers as unknown as MarketplaceDealer | MarketplaceDealer[])] as const,
      ),
    ).values(),
  )
    // "Concessionaria" e' il ripiego dell'helper quando manca sia la ragione
    // sociale sia l'insegna: farlo scorrere darebbe una fila di nomi generici.
    .filter((name) => name !== "Concessionaria")
    .sort((a, b) => a.localeCompare(b, "it"))
    .map((name) => ({ name, slug: createMarketplaceSlug(name) }));

  if (error) {
    logMarketplaceQueryError("home", error);
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Marketplace</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Marketplace non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare il marketplace."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as unknown as MarketplaceVehicle[];
  const latestVehicles = [...vehicles].sort(byNewest).slice(0, 6);
  const featuredVehicles = [...vehicles].sort(byFeatured);
  // Le concessionarie partner nascono da publishedRows, che copre tutto il
  // pubblicato: erano ricavate dai 24 veicoli delle "ultime arrivate" e la
  // sezione mostrava solo chi aveva caricato per ultimo. In produzione, con
  // 149 veicoli pubblicati, i primi 24 erano tutti di una concessionaria: la
  // seconda spariva dalla rete pur avendo 98 auto in vetrina, e il numero
  // "Concessionarie partner" poco sopra diceva 2. Stessa correzione gia' fatta
  // per le categorie e per le marche piu' presenti.
  const partnerDealers = raggruppaConcessionariePartner(publishedRows).slice(0, 4);
  const brands = uniqueValues(vehicles.map((vehicle) => vehicle.brand));
  const allModels = uniqueValues(vehicles.map((vehicle) => vehicle.model));
  const brandModelMap: Record<string, string[]> = {};
  for (const brand of brands) {
    brandModelMap[brand] = uniqueValues(
      vehicles.filter((vehicle) => formatText(vehicle.brand) === brand).map((vehicle) => vehicle.model)
    );
  }

  const latestVehicleCards = await Promise.all(latestVehicles.map((vehicle) => buildVehicleCard(vehicle)));
  const eliteShowcase = await resolveEliteShowcaseVehicle();
  const showcaseVehicle = await buildShowcaseVehicle(
    eliteShowcase ?? featuredVehicles[0] ?? vehicles[0] ?? null,
    eliteShowcase !== null,
  );

  // "Esplora per categoria" elenca le carrozzerie, tutte quelle selezionabili
  // in fase di inserimento veicolo -- non solo quelle che risultano fra i
  // veicoli piu' recenti caricati qui sopra, che erano gli ultimi 24 e
  // facevano sparire le categorie a rotazione.
  //
  // Il conteggio arriva da publishedRows, che copre tutto il pubblicato: era
  // calcolato sugli stessi 24 e diceva "3 disponibili" dove ce n'erano trenta.
  const publishedBodyTypeCounts = new Map<string, number>();
  for (const row of publishedRows) {
    const bodyType = String((row as { body_type?: string | null }).body_type ?? "").trim();
    if (bodyType) {
      publishedBodyTypeCounts.set(bodyType, (publishedBodyTypeCounts.get(bodyType) ?? 0) + 1);
    }
  }

  const categories: MarketplaceCategory[] = VEHICLE_BODY_TYPES.map((bodyType) => {
    const count = publishedBodyTypeCounts.get(bodyType) ?? 0;

    return {
      label: bodyType,
      description:
        count > 0 ? `Veicoli con carrozzeria ${bodyType}.` : `Nessun veicolo con carrozzeria ${bodyType}, per ora.`,
      href: `/ricerca?bodyType=${encodeURIComponent(bodyType)}`,
      count,
    };
  });

  // "Ricerche popolari" sono le marche, ordinate per quante auto hanno
  // davvero in catalogo: e' l'unico elenco qui dentro in cui "popolare"
  // significa qualcosa di misurato invece che deciso a tavolino.
  //
  // Il conteggio arriva da publishedRows, che copre tutto il pubblicato: i 24
  // veicoli caricati per le "ultime arrivate" avrebbero dato una classifica
  // delle marche appena inserite, non delle piu' presenti.
  const brandCounts = new Map<string, number>();
  for (const row of publishedRows) {
    const brand = String((row as { brand?: string | null }).brand ?? "").trim();
    if (brand) brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
  }

  const quickChips = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .slice(0, 8)
    .map(([brand]) => ({ label: brand, href: `/ricerca?brand=${encodeURIComponent(brand)}` }));

  return (
    <main className="bg-slate-950">
      {/* Chi siamo e come si cerca dentro il sito. Il secondo blocco serve a
          una cosa visibile: il riquadro di ricerca che Google puo' mostrare
          sotto il risultato del dominio, che porta la gente nel catalogo
          invece che in home. */}
      <JsonLd data={buildOrganizationJsonLd({ baseUrl: getAppBaseUrl() })} />
      <JsonLd data={buildWebSiteJsonLd({ baseUrl: getAppBaseUrl() })} />
      {/* ============ HERO — search-first ============ */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 45% at 18% 0%, rgba(76,130,247,0.22), transparent 60%), radial-gradient(55% 40% at 88% 15%, rgba(55,224,232,0.14), transparent 62%), linear-gradient(180deg, #070a14 0%, #0a0e1a 55%, #070a14 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="marketplace-halo pointer-events-none absolute left-1/2 top-[38%] -z-10 aspect-square w-[min(72vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
          style={{ background: "radial-gradient(circle, rgba(76,130,247,0.3), rgba(55,224,232,0.08) 45%, transparent 68%)" }}
        />

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
            <CheckIcon className="text-cyan-300" />
            Solo concessionarie verificate · Km e storico certificati
          </span>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>
            Trova la tua{" "}
            <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-300 bg-clip-text text-transparent">prossima auto</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-slate-400">
            Migliaia di veicoli nuovi, usati, km 0 e a noleggio dalle migliori concessionarie d&apos;Italia. Un&apos;unica ricerca, zero rumore.
          </p>

          <form
            action="/ricerca"
            method="GET"
            className="mt-2 w-full max-w-3xl rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-2.5 shadow-[0_30px_80px_-30px_rgba(76,130,247,0.45)] backdrop-blur"
          >
            {/* Due righe da tre invece di una fila sola: con cinque campi e il
                pulsante affiancati ognuno restava largo un centinaio di pixel,
                e "Citta' o CAP" ha bisogno di spazio per essere scritto. */}
            <div className="grid gap-1 sm:grid-cols-3">
              <HeroBrandModelFields brands={brands} brandModelMap={brandModelMap} allModels={allModels} />
              <HeroField
                label="Prezzo max"
                name="maxPrice"
                placeholder="Nessun limite"
                options={PRICE_BANDS.map((band) => band.label)}
                values={PRICE_BANDS.map((band) => band.value)}
              />
              <HeroField
                label="Distanza"
                name="radius"
                placeholder="Qualsiasi distanza"
                options={DISTANCE_OPTIONS.map((km) => `Entro ${km} km`)}
                values={DISTANCE_OPTIONS.map((km) => String(km))}
              />
              <HeroTextField label="Città o CAP" name="near" placeholder="Es. Reggio Emilia" />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-3xl bg-gradient-to-br from-white via-blue-100 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
              >
                <SearchIcon /> Cerca
              </button>
            </div>
          </form>

          <Link
            href="/ricerca"
            className="mt-1 inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
          >
            Ricerca avanzata <ArrowIcon />
          </Link>
        </div>
      </section>

      <MarqueeDealers dealers={marqueeDealers} />

      {/* ============ STATS ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <RevealOnScroll className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 text-center sm:grid-cols-4">
          <Stat value={totalVehicleCount ?? vehicles.length} label="Veicoli pubblicati" />
          <Stat value={totalDealerCount} label="Concessionarie partner" />
          <Stat value={coveredCities} suffix="+" label="Città coperte" />
          <Stat value={brands.length} suffix="+" label="Marche disponibili" />
        </RevealOnScroll>
      </section>

      {/* ============ CATEGORIES ============ */}
      {categories.length > 0 || quickChips.length > 0 ? (
        <section className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
          {/* Un contenitore solo per titolo, corsia delle carrozzerie e
              scorciatoie. Prima titolo e scorciatoie stavano ognuno in una
              scatola larga meta' pagina e centrata: comparivano in mezzo allo
              schermo mentre le carrozzerie sotto partivano dal bordo, e nessuno
              dei tre condivideva il margine delle altre sezioni della home.
              Questa larghezza e' la stessa di "Gli ultimi arrivi" e
              "Concessionarie partner", cosi' scendendo la pagina i titoli
              stanno tutti sulla stessa linea verticale. La corsia tiene i suoi
              margini negativi, quindi le carrozzerie possono ancora scorrere
              oltre il bordo del contenitore. */}
          <div className="mx-auto max-w-6xl">
            <RevealOnScroll className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Parti da qui</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Esplora per categoria</h2>
            </RevealOnScroll>

            {categories.length > 0 ? <CategoryRail categories={categories} /> : null}

            {quickChips.length > 0 ? (
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Ricerche popolari</span>
                {quickChips.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-white"
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ============ SPEC SHOWCASE (real featured vehicle) ============ */}
      {showcaseVehicle ? <SpecShowcase vehicle={showcaseVehicle} /> : null}

      {/* ============ ULTIMI ARRIVI ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <RevealOnScroll className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">In evidenza</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Gli ultimi arrivi</h2>
            </div>
            <Link href="/auto" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              Vedi tutte le auto <ArrowIcon />
            </Link>
          </RevealOnScroll>

          {latestVehicleCards.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latestVehicleCards.map((card, index) => (
                <RevealOnScroll key={card.id} delayMs={(index % 3) * 80}>
                  <DarkVehicleCard {...card} />
                </RevealOnScroll>
              ))}
            </div>
          ) : (
            <p className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
              Nessun veicolo pubblicato al momento. Torna presto per vedere le nuove offerte.
            </p>
          )}
        </div>
      </section>

      {/* ============ CONCESSIONARIE PARTNER ============ */}
      {partnerDealers.length > 0 ? (
        <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <RevealOnScroll className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">La rete</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Concessionarie partner</h2>
              </div>
              <Link href="/concessionarie" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                Tutte le concessionarie <ArrowIcon />
              </Link>
            </RevealOnScroll>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {partnerDealers.map((group, index) => (
                <RevealOnScroll key={group.dealerId} delayMs={(index % 4) * 70}>
                  <PartnerDealerCard group={group} />
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ============ TRUST ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <RevealOnScroll>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Perché KeyAuto</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textWrap: "balance" }}>
              Comprare usato, senza ansia
            </h2>
            <p className="mt-4 max-w-lg text-slate-400">
              Ogni annuncio arriva da concessionarie verificate. Niente privati improvvisati, solo realtà con partita IVA e reputazione controllata.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80} className="grid gap-3">
            <TrustLine title="Concessionarie verificate" text="Partita IVA, sede e reputazione controllate prima della pubblicazione." />
            <TrustLine title="Km e storico dichiarati" text="Chilometraggio, alimentazione e cambio sempre indicati in scheda." />
            <TrustLine title="Contatto diretto" text="Parli con la concessionaria, senza intermediari nascosti." />
          </RevealOnScroll>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="bg-slate-950 px-4 pb-24 pt-4 sm:px-6 lg:px-8">
        <RevealOnScroll
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[34px] border border-white/10 px-6 py-16 text-center sm:px-10"
          style={{ background: "linear-gradient(160deg, #12224a, #0b1120 70%)" }}
        >
          <h2 className="mx-auto max-w-lg text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textWrap: "balance" }}>
            La tua prossima auto ti sta aspettando
          </h2>
          <p className="mx-auto mt-4 max-w-md text-slate-400">
            Inizia dalla ricerca. Sei una concessionaria? Pubblica il tuo stock e raggiungi migliaia di acquirenti.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/auto"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
            >
              <SearchIcon /> Cerca un&apos;auto
            </Link>
            <Link
              href="/registrazione"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sei una concessionaria?
            </Link>
          </div>
        </RevealOnScroll>
      </section>
    </main>
  );
}

/* ============================================================
   Server-side data shaping
   ============================================================ */

async function buildVehicleCard(vehicle: MarketplaceVehicle) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const imageUrl = cover ? await resolveVehicleImageUrl(cover) : null;

  return {
    id: vehicle.id,
    title: resolveVehicleLabel(vehicle),
    dealerName: normalizeVehicleDealerName(vehicle.dealers),
    dealerSlug: resolveDealerSlug(vehicle.dealers),
    city: formatText(resolveDealerLocality(vehicle.dealers)),
    year: formatText(vehicle.year),
    mileage: formatMileage(vehicle.mileage),
    fuel: formatText(vehicle.fuel),
    transmission: formatText(vehicle.transmission),
    price: formatPrice(vehicle.price),
    imageUrl,
  };
}

/**
 * The showcase slot is an Elite plan benefit, rotating daily among Elite
 * dealers. Returns null whenever that cannot be honoured -- no Elite dealer,
 * no photographed vehicle, or a failed lookup -- so the caller falls back to
 * the ordinary pick and the homepage is never left without a showcase.
 *
 * This runs its own query rather than reusing the page's vehicle list, which
 * is capped at the 24 most recent: an Elite dealer whose stock is older than
 * that would silently never get a turn.
 */
async function resolveEliteShowcaseVehicle(): Promise<MarketplaceVehicle | null> {
  const { data: eliteRows, error: eliteError } = await publicSupabase.rpc("elite_showcase_dealer_ids");

  if (eliteError) {
    logMarketplaceQueryError("home:elite-dealers", eliteError);
    return null;
  }

  const eliteDealerIds = (eliteRows ?? [])
    .map((row: unknown) => (typeof row === "string" ? row : (row as { elite_showcase_dealer_ids?: string })?.elite_showcase_dealer_ids))
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

  if (eliteDealerIds.length === 0) {
    return null;
  }

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, registration_date, registration_month, year, mileage, price, fuel, transmission, body_type, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)"
    )
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .in("dealer_id", eliteDealerIds);

  if (error) {
    logMarketplaceQueryError("home:elite-showcase", error);
    return null;
  }

  const candidates = (data ?? []) as unknown as MarketplaceVehicle[];

  const pickedId = pickShowcaseVehicleId(
    candidates.map((vehicle) => ({
      id: vehicle.id,
      dealerId: vehicle.dealer_id ?? null,
      hasCover: resolveVehicleImages(vehicle.vehicle_images).length > 0,
    })),
    eliteDealerIds,
    romeDayIndex(),
  );

  return candidates.find((vehicle) => vehicle.id === pickedId) ?? null;
}

async function buildShowcaseVehicle(
  vehicle: MarketplaceVehicle | null,
  isElite: boolean,
): Promise<SpecShowcaseVehicle | null> {
  if (!vehicle) return null;

  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const imageUrl = cover ? await resolveVehicleImageUrl(cover) : null;

  return {
    id: vehicle.id,
    title: resolveVehicleLabel(vehicle),
    subtitle: [formatText(resolveDealerLocality(vehicle.dealers)), normalizeVehicleDealerName(vehicle.dealers)].join(" · "),
    priceLabel: formatPrice(vehicle.price),
    imageUrl,
    isElite,
    rows: [
      {
        key: "registration",
        label: "Immatricolazione",
        value: formatRegistrationLabel({ registration_date: vehicle.registration_date, registration_month: vehicle.registration_month, year: vehicle.year }) ?? "-",
        icon: "calendar",
      },
      { key: "fuel", label: "Alimentazione", value: formatText(vehicle.fuel), icon: "fuel" },
      { key: "dealer", label: "Concessionaria", value: normalizeVehicleDealerName(vehicle.dealers), icon: "shield" },
      { key: "mileage", label: "Percorrenza", value: formatMileage(vehicle.mileage), icon: "gauge" },
      { key: "transmission", label: "Cambio", value: formatText(vehicle.transmission), icon: "gearbox" },
      { key: "city", label: "Città", value: formatText(resolveDealerLocality(vehicle.dealers)), icon: "check" },
    ],
  };
}

/* ============================================================
   Presentational pieces
   ============================================================ */

function Stat({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <div>
      <AnimatedCounter
        value={value}
        suffix={suffix}
        className="bg-gradient-to-b from-white to-blue-200 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl"
      />
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </div>
  );
}

function TrustLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
        <CheckIcon />
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

type VehicleCardData = Awaited<ReturnType<typeof buildVehicleCard>>;

function DarkVehicleCard(vehicle: VehicleCardData) {
  return (
    <Link
      href={`/auto/${vehicle.id}`}
      className="group block overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {vehicle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.imageUrl}
            alt={vehicle.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : null}
        {vehicle.fuel !== "-" ? (
          <span className="absolute right-3 top-3 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 px-3 py-1 text-xs font-bold text-slate-950">
            {vehicle.fuel}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          {/* min-w-0 + flex-1 let the title actually shrink/wrap inside the
              flex row instead of overflowing past the card's edge; line-clamp-2
              keeps a long brand + model + version readable across two lines
              with an ellipsis, instead of being hard-clipped by the card's
              overflow-hidden with no indication text was cut off. */}
          <h3 className="min-w-0 flex-1 line-clamp-2 font-semibold text-white">{vehicle.title}</h3>
          <span className="shrink-0 text-xs text-slate-500">{vehicle.year}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag>{vehicle.mileage}</Tag>
          <Tag>{vehicle.transmission}</Tag>
          <Tag>{vehicle.city}</Tag>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-xl font-extrabold tracking-tight text-white">{vehicle.price}</span>
          <span className="text-right text-xs text-slate-500">{vehicle.dealerName}</span>
        </div>
      </div>
    </Link>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">{children}</span>;
}

function PartnerDealerCard({ group }: { group: PartnerDealer }) {
  const dealerName = group.dealer?.legal_name ?? group.dealer?.name ?? "Concessionaria";
  const dealerSlug = resolveDealerSlug(group.dealer ? [group.dealer] : null);

  return (
    <Link
      href={`/concessionarie/${dealerSlug}`}
      className="block rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950 p-5 transition hover:-translate-y-1 hover:border-cyan-300/40"
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-white via-blue-100 to-blue-300 text-lg font-extrabold text-slate-950">
        {dealerName.charAt(0)}
      </div>
      <h3 className="mt-4 font-semibold text-white">{dealerName}</h3>
      <p className="mt-3 border-t border-white/10 pt-3 text-sm text-slate-400">
        <span className="font-semibold text-cyan-300">{group.vehicleCount}</span> veicoli disponibili
      </p>
    </Link>
  );
}

// Gemello di HeroField per un campo scrivibile. Stessi colori inline e stesso
// allineamento centrato da mobile: le due varianti stanno affiancate nella
// stessa griglia e devono sembrare la stessa cosa.
function HeroTextField({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return (
    <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
      <span className="block text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-left">
        {label}
      </span>
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        suppressHydrationWarning
        style={{ color: "#f8fafc" }}
        className="mt-0.5 w-full appearance-none bg-transparent text-center text-sm font-semibold outline-none placeholder:font-normal placeholder:text-slate-500 sm:text-left"
      />
    </label>
  );
}

function HeroField({
  label,
  name,
  placeholder,
  options,
  values,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: string[];
  values?: string[];
}) {
  const finalValues = values ?? options;

  // Colors are set inline (not via Tailwind classes) on purpose: globals.css
  // has an UNLAYERED `select { color: ... }` rule for the app's light forms,
  // and unlayered rules beat Tailwind's layered utilities regardless of
  // specificity — so `text-white` alone loses and the value renders dark on
  // this dark hero. Inline styles win, and colorScheme:dark makes the native
  // dropdown render dark so the light option text stays readable when open.
  return (
    <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
      <span className="block text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-left">{label}</span>
      <select
        name={name}
        defaultValue=""
        style={{ color: "#f8fafc", colorScheme: "dark" }}
        className="mt-0.5 w-full appearance-none bg-transparent text-center text-sm font-semibold outline-none sm:text-left"
      >
        <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
          {placeholder}
        </option>
        {options.map((option, index) => (
          <option key={option} value={finalValues[index] ?? option} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 fill-none stroke-current stroke-[3] ${className ?? ""}`} aria-hidden="true">
      <path d="M20 7 9 18l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================================================
   Data helpers (unchanged logic from the previous home page)
   ============================================================ */


function uniqueValues(values: Array<string | number | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) =>
    a.localeCompare(b, "it-IT")
  );
}

function byNewest(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
}

function byFeatured(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return Number(b.price ?? 0) - Number(a.price ?? 0) || byNewest(a, b);
}
