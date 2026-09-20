import type { Metadata } from "next";
import { caricaTutto } from "@/lib/carica-tutto";
import Link from "next/link";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";
import {
  DISTANCE_OPTIONS,
  boundingBox,
  distanceKm,
  isWithinBox,
  parseDistanceKm,
  resolveComunePoint,
  resolvePlaceQuery,
} from "@/lib/geo-search";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, createMarketplaceSlug, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, formatText, logMarketplaceQueryError, logMarketplaceTruncatedList, publicSupabase, toAbsoluteUrl, type MarketplaceVehicle } from "@/lib/public-marketplace";
import { COLONNA_RICERCA, modelloIlike, paroleRicercaVeicolo } from "@/lib/ricerca-veicoli";
import { TendineMarcaModello } from "@/components/marketplace/tendine-marca-modello";
import { perConfrontoSenzaMaiuscole, valoriDistinti } from "@/lib/valori-distinti";
import { contaFiltriImpostati, etichettaFiltra, filtriDaMostrareSubito } from "@/lib/filtri-richiudibili";

export const dynamic = "force-dynamic";

const MARKETPLACE_SEARCH_PAGE_SIZE = 24;

type SearchParams = Record<string, string | string[] | undefined>;

type SearchState = {
  q: string;
  vehicleCategory: string;
  vehicleCondition: string;
  bodyType: string;
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  yearFrom: string;
  yearTo: string;
  minPrice: string;
  maxPrice: string;
  near: string;
  radius: string;
  /**
   * L'identificativo della concessionaria, quando si arriva dalla sua
   * pagina. **Non e' un filtro come gli altri**: non ha una tendina, si
   * imposta solo arrivando da li', e si toglie con un gesto solo. Vive
   * insieme agli altri perche' deve **restare** mentre se ne aggiungono --
   * chi restringe per alimentazione non vuole vedersi allargare il
   * risultato a tutta Italia.
   */
  dealer: string;
  sort: string;
  page: number;
};

const VEHICLE_CATEGORY_OPTIONS = ["Auto", "Veicolo commerciale"] as const;

const VEHICLE_CONDITION_OPTIONS = ["Nuovo", "Usato", "Aziendale", "Km/0"] as const;

const BODY_TYPE_OPTIONS = VEHICLE_BODY_TYPES;

const SORT_OPTIONS = [
  { value: "created_desc", label: "Data inserimento (piu recenti)" },
  { value: "created_asc", label: "Data inserimento (piu vecchi)" },
  { value: "price_asc", label: "Prezzo crescente" },
  { value: "price_desc", label: "Prezzo decrescente" },
  { value: "year_desc", label: "Immatricolazione piu recente" },
  { value: "year_asc", label: "Immatricolazione piu vecchia" },
  { value: "mileage_asc", label: "Km crescente" },
  { value: "mileage_desc", label: "Km decrescente" },
] as const;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const resolved = await searchParams;
  const filters = parseSearchState(resolved);
  const params = buildSearchParams(filters);
  const queryString = params.toString();
  const description = "Ricerca avanzata veicoli: filtra per distanza da una città o CAP, marca, modello, prezzo, alimentazione, cambio e anno.";

  // Ogni combinazione di filtri era un indirizzo a se', che dichiarava se
  // stesso come versione buona. Con la citta' a testo libero le combinazioni
  // sono infinite: Google avrebbe passato il suo tempo su migliaia di elenchi
  // quasi identici invece che sulle schede dei veicoli, che sono le pagine
  // che devono posizionarsi.
  //
  // La ricerca vuota resta indicizzabile -- e' una pagina vera del sito. Le
  // sue combinazioni no, ma restano da percorrere: "follow" fa sì che Google
  // arrivi comunque agli annunci passando di qui.
  const isFiltered = queryString.length > 0;
  const canonical = toAbsoluteUrl("/ricerca");

  return {
    title: filters.page > 1 ? `Ricerca Veicoli - Pagina ${filters.page}` : "Ricerca Veicoli",
    description,
    alternates: {
      canonical,
    },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "Ricerca Veicoli | KeyAuto",
      description,
      url: canonical,
      type: "website",
      images: ["/opengraph-image"],
    },
  };
}

export default async function AdvancedSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const filters = parseSearchState(resolvedSearchParams);
  // L'ordinamento e la pagina non sono filtri: il primo ha sempre un valore
  // e il secondo non restringe niente. Contarli farebbe aprire il riquadro
  // a chi non ha scelto niente.
  const filtriAttivi = contaFiltriImpostati([
    filters.q, filters.vehicleCategory, filters.vehicleCondition, filters.bodyType,
    filters.brand, filters.model, filters.fuel, filters.transmission,
    filters.yearFrom, filters.yearTo, filters.minPrice, filters.maxPrice,
    filters.near, filters.radius, filters.dealer,
  ]);
  // Il nome della concessionaria da cui si e' arrivati: serve a dire dove si
  // e' finiti. Si chiede solo quando c'e' davvero un filtro, per non
  // aggiungere una richiesta a ogni ricerca.
  const concessionaria = filters.dealer ? await leggiConcessionaria(filters.dealer) : null;

  const from = (filters.page - 1) * MARKETPLACE_SEARCH_PAGE_SIZE;
  const to = from + MARKETPLACE_SEARCH_PAGE_SIZE - 1;

  let query = publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, interior_type, year, registration_date, registration_month, mileage, price, fuel, transmission, traction, color, city, province, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)",
      { count: "exact" }
    )
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

  if (filters.q) {
    for (const parola of paroleRicercaVeicolo(filters.q)) {
      query = query.ilike(COLONNA_RICERCA, modelloIlike(parola));
    }
  }

  // **Arrivando dalla pagina di una concessionaria si resta fra le sue
  // auto.** E' la ragione per cui questa pagina ha guadagnato un filtro che
  // non ha una tendina: la pagina della concessionaria non filtra piu' da
  // se'. Filtrava nel browser, e il giorno che fosse stata divisa in pagine
  // avrebbe detto "12 su 133" avendone guardate 24; farla filtrare dal
  // database la costringeva a ricalcolarsi a ogni visita, e quella pagina
  // deve restare veloce perche' e' quella che Google indicizza. Una ricerca
  // sola per tutto il sito chiude tutte e due le cose.
  if (filters.dealer) query = query.eq("dealer_id", filters.dealer);

  if (filters.vehicleCategory) query = query.eq("vehicle_category", filters.vehicleCategory);
  if (filters.vehicleCondition) query = query.eq("vehicle_condition", filters.vehicleCondition);
  if (filters.bodyType) query = query.eq("body_type", filters.bodyType);
  // Confronto senza maiuscole: nei dati la stessa auto e' scritta in due modi
  // ("C3" x11 e "c3" x2), e con un confronto esatto chi sceglieva una delle
  // due voci perdeva le altre.
  if (filters.brand) query = query.ilike("brand", perConfrontoSenzaMaiuscole(filters.brand));
  if (filters.model) query = query.ilike("model", perConfrontoSenzaMaiuscole(filters.model));
  if (filters.fuel) query = query.eq("fuel", filters.fuel);
  if (filters.transmission) query = query.eq("transmission", filters.transmission);

  // "Anno da / Anno a" filtra sulla data di immatricolazione reale
  // (registration_date), non sulla colonna year: e' il dato che il
  // concessionario compila davvero tramite il calendario nel modulo veicolo.
  // I due estremi sono indipendenti (si puo' impostare solo "da" o solo "a")
  // e vengono scambiati automaticamente se inseriti in ordine inverso.
  const parsedYearFrom = parseSearchYear(filters.yearFrom);
  const parsedYearTo = parseSearchYear(filters.yearTo);
  const yearFrom = parsedYearFrom !== null && parsedYearTo !== null ? Math.min(parsedYearFrom, parsedYearTo) : parsedYearFrom;
  const yearTo = parsedYearFrom !== null && parsedYearTo !== null ? Math.max(parsedYearFrom, parsedYearTo) : parsedYearTo;

  if (yearFrom !== null) query = query.gte("registration_date", `${yearFrom}-01-01`);
  if (yearTo !== null) query = query.lte("registration_date", `${yearTo}-12-31`);

  const minPrice = parseNullableNumber(filters.minPrice);
  const maxPrice = parseNullableNumber(filters.maxPrice);
  if (minPrice !== null) query = query.gte("price", minPrice);
  if (maxPrice !== null) query = query.lte("price", maxPrice);

  // Ricerca per distanza. Il punto di partenza e' quello che il visitatore
  // scrive in "Citta' o CAP"; l'auto sta dove sta la concessionaria, quindi si
  // misura dalla citta' dell'account, non da quella scritta sul singolo
  // veicolo.
  //
  // Il filtro resta dentro la query (per dealer_id) e non dopo: scremare le
  // righe a valle falserebbe sia il conteggio totale sia le pagine.
  //
  // Nessun raggio implicito: se il visitatore lascia "Qualsiasi distanza" il
  // filtro non si applica e i risultati restano quelli di tutta Italia. Un
  // raggio scelto al posto suo restringerebbe la ricerca senza che l'abbia
  // chiesto, ed e' il tipo di aiuto che sembra un malfunzionamento.
  const appliedDistance = parseDistanceKm(filters.radius);
  const nearText = filters.near.trim();
  const nearPlace = appliedDistance && nearText ? resolvePlaceQuery(nearText) : null;
  const nearNotFound = Boolean(appliedDistance) && Boolean(nearText) && nearPlace === null;
  // Una citta' senza distanza non fa nulla: va detto, altrimenti sembra che il
  // campo sia stato ignorato per un difetto.
  const distanceMissing = Boolean(nearText) && !appliedDistance;
  let dealersInRange: number | null = null;

  if (nearPlace && appliedDistance) {
    const { data: dealerRows } = await publicSupabase
      .from("dealers")
      .select("id, city, province")
      .in("status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

    const box = boundingBox(nearPlace, appliedDistance);
    const ids: string[] = [];

    for (const row of dealerRows ?? []) {
      const point = resolveComunePoint(row.province, row.city);
      // Una concessionaria senza citta' riconoscibile non viene collocata a
      // caso: resta fuori dalle ricerche per distanza finche' non sistema
      // il dato.
      if (!point) continue;
      // Prima il riquadro, che scarta in fretta i lontani; poi la distanza
      // esatta, perche' gli angoli del riquadro cadono fuori dal cerchio.
      if (!isWithinBox(point, box)) continue;
      if (distanceKm(nearPlace, point) > appliedDistance) continue;
      ids.push(row.id);
    }

    dealersInRange = ids.length;
    // Con la lista vuota `in` genererebbe una condizione non valida: l'UUID
    // nullo e' un valore legittimo che non corrisponde a nulla, e tiene un
    // solo percorso di codice.
    query = query.in("dealer_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  switch (filters.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "year_asc":
      query = query.order("registration_date", { ascending: true });
      break;
    case "year_desc":
      query = query.order("registration_date", { ascending: false });
      break;
    case "mileage_asc":
      query = query.order("mileage", { ascending: true });
      break;
    case "mileage_desc":
      query = query.order("mileage", { ascending: false });
      break;
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data, error, count } = await query.range(from, to);

  // **Le voci delle tendine si leggono per intero, non le prime mille.**
  //
  // Erano un `.limit(1000)`: oggi le automobili pubblicate sono 279 e le
  // tendine sono complete **per caso**. Superate le mille, una marca
  // sarebbe semplicemente sparita dall'elenco dei filtri -- senza nessun
  // errore, senza nessun avviso -- e chi la cercava avrebbe concluso che su
  // KeyAuto quella marca non c'e'.
  //
  // Qui non serve un conto, serve l'elenco completo: `caricaTutto` lo legge
  // a blocchi e **dice se ha toccato il tetto**, che e' la differenza fra
  // sapere di avere una lista parziale e crederla intera. E' la stessa
  // strada che la home usa gia' per contare carrozzerie e citta'.
  const { righe: optionRows, troncato: opzioniTroncate } = await caricaTutto<{
    brand: string | null;
    model: string | null;
    fuel: string | null;
    transmission: string | null;
    registration_date: string | null;
  }>((da, a) =>
    publicSupabase
      .from("vehicles")
      .select("brand, model, fuel, transmission, registration_date, dealers!inner(status)")
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
      // Un ordine stabile serve a caricaTutto: senza, due blocchi possono
      // consegnare la stessa riga e saltarne un'altra.
      .order("id", { ascending: true })
      .range(da, a),
  );

  if (opzioniTroncate) {
    logMarketplaceTruncatedList("search-options", optionRows.length);
  }

  if (error) {
    logMarketplaceQueryError("search", error);
    return (
      <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 p-8 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Ricerca avanzata</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Ricerca non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{error.message || "Non siamo riusciti a caricare i veicoli."}</p>
        </div>
      </main>
    );
  }

  const results = ((data ?? []) as unknown) as MarketplaceVehicle[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKETPLACE_SEARCH_PAGE_SIZE));

  const optionData = Array.isArray(optionRows) ? optionRows : [];
  const brandOptions = valoriDistinti(optionData.map((row) => (row as { brand?: string | null }).brand));
  // La tendina dei modelli si lega alla marca nel browser, senza ricaricare:
  // serve la mappa completa, non il solo elenco filtrato lato server.
  const modelOptionsTutti = valoriDistinti(optionData.map((row) => (row as { model?: string | null }).model));
  const brandModelMap: Record<string, string[]> = {};
  for (const brand of brandOptions) {
    brandModelMap[brand] = valoriDistinti(
      optionData
        .filter((row) => formatText((row as { brand?: string | null }).brand) === brand)
        .map((row) => (row as { model?: string | null }).model)
    );
  }
  const fuelOptions = valoriDistinti(optionData.map((row) => (row as { fuel?: string | null }).fuel));
  const transmissionOptions = valoriDistinti(optionData.map((row) => (row as { transmission?: string | null }).transmission));
  // Elenco anni derivato dalle date di immatricolazione realmente presenti,
  // cosi' come marca/alimentazione/cambio: nessun anno "vuoto" in elenco.
  const yearOptions = Array.from(
    new Set(
      optionData
        .map((row) => String((row as { registration_date?: string | null }).registration_date ?? "").slice(0, 4))
        .filter((year) => /^\d{4}$/.test(year))
    )
  ).sort((a, b) => Number(b) - Number(a));

  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const prevHref = hasPrev ? `/ricerca?${buildSearchParams({ ...filters, page: filters.page - 1 }).toString()}` : "/ricerca";
  const nextHref = `/ricerca?${buildSearchParams({ ...filters, page: filters.page + 1 }).toString()}`;

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Ricerca avanzata</p>
          <h1 className="relative mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
            Trova il veicolo giusto in pochi secondi.
          </h1>
          <p className="relative mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg">
            Filtra il marketplace per distanza da una città, marca, alimentazione, cambio, anno e fascia prezzo.
          </p>
        </section>

        <form className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-4 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8" method="GET" action="/ricerca">
          <input type="hidden" name="page" value="1" />
          {/* Senza questo, premere "Cerca" perderebbe la concessionaria e
              allargherebbe la ricerca a tutta Italia senza dirlo. */}
          {filters.dealer ? <input type="hidden" name="dealer" value={filters.dealer} /> : null}
          {/*
            **Sul telefono i filtri partono chiusi.** Misurato il 20/09/2026
            a 390px: qui erano sedici campi e la prima automobile cominciava
            a **2.090 pixel**, due schermate e mezzo di filtri. Anche chi
            arriva sulla ricerca vuole prima vedere cosa c'e'.

            I campi restano **dentro il modulo** anche da chiusi: `<details>`
            nasconde con il foglio di stile, non toglie dalla pagina, quindi
            premendo Cerca si spedisce tutto come prima. E funziona senza
            JavaScript, che su questa pagina e' la regola: e' un modulo del
            server, non un componente del browser.

            Sopra i 1024px e' aperto e il pulsante non c'e'.
          */}
          <details className="aperto-da-grande group" open={filtriDaMostrareSubito(filtriAttivi)}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] [&::-webkit-details-marker]:hidden">
              {etichettaFiltra(filtriAttivi)}
              <span className="flex-none text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                <span className="group-open:hidden">Apri</span>
                <span className="hidden group-open:inline">Chiudi</span>
              </span>
            </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 lg:mt-0">
            <SearchField label="Cerca" name="q" defaultValue={filters.q} placeholder="Marca, modello, versione" />
            <SearchSelect label="Tipo veicolo" name="vehicleCategory" defaultValue={filters.vehicleCategory} options={[...VEHICLE_CATEGORY_OPTIONS]} />
            <SearchSelect label="Condizioni" name="vehicleCondition" defaultValue={filters.vehicleCondition} options={[...VEHICLE_CONDITION_OPTIONS]} />
            <SearchSelect label="Carrozzeria" name="bodyType" defaultValue={filters.bodyType} options={[...BODY_TYPE_OPTIONS]} />
            <TendineMarcaModello
              variante="ricerca"
              brands={brandOptions}
              brandModelMap={brandModelMap}
              allModels={modelOptionsTutti}
              marcaIniziale={filters.brand}
              modelloIniziale={filters.model}
            />
            <SearchSelect label="Alimentazione" name="fuel" defaultValue={filters.fuel} options={fuelOptions} />
            <SearchSelect label="Cambio" name="transmission" defaultValue={filters.transmission} options={transmissionOptions} />
            <SearchSelect label="Anno da" name="yearFrom" defaultValue={filters.yearFrom} options={yearOptions} />
            <SearchSelect label="Anno a" name="yearTo" defaultValue={filters.yearTo} options={yearOptions} />
            <SearchField label="Prezzo minimo" name="minPrice" defaultValue={filters.minPrice} placeholder="Es. 10000" inputMode="numeric" />
            <SearchField label="Prezzo massimo" name="maxPrice" defaultValue={filters.maxPrice} placeholder="Es. 30000" inputMode="numeric" />
            <SearchField label="Città o CAP" name="near" defaultValue={filters.near} placeholder="Es. Milano oppure 20121" />
            <SearchSelect
              label="Distanza"
              name="radius"
              defaultValue={filters.radius}
              options={["Qualsiasi distanza", ...DISTANCE_OPTIONS.map((km) => `Entro ${km} km`)]}
              values={["", ...DISTANCE_OPTIONS.map((km) => String(km))]}
            />
            <SearchSelect label="Ordinamento" name="sort" defaultValue={filters.sort} options={SORT_OPTIONS.map((option) => option.label)} values={SORT_OPTIONS.map((option) => option.value)} />
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
              >
                Cerca
              </button>
              <Link href="/ricerca" className="inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                Reset
              </Link>
            </div>
          </div>
          </details>
        </form>

        {/*
          **Chi arriva da una concessionaria deve capire dov'e' finito.**
          Il filtro `dealer` non ha una tendina: se non lo si dicesse, uno
          vedrebbe un elenco piu' corto senza sapere perche', e non avrebbe
          modo di tornare indietro ne' di allargare la ricerca.

          Le due uscite sono diverse apposta: *torna alla sua pagina* riporta
          da dove si e' venuti, *cerca in tutto il marketplace* toglie il
          filtro e **tiene tutti gli altri** -- chi aveva scelto "Diesel"
          continua a cercare Diesel, su tutta Italia.
        */}
        {concessionaria ? (
          <div className="flex flex-col gap-3 rounded-[28px] border border-cyan-400/25 bg-cyan-400/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-words text-sm text-slate-200">
              Stai cercando fra le auto di <strong className="font-bold text-white">{concessionaria.nome}</strong>
            </p>
            <div className="flex flex-none flex-wrap gap-2">
              <Link
                href={`/concessionarie/${concessionaria.slug}`}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
              >
                Torna alla sua pagina
              </Link>
              <Link
                href={`/ricerca?${buildSearchParams({ ...filters, dealer: "", page: 1 }).toString()}`}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Cerca in tutto il marketplace
              </Link>
            </div>
          </div>
        ) : null}

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Risultati</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{formatVehicleResultsText(totalCount)}</h2>
              {nearPlace && appliedDistance ? (
                <p className="mt-1 text-sm text-slate-400">
                  Entro {appliedDistance} km da {nearPlace.name} ({nearPlace.province}).
                </p>
              ) : null}
            </div>
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Vai al catalogo
            </Link>
          </div>

          {/* Un luogo non riconosciuto non viene ignorato in silenzio: senza
              avviso il visitatore crederebbe di stare guardando i risultati
              vicino a casa mentre li sta guardando di tutta Italia. */}
          {nearNotFound ? (
            <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              Non abbiamo riconosciuto «{filters.near.trim()}» come città o CAP: il filtro per distanza non è stato
              applicato. Prova con il nome del comune o con il CAP di cinque cifre.
            </p>
          ) : null}

          {distanceMissing ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
              Hai indicato «{nearText}» ma nessuna distanza: i risultati sono di tutta Italia. Scegli una distanza per
              vedere solo i veicoli in zona.
            </p>
          ) : null}

          {dealersInRange === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
              Nessuna concessionaria entro {appliedDistance} km da {nearPlace?.name}. Prova ad allargare la distanza.
            </p>
          ) : null}

          {results.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-slate-400">
              Nessun veicolo corrisponde ai filtri selezionati.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {results.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  Pagina <span className="font-semibold text-white">{filters.page}</span> di <span className="font-semibold text-white">{totalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  {hasPrev ? (
                    <Link href={prevHref} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                      Precedente
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                      Precedente
                    </span>
                  )}
                  {hasNext ? (
                    <Link
                      href={nextHref}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-105"
                    >
                      Successiva
                    </Link>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-slate-500">
                      Successiva
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SearchField({ label, name, defaultValue, placeholder, inputMode }: { label: string; name: string; defaultValue: string; placeholder: string; inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        suppressHydrationWarning
        style={{ color: "#f8fafc" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function SearchSelect({
  label,
  name,
  defaultValue,
  options,
  values,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
  values?: string[];
}) {
  const finalValues = values ?? options;

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        style={{ color: "#f8fafc", colorScheme: "dark" }}
        className="w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]"
      >
        <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
          Tutti
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

function parseSearchState(searchParams: SearchParams): SearchState {
  const sortCandidate = asValue(searchParams.sort);
  const sort = SORT_OPTIONS.some((option) => option.value === sortCandidate) ? sortCandidate : "created_desc";

  return {
    q: asValue(searchParams.q),
    vehicleCategory: asValue(searchParams.vehicleCategory),
    vehicleCondition: asValue(searchParams.vehicleCondition),
    bodyType: asValue(searchParams.bodyType),
    brand: asValue(searchParams.brand),
    model: asValue(searchParams.model),
    fuel: asValue(searchParams.fuel),
    transmission: asValue(searchParams.transmission),
    yearFrom: asValue(searchParams.yearFrom),
    yearTo: asValue(searchParams.yearTo),
    minPrice: asValue(searchParams.minPrice),
    maxPrice: asValue(searchParams.maxPrice),
    near: asValue(searchParams.near),
    radius: asValue(searchParams.radius),
    dealer: asValue(searchParams.dealer),
    sort,
    page: parsePage(searchParams.page),
  };
}

/**
 * Nome e indirizzo della concessionaria da cui si e' arrivati.
 *
 * Lo slug si ricalcola dal nome con la stessa funzione della sua pagina:
 * non e' una colonna del database -- `dealers.slug` non esiste, verificato
 * il 20/09/2026 -- e due modi diversi di costruirlo porterebbero a un
 * collegamento che non apre niente.
 */
async function leggiConcessionaria(id: string) {
  const { data, error } = await publicSupabase
    .from("dealers")
    .select("id, name, legal_name")
    .eq("id", id)
    .in("status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .maybeSingle<{ id: string; name: string | null; legal_name: string | null }>();

  // Se non si riesce a leggerlo non si inventa un nome: l'avviso non
  // compare, e la ricerca resta comunque ristretta. Meglio un avviso
  // mancante di un nome sbagliato in cima ai risultati.
  if (error || !data) return null;

  const nome = String(data.legal_name ?? "").trim() || String(data.name ?? "").trim();
  if (!nome) return null;

  return { nome, slug: createMarketplaceSlug(nome) };
}

function buildSearchParams(filters: SearchState) {
  const params = new URLSearchParams();

  const entries: Array<[string, string]> = [
    ["q", filters.q],
    ["vehicleCategory", filters.vehicleCategory],
    ["vehicleCondition", filters.vehicleCondition],
    ["bodyType", filters.bodyType],
    ["brand", filters.brand],
    ["model", filters.model],
    ["fuel", filters.fuel],
    ["transmission", filters.transmission],
    ["yearFrom", filters.yearFrom],
    ["yearTo", filters.yearTo],
    ["minPrice", filters.minPrice],
    ["maxPrice", filters.maxPrice],
    ["near", filters.near],
    ["radius", filters.radius],
    // Senza questa riga il filtro della concessionaria sparirebbe al primo
    // cambio di pagina o di ordinamento, e senza dire niente: chi sta
    // guardando le auto di Autogepy si ritroverebbe tutto il marketplace.
    ["dealer", filters.dealer],
  ];

  for (const [key, value] of entries) {
    const normalized = value.trim();
    if (normalized) {
      params.set(key, normalized);
    }
  }

  if (filters.sort && filters.sort !== "created_desc") {
    params.set("sort", filters.sort);
  }

  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  return params;
}

function parsePage(value: string | string[] | undefined) {
  const numeric = Number(asValue(value));
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 1;
  }
  return Math.floor(numeric);
}

function parseNullableNumber(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseSearchYear(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const yearValue = Number(normalized);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(yearValue) || yearValue < 1900 || yearValue > currentYear + 1) {
    return null;
  }

  return yearValue;
}

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : String(value ?? "");
}

function formatVehicleResultsText(count: number) {
  return count === 1 ? "1 veicolo trovato" : `${count} veicoli trovati`;
}
