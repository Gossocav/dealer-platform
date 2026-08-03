import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbJsonLd,
  buildDealerJsonLd,
  buildOrganizationJsonLd,
  buildVehicleJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from "@/lib/structured-data";

const BASE = "https://www.keyauto.it";

function veicolo(overrides: Partial<Parameters<typeof buildVehicleJsonLd>[0]> = {}) {
  return buildVehicleJsonLd({
    url: `${BASE}/auto/abc`,
    name: "Audi A4 Avant",
    description: "Ottime condizioni",
    images: [`${BASE}/og/veicolo/abc`],
    brand: "Audi",
    model: "A4",
    version: "Avant",
    vin: "WAUZZZ8K",
    year: 2019,
    registrationDate: "2019-03-15",
    mileage: 85000,
    price: 21500,
    condition: "Usato",
    fuel: "Diesel",
    transmission: "Automatico",
    bodyType: "Station Wagon",
    color: "Nero",
    doors: 5,
    seats: 5,
    powerKw: 140,
    dealerName: "Rossi Auto",
    dealerUrl: `${BASE}/concessionarie/rossi-auto`,
    dealerCity: "Reggio Emilia",
    dealerProvince: "RE",
    ...overrides,
  });
}

// I dati finiscono dentro un tag <script> e li scrive il concessionario: una
// descrizione con dentro "</script>" chiuderebbe il blocco in anticipo e il
// resto verrebbe eseguito dal browser di chi legge.
describe("quello che scrive il concessionario non puo' diventare codice", () => {
  it("neutralizza la sequenza che chiuderebbe il tag", () => {
    const serializzato = serializeJsonLd(
      veicolo({ description: '</script><script>alert("preso")</script>' }),
    );

    expect(serializzato).not.toContain("</script>");
    expect(serializzato).not.toContain("<script>");
    expect(serializzato).toContain("\\u003c");
  });

  it("resta comunque JSON valido e con lo stesso contenuto", () => {
    const testo = '</script> di sicuro <b>grassetto</b>';
    const riletto = JSON.parse(serializeJsonLd(veicolo({ description: testo })));

    expect(riletto.description).toBe(testo);
  });
});

describe("la scheda veicolo si racconta a Google", () => {
  it("dichiara prezzo, valuta e venditore", () => {
    const dati = veicolo() as Record<string, Record<string, unknown>>;

    expect(dati.offers.price).toBe(21500);
    expect(dati.offers.priceCurrency).toBe("EUR");
    expect((dati.offers.seller as Record<string, unknown>)["@type"]).toBe("AutoDealer");
    expect((dati.offers.seller as Record<string, unknown>).name).toBe("Rossi Auto");
  });

  // Un'offerta senza prezzo viene segnalata come errore e fa scartare tutto
  // il blocco, non solo quel campo.
  it("senza prezzo non dichiara nessuna offerta", () => {
    expect(veicolo({ price: null }).offers).toBeUndefined();
    expect(veicolo({ price: "" }).offers).toBeUndefined();
  });

  it("traduce le condizioni nel vocabolario di schema.org", () => {
    const condizione = (valore: string | null) =>
      ((veicolo({ condition: valore }).offers as Record<string, unknown>) ?? {}).itemCondition;

    expect(condizione("Nuovo")).toBe("https://schema.org/NewCondition");
    expect(condizione("Usato")).toBe("https://schema.org/UsedCondition");
    // Per Google tutto quello che non e' nuovo di fabbrica e' usato.
    expect(condizione("Km/0")).toBe("https://schema.org/UsedCondition");
    expect(condizione("Aziendale")).toBe("https://schema.org/UsedCondition");
    expect(condizione(null)).toBeUndefined();
  });

  it("i chilometri hanno un'unita' di misura dichiarata", () => {
    const km = veicolo().mileageFromOdometer as Record<string, unknown>;
    expect(km.value).toBe(85000);
    expect(km.unitCode).toBe("KMT");
  });

  it("preferisce la data di immatricolazione all'anno, come fa la scheda", () => {
    expect(veicolo().vehicleModelDate).toBe("2019-03-15");
    expect(veicolo({ registrationDate: null }).vehicleModelDate).toBe("2019");
    expect(veicolo({ registrationDate: null, year: null }).vehicleModelDate).toBeUndefined();
  });

  // Un campo dichiarato e lasciato vuoto vale meno di uno assente: Google lo
  // segnala come incompleto.
  it("non dichiara i campi che non abbiamo", () => {
    const scarno = veicolo({ vin: null, color: null, doors: null, seats: null, powerKw: null });

    expect(scarno).not.toHaveProperty("vehicleIdentificationNumber");
    expect(scarno).not.toHaveProperty("color");
    expect(scarno).not.toHaveProperty("numberOfDoors");
    expect(scarno).not.toHaveProperty("vehicleEngine");
  });
});

describe("la concessionaria si racconta come un'azienda con una sede", () => {
  const base = {
    url: `${BASE}/concessionarie/rossi-auto`,
    name: "Rossi Auto",
    city: "Reggio Emilia",
    province: "RE",
    address: "Via Emilia 12",
    postalCode: null,
    phone: "+390522123456",
    email: "info@rossiauto.it",
    website: "https://www.rossiauto.it/",
    vehiclesCount: 12,
  };

  it("dichiara indirizzo e recapiti", () => {
    const dati = buildDealerJsonLd(base) as Record<string, Record<string, unknown>>;

    expect(dati["@type"]).toBe("AutoDealer");
    expect(dati.address.addressLocality).toBe("Reggio Emilia");
    expect(dati.address.addressCountry).toBe("IT");
    expect(dati.telephone).toBe("+390522123456");
  });

  it("collega il sito del concessionario come stessa azienda", () => {
    expect(buildDealerJsonLd(base).sameAs).toEqual(["https://www.rossiauto.it/"]);
    expect(buildDealerJsonLd({ ...base, website: null })).not.toHaveProperty("sameAs");
  });

  it("senza nessun dato di sede non inventa un indirizzo", () => {
    const senzaSede = buildDealerJsonLd({ ...base, city: null, address: null, postalCode: null });
    expect(senzaSede).not.toHaveProperty("address");
  });
});

describe("le briciole di navigazione e l'identita' del sito", () => {
  it("numera i passaggi nell'ordine in cui si percorrono", () => {
    const dati = buildBreadcrumbJsonLd([
      { name: "Home", url: BASE },
      { name: "Catalogo", url: `${BASE}/auto` },
      { name: "Audi A4", url: `${BASE}/auto/abc` },
    ]) as Record<string, Array<Record<string, unknown>>>;

    expect(dati.itemListElement).toHaveLength(3);
    expect(dati.itemListElement[0].position).toBe(1);
    expect(dati.itemListElement[2].name).toBe("Audi A4");
  });

  it("dichiara come si cerca dentro il sito", () => {
    const dati = buildWebSiteJsonLd({ baseUrl: BASE }) as Record<string, Record<string, Record<string, string>>>;

    expect(dati.potentialAction["@type"]).toBe("SearchAction");
    expect(dati.potentialAction.target.urlTemplate).toContain("{search_term_string}");
    // Deve puntare a una ricerca che esiste davvero: /ricerca legge "near".
    expect(dati.potentialAction.target.urlTemplate).toContain("/ricerca?near=");
  });

  it("l'organizzazione punta al dominio giusto", () => {
    const dati = buildOrganizationJsonLd({ baseUrl: BASE });
    expect(dati.url).toBe(BASE);
    expect(dati.name).toBe("KeyAuto");
  });
});
