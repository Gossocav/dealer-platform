import { describe, expect, it } from "vitest";
import {
  DEALER_FILTERS_EMPTY,
  contaFiltriAttivi,
  filtraEOrdina,
  fraseConteggioVeicoli,
  opzioniFiltri,
  ordinaVeicoli,
  veicoloCorrisponde,
  type DealerFilterState,
  type DealerVehicleFacets,
} from "@/lib/dealer-vehicle-filters";

function veicolo(parziale: Partial<DealerVehicleFacets> & { id: string }): DealerVehicleFacets {
  return {
    label: "",
    brand: "",
    model: "",
    bodyType: "",
    condition: "",
    fuel: "",
    transmission: "",
    year: null,
    price: null,
    mileage: null,
    createdAt: 0,
    ...parziale,
  };
}

function filtri(parziale: Partial<DealerFilterState>): DealerFilterState {
  return { ...DEALER_FILTERS_EMPTY, ...parziale };
}

const STOCK: DealerVehicleFacets[] = [
  veicolo({
    id: "tucson",
    label: "Hyundai Tucson 1.6 CRDi Xline",
    brand: "Hyundai",
    model: "Tucson",
    bodyType: "SUV",
    condition: "Usato",
    fuel: "Diesel",
    transmission: "Manuale",
    year: 2019,
    price: 21500,
    mileage: 78000,
    createdAt: 300,
  }),
  veicolo({
    id: "panda",
    label: "Fiat Panda 1.2 Easy",
    brand: "Fiat",
    model: "Panda",
    bodyType: "City Car",
    condition: "Usato",
    fuel: "Benzina",
    transmission: "Manuale",
    year: 2016,
    price: 7900,
    mileage: 112000,
    createdAt: 200,
  }),
  veicolo({
    id: "500e",
    label: "Fiat 500e Icon",
    brand: "Fiat",
    model: "500e",
    bodyType: "City Car",
    condition: "Km/0",
    fuel: "Elettrica",
    transmission: "Automatico",
    year: 2024,
    price: null,
    mileage: null,
    createdAt: 100,
  }),
];

// Postgres tratta un valore assente come il piu' grande, ed e' per questo che
// tutte le interrogazioni del progetto ordinano con "nullsFirst: false". Qui
// l'ordinamento avviene nel browser: senza la stessa regola, un'auto con il
// prezzo "da definire" aprirebbe l'elenco dei piu' cari e comparirebbe fra i
// risultati di "fino a 10.000 euro".
describe("un dato che manca non entra mai in un intervallo", () => {
  it("il veicolo senza prezzo resta fuori dalla fascia di prezzo", () => {
    const risultati = filtraEOrdina(STOCK, filtri({ maxPrice: "10000" }));
    expect(risultati.map((v) => v.id)).toEqual(["panda"]);
  });

  it("il veicolo senza chilometri resta fuori dal tetto dei chilometri", () => {
    const risultati = filtraEOrdina(STOCK, filtri({ maxMileage: "100000" }));
    expect(risultati.map((v) => v.id)).toEqual(["tucson"]);
  });

  it("in coda anche in discesa, non in testa", () => {
    expect(ordinaVeicoli(STOCK, "price_desc").map((v) => v.id)).toEqual(["tucson", "panda", "500e"]);
    expect(ordinaVeicoli(STOCK, "price_asc").map((v) => v.id)).toEqual(["panda", "tucson", "500e"]);
  });
});

describe("il campo di ricerca libera", () => {
  it("cerca ogni parola per conto suo, anche se stanno in punti diversi del titolo", () => {
    expect(veicoloCorrisponde(STOCK[0], filtri({ q: "tucson xline" }))).toBe(true);
    expect(veicoloCorrisponde(STOCK[0], filtri({ q: "tucson benzina" }))).toBe(false);
  });

  it("non si ferma davanti agli accenti e alle maiuscole", () => {
    const coupe = veicolo({ id: "coupe", label: "Peugeot RCZ Coupé", brand: "Peugeot", model: "RCZ" });
    expect(veicoloCorrisponde(coupe, filtri({ q: "COUPE" }))).toBe(true);
  });
});

describe("le tendine non portano mai su un elenco vuoto", () => {
  it("propongono solo cio' che questa concessionaria ha davvero", () => {
    const opzioni = opzioniFiltri(STOCK, DEALER_FILTERS_EMPTY);
    expect(opzioni.brands).toEqual(["Fiat", "Hyundai"]);
    expect(opzioni.bodyTypes).toEqual(["City Car", "SUV"]);
    expect(opzioni.conditions).toEqual(["Km/0", "Usato"]);
    expect(opzioni.years).toEqual(["2024", "2019", "2016"]);
  });

  it("i modelli si restringono alla marca scelta", () => {
    expect(opzioniFiltri(STOCK, filtri({ brand: "Fiat" })).models).toEqual(["500e", "Panda"]);
  });
});

// Chi scrive 2020 in "Anno da" e 2015 in "Anno a" vuole quell'intervallo:
// prenderlo alla lettera restituirebbe zero risultati e sembrerebbe un guasto.
describe("gli anni scritti al contrario", () => {
  it("si scambiano invece di svuotare l'elenco", () => {
    const risultati = filtraEOrdina(STOCK, filtri({ yearFrom: "2020", yearTo: "2016" }));
    expect(risultati.map((v) => v.id)).toEqual(["tucson", "panda"]);
  });
});

// L'etichetta del pulsante dice quanti filtri sono accesi: e' lo stesso
// difetto gia' corretto sull'elenco veicoli del gestionale, dove "Filtri"
// restava muto e i veicoli mancanti sembravano spariti.
describe("il conteggio dei filtri attivi", () => {
  it("conta solo cio' che toglie veicoli, non l'ordinamento", () => {
    expect(contaFiltriAttivi(filtri({ sort: "price_asc" }))).toBe(0);
    expect(contaFiltriAttivi(filtri({ brand: "Fiat", maxPrice: "10000", sort: "price_asc" }))).toBe(2);
  });
});

describe("i filtri si combinano", () => {
  it("marca e alimentazione insieme restringono davvero", () => {
    const risultati = filtraEOrdina(STOCK, filtri({ brand: "Fiat", fuel: "Elettrica" }));
    expect(risultati.map((v) => v.id)).toEqual(["500e"]);
  });

  it("senza filtri l'elenco resta completo e ordinato dal piu' recente", () => {
    expect(filtraEOrdina(STOCK, DEALER_FILTERS_EMPTY).map((v) => v.id)).toEqual(["tucson", "panda", "500e"]);
  });
});

/**
 * **La riga che conta i veicoli non deve contare quelli caricati.**
 *
 * Il 19/09/2026 la pagina della concessionaria mostrava tre numeri contati
 * sulle prime trecento auto caricate: quanti veicoli, il prezzo medio e il
 * **prezzo minimo**. Su De Lorenzi il minimo diceva 7.500 € mentre in vetrina
 * c'era un Ducato a 5.800. Nessun errore da nessuna parte: solo un limite in
 * una richiesta.
 *
 * I primi due sono passati alla vista `vetrina_per_concessionaria`, che conta
 * nel database. Questa riga era il terzo, ed e' l'unico rimasto dentro il
 * browser: qui il totale vero arriva come parametro, e **non e' facoltativo**.
 */
describe("fraseConteggioVeicoli", () => {
  /**
   * **La firma e' cambiata il 20/09/2026.** Prima prendeva "quanti ne
   * mostra, quanti ne ha caricati, quanti ce ne sono": aveva senso finche'
   * la pagina caricava tutto e filtrava nel browser. Adesso su quella
   * pagina non si filtra piu' -- si va su `/ricerca` ristretta alla
   * concessionaria -- e cio' che conta e' **se un filtro e' attivo**,
   * perche' e' quello a decidere se il numero mostrato e' la vetrina o una
   * parte.
   */
  it("senza filtri dice quante auto ha in vetrina", () => {
    expect(fraseConteggioVeicoli(133, 133, 0)).toBe("133 auto in vetrina");
    expect(fraseConteggioVeicoli(1, 1, 0)).toBe("1 auto in vetrina");
  });

  it("con un filtro attivo non dice piu' 'in vetrina'", () => {
    expect(fraseConteggioVeicoli(12, 133, 2)).toBe("12 auto su 133");
    expect(fraseConteggioVeicoli(0, 133, 1)).toBe("0 auto su 133");
  });

  it("se l'elenco e' stato tagliato dal tetto lo dice", () => {
    // 420 in vetrina, la richiesta ne prende 300: prima si leggeva "300
    // auto" -- preciso, credibile, sbagliato di 120.
    expect(fraseConteggioVeicoli(300, 420, 0)).toBe("Prime 300 auto su 420 in vetrina");
  });

  it("quando il totale vero non si sa non lo inventa", () => {
    expect(fraseConteggioVeicoli(133, null, 0)).toBe("133 auto in vetrina");
    expect(fraseConteggioVeicoli(12, null, 3)).toBe("12 auto");
  });

  it("un totale piu' piccolo del mostrato non genera frasi assurde", () => {
    // La vista e l'elenco sono due letture diverse: fra l'una e l'altra
    // un'auto puo' essere stata tolta.
    expect(fraseConteggioVeicoli(133, 130, 0)).toBe("133 auto in vetrina");
  });
});

