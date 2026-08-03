/**
 * I dati strutturati: la stessa pagina raccontata a Google in una forma che
 * puo' leggere senza interpretare il testo.
 *
 * Senza, un annuncio compare fra i risultati come due righe di testo; con,
 * puo' mostrare prezzo, chilometri e disponibilita' direttamente in pagina,
 * accanto a concorrenti che quella scheda ce l'hanno gia'.
 */

export type JsonLdValue = string | number | boolean | null | JsonLdObject | JsonLdValue[];
export type JsonLdObject = { [key: string]: JsonLdValue | undefined };

/**
 * I dati finiscono dentro un tag <script>, e li scrive il concessionario: una
 * descrizione che contenga "</script>" chiuderebbe il blocco in anticipo e
 * quello che segue verrebbe eseguito dal browser come codice.
 *
 * Sostituire "<" con la sua forma di fuga risolve alla radice: il JSON resta
 * identico per chi lo legge, ma nessuna sequenza puo' piu' chiudere il tag.
 */
export function serializeJsonLd(data: JsonLdObject) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Toglie le chiavi vuote: un campo dichiarato e lasciato vuoto vale meno di uno assente. */
function compact(data: JsonLdObject): JsonLdObject {
  const result: JsonLdObject = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type OrganizationInput = {
  baseUrl: string;
};

export function buildOrganizationJsonLd({ baseUrl }: OrganizationInput): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KeyAuto",
    url: baseUrl,
    logo: `${baseUrl}/opengraph-image`,
    description: "Marketplace italiano di veicoli nuovi, usati e km 0 pubblicati da concessionarie verificate.",
  };
}

/**
 * Dichiara la ricerca interna del sito. Serve a una cosa sola ma visibile:
 * il riquadro di ricerca che Google puo' mostrare sotto il risultato del
 * dominio, che porta la gente dentro il catalogo invece che in home.
 */
export function buildWebSiteJsonLd({ baseUrl }: OrganizationInput): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "KeyAuto",
    url: baseUrl,
    inLanguage: "it-IT",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/ricerca?near={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

type BreadcrumbStep = { name: string; url: string };

export function buildBreadcrumbJsonLd(steps: BreadcrumbStep[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: step.url,
    })),
  };
}

// Come si chiamano le condizioni nel vocabolario di schema.org. Tutto quello
// che non e' nuovo di fabbrica e' "usato" per Google, anche un km 0.
const CONDITION_URLS: Record<string, string> = {
  Nuovo: "https://schema.org/NewCondition",
  Usato: "https://schema.org/UsedCondition",
  Aziendale: "https://schema.org/UsedCondition",
  "Km/0": "https://schema.org/UsedCondition",
};

type VehicleJsonLdInput = {
  url: string;
  name: string;
  description: string | null;
  images: string[];
  brand: string | null;
  model: string | null;
  version: string | null;
  vin: string | null;
  year: string | number | null;
  registrationDate: string | null;
  mileage: number | null;
  price: string | number | null;
  condition: string | null;
  fuel: string | null;
  transmission: string | null;
  bodyType: string | null;
  color: string | null;
  doors: number | null;
  seats: number | null;
  powerKw: number | null;
  dealerName: string;
  dealerUrl: string | null;
  dealerCity: string | null;
  dealerProvince: string | null;
};

export function buildVehicleJsonLd(input: VehicleJsonLdInput): JsonLdObject {
  const price = toNumber(input.price);
  const mileage = toNumber(input.mileage);

  const seller = compact({
    "@type": "AutoDealer",
    name: input.dealerName,
    url: input.dealerUrl,
    address: input.dealerCity
      ? compact({
          "@type": "PostalAddress",
          addressLocality: input.dealerCity,
          addressRegion: input.dealerProvince,
          addressCountry: "IT",
        })
      : undefined,
  });

  // Senza prezzo non si dichiara un'offerta: un'offerta senza prezzo viene
  // segnalata come errore e fa scartare l'intero blocco.
  const offers =
    price !== null
      ? compact({
          "@type": "Offer",
          price,
          priceCurrency: "EUR",
          availability: "https://schema.org/InStock",
          itemCondition: input.condition ? CONDITION_URLS[input.condition] ?? null : null,
          url: input.url,
          seller,
        })
      : undefined;

  return compact({
    "@context": "https://schema.org",
    "@type": "Car",
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.images,
    vehicleIdentificationNumber: input.vin,
    brand: input.brand ? { "@type": "Brand", name: input.brand } : undefined,
    model: input.model,
    vehicleConfiguration: input.version,
    // La data di immatricolazione quando c'e', altrimenti il solo anno: gli
    // stessi due livelli di precisione che mostra la scheda.
    vehicleModelDate: input.registrationDate ?? (input.year ? String(input.year) : null),
    mileageFromOdometer:
      mileage !== null ? { "@type": "QuantitativeValue", value: mileage, unitCode: "KMT" } : undefined,
    fuelType: input.fuel,
    vehicleTransmission: input.transmission,
    bodyType: input.bodyType,
    color: input.color,
    numberOfDoors: input.doors,
    vehicleSeatingCapacity: input.seats,
    vehicleEngine:
      input.powerKw !== null
        ? {
            "@type": "EngineSpecification",
            enginePower: { "@type": "QuantitativeValue", value: input.powerKw, unitCode: "KWT" },
          }
        : undefined,
    offers,
  });
}

type DealerJsonLdInput = {
  url: string;
  name: string;
  city: string | null;
  province: string | null;
  address: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  vehiclesCount: number;
};

export function buildDealerJsonLd(input: DealerJsonLdInput): JsonLdObject {
  const hasAddress = Boolean(input.city || input.address || input.postalCode);

  return compact({
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: input.name,
    url: input.url,
    // Il sito del concessionario dichiarato come "stessa entita' altrove":
    // e' cosi' che si dice a Google che le due pagine parlano di un'unica
    // azienda invece che di due omonime.
    sameAs: input.website ? [input.website] : undefined,
    telephone: input.phone,
    email: input.email,
    address: hasAddress
      ? compact({
          "@type": "PostalAddress",
          streetAddress: input.address,
          addressLocality: input.city,
          addressRegion: input.province,
          postalCode: input.postalCode,
          addressCountry: "IT",
        })
      : undefined,
    makesOffer: input.vehiclesCount > 0 ? { "@type": "Offer", itemOffered: { "@type": "Car" } } : undefined,
  });
}
