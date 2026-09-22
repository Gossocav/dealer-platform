import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eUnIdentificativoDiVeicolo, isMarketplaceVehiclePublishable, resolveVehicleLabel } from "./public-marketplace";

describe("isMarketplaceVehiclePublishable", () => {
  it("allows published vehicles from approved or active dealers", () => {
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "approved" })).toBe(true);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "active" })).toBe(true);
  });

  it("blocks unpublished vehicles and non-publishable dealer states", () => {
    expect(isMarketplaceVehiclePublishable({ published: false, status: "published", dealerStatus: "approved" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "draft", dealerStatus: "approved" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "rejected" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "suspended" })).toBe(false);
  });
});

describe("resolveVehicleLabel", () => {
  it("fixes a real-world lowercase trim (Alfa Romeo Stelvio 'sprint')", () => {
    expect(resolveVehicleLabel({ brand: "Alfa Romeo", model: "Stelvio", version: "sprint" })).toBe(
      "Alfa Romeo Stelvio Sprint"
    );
  });

  it("fixes a real-world all-caps brand + trim, keeping the short model acronym (Porsche 'PORSCHE GT3 TURBO')", () => {
    expect(resolveVehicleLabel({ brand: "PORSCHE", model: "GT3", version: "TURBO" })).toBe("Porsche GT3 Turbo");
  });

  it("leaves already-mixed-case words untouched", () => {
    expect(resolveVehicleLabel({ brand: "Volkswagen", model: "Golf", version: "GTI" })).toBe("Volkswagen Golf GTI");
  });

  it("keeps short all-caps brand acronyms as-is (BMW, KIA)", () => {
    expect(resolveVehicleLabel({ brand: "BMW", model: "X5", version: null })).toBe("BMW X5");
    expect(resolveVehicleLabel({ brand: "KIA", model: "Sportage", version: null })).toBe("KIA Sportage");
  });

  it("falls back to 'Veicolo' when every field is empty", () => {
    expect(resolveVehicleLabel({ brand: null, model: null, version: null })).toBe("Veicolo");
  });

  // Un'importazione aveva scritto "Hyundai Tucson" anche nella versione:
  // l'intestazione mostrava "Hyundai Tucson Hyundai Tucson".
  it("drops the version when it duplicates brand + model entirely", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Hyundai Tucson" })).toBe(
      "Hyundai Tucson"
    );
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "hyundai tucson" })).toBe(
      "Hyundai Tucson"
    );
  });

  it("keeps only the real trim when the version repeats brand + model as a prefix", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Hyundai Tucson N Line" })).toBe(
      "Hyundai Tucson N Line"
    );
  });

  it("drops a version that only repeats the model, keeping the real trim", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Tucson N Line" })).toBe(
      "Hyundai Tucson N Line"
    );
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Tucson" })).toBe("Hyundai Tucson");
  });

  // Solo la ripetizione in testa, e solo a parola intera: qui "Tucson" non e'
  // una ripetizione di "Tuc", e va lasciata dov'e'.
  it("does not cut a version that merely starts with the same letters", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tuc", version: "Tucson" })).toBe("Hyundai Tuc Tucson");
  });

  // L'altro modo in cui nasce "Hyundai Tucson Hyundai Tucson": non e' la
  // versione a ripetersi, sono marca e modello a portare lo stesso titolo.
  it("drops the brand when the model already carries it", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Hyundai Tucson", version: null })).toBe("Hyundai Tucson");
    expect(resolveVehicleLabel({ brand: "Hyundai Tucson", model: "Hyundai Tucson", version: null })).toBe(
      "Hyundai Tucson"
    );
  });

  it("keeps a model whose name merely starts like the brand", () => {
    expect(resolveVehicleLabel({ brand: "Mercedes", model: "Mercedes-Benz Classe A", version: null })).toBe(
      "Mercedes Mercedes-Benz Classe A"
    );
  });

  it("leaves a trim that names the model later on untouched", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "1.6 CRDi Tucson Edition" })).toBe(
      "Hyundai Tucson 1.6 CRDi Tucson Edition"
    );
  });
});

/**
 * Il difetto che questo blocco impedisce, misurato in produzione il
 * 22/09/2026.
 *
 * La scheda veicolo chiedeva al database qualunque cosa arrivasse
 * nell'indirizzo. Postgres rifiuta una stringa che non e' un UUID, e quel
 * rifiuto tornava come **errore del database** -- che la pagina, per una
 * scelta giusta, non confonde con "l'auto non c'e'": un guasto momentaneo non
 * deve far togliere dall'indice un'auto vera. Il risultato era pero' un
 * **500**, e per sempre, perche' quell'indirizzo non sara' mai un'auto.
 *
 * Non serviva scrivere niente di storto per arrivarci. Misurato sul sito vero:
 * `/auto/<id>` rispondeva 200, `/auto/<id>.` -- il link incollato a fine frase
 * -- rispondeva 500, e cosi' un id troncato da un'email o seguito da uno
 * spazio.
 *
 * **Perche' conta piu' di quanto sembri.** La documentazione di Google dice
 * che con errori 5xx "il limite scende e Google scansiona meno", mentre un 404
 * e' "un segnale forte a non riprovare quell'indirizzo". Quindi ogni indirizzo
 * sbagliato toglieva scansioni alle 262 schede che aspettano di essere lette.
 */
describe("un identificativo di veicolo che non e' un identificativo", () => {
  it("riconosce un identificativo vero", () => {
    expect(eUnIdentificativoDiVeicolo("000e6e4e-7cdc-403d-bffa-1337dd94bf2a")).toBe(true);
    // Le maiuscole sono la stessa cosa: un indirizzo copiato puo' averle.
    expect(eUnIdentificativoDiVeicolo("000E6E4E-7CDC-403D-BFFA-1337DD94BF2A")).toBe(true);
  });

  // Sono le quattro forme misurate sul sito vero, non casi inventati.
  it("scarta le forme che in produzione rispondevano 500", () => {
    const vero = "000e6e4e-7cdc-403d-bffa-1337dd94bf2a";

    expect(eUnIdentificativoDiVeicolo(`${vero}.`), "il link a fine frase").toBe(false);
    expect(eUnIdentificativoDiVeicolo(vero.slice(0, 30)), "il link troncato").toBe(false);
    // Misurato come 500: `/auto/<id>%20`. Ripulire lo spazio qui sarebbe la
    // trappola peggiore -- il controllo direbbe "va bene" e l'interrogazione
    // userebbe comunque l'indirizzo con lo spazio dentro.
    expect(eUnIdentificativoDiVeicolo(`${vero} `), "lo spazio in coda").toBe(false);
    expect(eUnIdentificativoDiVeicolo("spazzatura"), "una parola qualsiasi").toBe(false);
    expect(eUnIdentificativoDiVeicolo("123"), "un numero").toBe(false);
    expect(eUnIdentificativoDiVeicolo("undefined"), "il classico undefined").toBe(false);
  });

  it("scarta il vuoto e cio' che non c'e'", () => {
    expect(eUnIdentificativoDiVeicolo("")).toBe(false);
    expect(eUnIdentificativoDiVeicolo("   ")).toBe(false);
    expect(eUnIdentificativoDiVeicolo(null)).toBe(false);
    expect(eUnIdentificativoDiVeicolo(undefined)).toBe(false);
  });

  /**
   * Le prove qui sopra dicono che la funzione sa distinguere. Non dicono che
   * la scheda veicolo la chiami: senza questa, tornare a interrogare il
   * database con l'indirizzo grezzo non farebbe fallire niente.
   */
  it("la scheda veicolo la usa prima di interrogare il database", () => {
    const scheda = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/page.tsx"), "utf8");

    expect(scheda).toContain("eUnIdentificativoDiVeicolo");
    expect(scheda).toContain("if (!eUnIdentificativoDiVeicolo(id)) {");
    // Il controllo deve stare **prima** dell'interrogazione, non dopo: dopo
    // sarebbe gia' arrivato l'errore del database.
    expect(scheda.indexOf("if (!eUnIdentificativoDiVeicolo(id)) {")).toBeLessThan(scheda.indexOf("return interrogaIlCatalogo();"));
  });

  /**
   * E un guasto vero resta un guasto: la pagina deve continuare a rilanciare
   * l'errore del database invece di dichiarare sparita un'auto che esiste.
   * E' la distinzione che il 500 su un indirizzo storto aveva confuso.
   */
  it("un errore del database resta un errore, non diventa 'auto inesistente'", () => {
    const scheda = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/page.tsx"), "utf8");

    expect(scheda).toContain("throw new Error(`Impossibile caricare la scheda veicolo:");
  });
});
