import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { SegnalaVisita } from "@/components/marketplace/segnala-visita";
import { DealerVehicleSearch } from "@/components/marketplace/dealer-vehicle-search";
import { opzioniFiltri, type DealerVehicleFacets } from "@/lib/dealer-vehicle-filters";
import { caricaTutto } from "@/lib/carica-tutto";
import { contaVetrinaConcessionaria, MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, createMarketplaceSlug, logMarketplaceQueryError, logMarketplaceTruncatedList, normalizeVehicleDealerName, publicSupabase, resolveDealerLocality, toAbsoluteUrl, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";
import { JsonLd } from "@/components/marketplace/json-ld";
import { buildBreadcrumbJsonLd, buildDealerJsonLd } from "@/lib/structured-data";
import {
  applicaFiltriConcessionaria,
  filtriConcessionariaDaIndirizzo,
  ordinaConcessionaria,
  valoriDeiFiltri,
  type CostruttoreDiRichiesta,
} from "@/lib/filtri-concessionaria-db";
import { contaFiltriImpostati } from "@/lib/filtri-richiudibili";

/**
 * **Questa pagina si costruisce a ogni visita, e prima non era cosi'.**
 *
 * Aveva `revalidate = 300`: si costruiva alla prima visita e si conservava
 * cinque minuti. Da quando i filtri li applica il database, la pagina legge
 * l'indirizzo -- e una pagina conservata per percorso non puo' servire
 * `?brand=Jeep`, perche' il percorso e' lo stesso. Tenendo le due cose
 * insieme Next rispondeva **500** (`DYNAMIC_SERVER_USAGE`) su ogni visita,
 * anche senza filtri: verificato in locale sulla produzione, non dedotto.
 *
 * `force-dynamic` e' la stessa dichiarazione che hanno gia' `/ricerca` e
 * `/auto`, cioe' le altre due pagine del marketplace che leggono
 * l'indirizzo: una terza convenzione qui sarebbe peggio.
 *
 * **Cosa costa, detto chiaro:** senza la conservazione, ogni visita rilegge
 * il database. Oggi sono tre richieste e fino a 300 righe -- e' il motivo
 * per cui la divisione in pagine da ventiquattro viene subito dopo: con
 * quella, ogni visita ne leggera' ventiquattro e questo costo sparisce
 * quasi tutto.
 */
export const dynamic = "force-dynamic";


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
    .select("id, name, logo_url, legal_name, city, province, address, phone, email")
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

export default async function DealerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const filtri = filtriConcessionariaDaIndirizzo(await searchParams);
  const filtriAttivi = contaFiltriImpostati(valoriDeiFiltri(filtri));

  const matchedDealer = await resolveDealerBySlug(slug);

  if (!matchedDealer?.id) {
    notFound();
  }

  // **I filtri li applica il database, non il browser.** Prima la pagina
  // caricava tutto e sceglieva nel browser: con 133 auto funzionava, ma il
  // giorno che questa pagina sara' divisa in pagine da ventiquattro il
  // browser ne avrebbe in mano ventiquattro e direbbe "12 su 133" avendone
  // guardate ventiquattro -- lo stesso difetto del prezzo minimo calcolato
  // sulle prime trecento, su questa stessa pagina.
  const base = publicSupabase
    .from("vehicles")
    // body_type e vehicle_condition non servono alla scheda: servono alle
    // tendine "Carrozzeria" e "Condizioni" della ricerca qui sotto.
    .select("id, brand, model, version, year, registration_date, registration_month, mileage, price, fuel, transmission, body_type, vehicle_condition, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)")
    .eq("dealer_id", matchedDealer.id)
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

  // I due passaggi di tipo: il costruttore di Supabase ha cinque parametri
  // generici che cambiano a ogni versione, e agganciarli qui farebbe
  // esplodere il controllo dei tipi ("type instantiation is excessively
  // deep"). Le due funzioni dichiarano esattamente i metodi che usano, e
  // quello che torna e' lo stesso oggetto di prima.
  const conFiltri = ordinaConcessionaria(
    applicaFiltriConcessionaria(base as unknown as CostruttoreDiRichiesta, filtri),
    filtri.sort,
  ) as unknown as typeof base;

  const { data, error } = await conFiltri.limit(DEALER_PAGE_VEHICLES_LIMIT);

  // Un guasto del database non e' una concessionaria che non esiste:
  // dichiararla sparita la farebbe togliere dall'indice per un'interruzione
  // momentanea. Stessa distinzione gia' fatta sulla scheda veicolo.
  if (error) {
    logMarketplaceQueryError("dealer-page", error);
    throw new Error(`Impossibile caricare la pagina concessionaria: ${error.message}`);
  }

  const dealerVehicles = (data ?? []) as unknown as MarketplaceVehicle[];

  // **Un filtro che non trova niente non e' una concessionaria che non
  // esiste.** Prima questa riga diceva "pagina non trovata" ogni volta che
  // l'elenco tornava vuoto, e finche' l'elenco era tutto lo stock voleva
  // dire davvero "questa concessionaria non ha auto in vetrina". Adesso che
  // filtra il database, cercare "Ferrari" su un concessionario che non ne ha
  // avrebbe restituito un 404 -- e Google avrebbe potuto togliere dall'indice
  // una pagina viva. Con un filtro attivo la pagina resta, e dice che con
  // quei filtri non c'e' niente.
  if (dealerVehicles.length === 0 && filtriAttivi === 0) {
    notFound();
  }

  // Un elenco arrivato esattamente al tetto e' quasi sempre un elenco tagliato:
  // resta scritto nei log, perche' da li' in avanti la ricerca filtrerebbe su
  // una parte dello stock credendo di averlo tutto.
  if (dealerVehicles.length === DEALER_PAGE_VEHICLES_LIMIT) {
    logMarketplaceTruncatedList("dealer-page", dealerVehicles.length);
  }

  // **Chi e' la concessionaria lo dice `matchedDealer`, non la prima auto
  // dell'elenco.** Prima si leggeva da `dealerVehicles[0]`, e funzionava solo
  // perche' l'elenco non era mai vuoto: con i filtri attivi puo' esserlo, e
  // la pagina sarebbe rimasta senza nome, senza citta' e senza recapiti
  // proprio mentre spiega che con quei filtri non c'e' niente.
  const dealer = matchedDealer;
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

  // **Quante automobili ha davvero, non quante ne sono arrivate qui.**
  //
  // Era `dealerVehicles.length`, cioe' la lunghezza di un elenco con un
  // tetto di trecento. Oggi la piu' grande ne ha centotrentacinque e il
  // numero e' giusto per caso: il giorno che una concessionaria supera il
  // tetto, questa pagina annuncerebbe "300 veicoli pubblicati" a chi ne ha
  // quattrocento, **senza nessun errore da nessuna parte**. E' lo stesso
  // difetto che l'elenco delle concessionarie aveva gia' pagato davvero.
  //
  // Adesso il conto arriva dal database. Se la vista non c'e' ancora, il
  // numero non si mostra: meglio nessuno che uno sbagliato.
  const veicoliInVetrina = await contaVetrinaConcessionaria(matchedDealer.id);
  const totalVehicles = veicoliInVetrina;

  // Il minimo indispensabile perche' il browser possa filtrare: nessuna foto,
  // nessun testo lungo. Le schede restano disegnate dal server.
  // **Le voci delle tendine nascono da tutto lo stock, non dall'elenco
  // filtrato.** Se venissero dalle auto mostrate, dopo aver scelto "Jeep" la
  // tendina delle marche conterrebbe solo Jeep e non si potrebbe piu'
  // cambiare idea. E' la stessa trappola del conteggio su un elenco
  // tagliato, spostata sulle scelte invece che sui numeri: si legge tutto lo
  // stock con `caricaTutto`, che avvisa quando tocca il tetto.
  const { righe: righeDelloStock, troncato: stockTroncato } = await caricaTutto<{
    brand: string | null;
    model: string | null;
    body_type: string | null;
    vehicle_condition: string | null;
    fuel: string | null;
    transmission: string | null;
    registration_date: string | null;
    registration_month: string | null;
    year: number | null;
  }>(
    (da: number, a: number) =>
      publicSupabase
        .from("vehicles")
        .select("brand, model, body_type, vehicle_condition, fuel, transmission, registration_date, registration_month, year")
        .eq("dealer_id", matchedDealer.id)
        .eq("published", true)
        .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
        .order("id", { ascending: true })
        .range(da, a),
  );

  if (stockTroncato) {
    logMarketplaceTruncatedList("dealer-page-opzioni", righeDelloStock.length);
  }

  const opzioni = opzioniFiltri(
    righeDelloStock.map((riga): DealerVehicleFacets => ({
      id: "",
      label: "",
      brand: String(riga.brand ?? ""),
      model: String(riga.model ?? ""),
      bodyType: String(riga.body_type ?? ""),
      condition: String(riga.vehicle_condition ?? ""),
      fuel: String(riga.fuel ?? ""),
      transmission: String(riga.transmission ?? ""),
      year: resolveVehicleYear(riga as never),
      price: null,
      mileage: null,
      createdAt: 0,
    })),
    filtri,
  );

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
    // Nessun sito nei dati strutturati: dire a Google "questa azienda sta
    // anche altrove" e' un rimando al sito della concessionaria come gli
    // altri, e i rimandi verso l'esterno sono stati tolti tutti.
    website: null,
    // Anche i dati strutturati per Google prendono il numero vero: un conto
    // sbagliato dichiarato a un motore di ricerca resta li' per mesi.
    vehiclesCount: totalVehicles,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: toAbsoluteUrl("/") },
    { name: "Concessionarie", url: toAbsoluteUrl("/concessionarie") },
    { name: dealerName, url: canonicalUrl },
  ]);

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <SegnalaVisita tipo="concessionaria" id={matchedDealer.id} />
      <JsonLd data={dealerJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          {/* Nessun collegamento verso l'esterno: chi arriva qui deve restare
              qui. I due pulsanti che portavano al sito della concessionaria e
              alla sua pagina noleggi sono stati tolti il 04/09/2026 -- il
              perche' sta scritto in fondo a questo file. */}
          <div className="relative">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Concessionaria pubblica</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
                {dealerName}
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg">
                {totalVehicles === null
                  ? dealerLocality
                  : `${totalVehicles} ${totalVehicles === 1 ? "veicolo pubblicato" : "veicoli pubblicati"}${dealerLocality ? ` • ${dealerLocality}` : ""}`}
              </p>
            </div>

          </div>
        </section>

        <DealerVehicleSearch
          filtri={filtri}
          filtriAttivi={filtriAttivi}
          opzioni={opzioni}
          mostrati={dealerVehicles.length}
          totaleInVetrina={veicoliInVetrina}
          azione={`/concessionarie/${slug}`}
        >
          {dealerVehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </DealerVehicleSearch>

        {/* Le due strade che portano via da questa concessionaria stanno in
            fondo, dove si arriva dopo aver guardato le sue automobili. In cima
            occupavano il posto migliore della pagina per mandare altrove chi
            era appena arrivato. */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-sm">
          <Link href="/auto" className="font-semibold text-slate-400 transition hover:text-white">
            Catalogo auto
          </Link>
          <Link href="/concessionarie" className="font-semibold text-slate-400 transition hover:text-white">
            Tutte le concessionarie
          </Link>
        </nav>
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


