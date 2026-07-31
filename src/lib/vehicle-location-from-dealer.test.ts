import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDealerLocality } from "@/lib/public-marketplace";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const editor = read("src/components/vehicles/vehicle-editor-page.tsx");
const health = read("src/lib/vehicle-health.ts");
const card = read("src/components/marketplace/vehicle-card.tsx");
const listing = read("src/app/(marketplace)/auto/[id]/page.tsx");
const home = read("src/app/(marketplace)/page.tsx");
const dealersPage = read("src/app/(marketplace)/concessionarie/page.tsx");
const sheet = read("src/components/vehicles/vehicle-sheet-page.tsx");
const consolePage = read("src/components/vehicles/vehicle-detail-page.tsx");

// I veicoli avevano citta' e provincia proprie, compilate a mano una per auto e
// mai tenute in accordo con la sede. In produzione l'unico veicolo pubblicato
// dichiarava Bard (AO) mentre la concessionaria sta a Bagnolo in Piano (RE):
// chi cercava entro 25 km da Reggio lo trovava e poi leggeva Valle d'Aosta.
describe("la posizione di un veicolo e' quella della concessionaria", () => {
  it("compone citta' e provincia della sede", () => {
    expect(resolveDealerLocality({ city: "Bagnolo in Piano", province: "RE" } as never)).toBe("Bagnolo in Piano (RE)");
    expect(resolveDealerLocality([{ city: "Milano", province: "MI" }] as never)).toBe("Milano (MI)");
  });

  it("omette la provincia quando manca, invece di lasciare parentesi vuote", () => {
    expect(resolveDealerLocality({ city: "Bagnolo in Piano", province: null } as never)).toBe("Bagnolo in Piano");
  });

  it("non inventa nulla senza citta'", () => {
    expect(resolveDealerLocality({ city: null, province: "RE" } as never)).toBeNull();
    expect(resolveDealerLocality(null)).toBeNull();
  });
});

describe("il veicolo non porta piu' una posizione propria", () => {
  it("il modulo di inserimento non chiede citta' ne' provincia", () => {
    // Due campi in meno da compilare a ogni auto, e due in meno da sbagliare.
    expect(editor).not.toMatch(/getFieldLabelClass\(missingFieldSet\.has\("city"\)\)/);
    expect(editor).not.toMatch(/getFieldLabelClass\(missingFieldSet\.has\("province"\)\)/);
  });

  it("non le salva piu' sul veicolo", () => {
    const payload = editor.slice(editor.indexOf("const vehiclePayload = {"), editor.indexOf("};", editor.indexOf("const vehiclePayload = {")));
    expect(payload).not.toMatch(/^\s+city:/m);
    expect(payload).not.toMatch(/^\s+province:/m);
  });

  it("non blocca piu' la pubblicazione su un campo che non si compila", () => {
    // La regola pretendeva citta' e provincia sul veicolo: lasciata in piedi,
    // nessun veicolo sarebbe piu' stato pubblicabile.
    expect(health).not.toContain('code: "location"');
    expect(health).not.toMatch(/hasText\(vehicle\.city\)/);
  });

  it("sparisce dalla scheda stampabile e dalla pagina nel pannello", () => {
    // Sulla scheda la sede sta gia' nel piede di pagina, con nome e telefono.
    expect(sheet).not.toContain('label: "Localita"');
    expect(consolePage).not.toMatch(/<Detail label="Citta"/);
    expect(consolePage).not.toMatch(/<Detail label="Provincia"/);
  });
});

describe("le pagine pubbliche mostrano la sede", () => {
  it("la card dei risultati", () => {
    expect(card).toContain("resolveDealerLocality(vehicle.dealers)");
    expect(card).not.toContain("formatText(vehicle.city)");
  });

  it("l'annuncio", () => {
    // La riga localita' univa sede e citta' del veicolo, quindi mostrava la
    // contraddizione per intero: "Bagnolo in Piano • Bard • AO".
    expect(listing).not.toMatch(/formatText\(vehicle\.city\)/);
    expect(listing).not.toMatch(/formatText\(vehicle\.province\)/);
  });

  it("la home e l'elenco concessionarie", () => {
    expect(home).toContain("resolveDealerLocality(vehicle.dealers)");
    expect(home).not.toMatch(/formatText\(vehicle\.city\)/);
    expect(dealersPage).toContain("resolveDealerLocality(");
    expect(dealersPage).not.toMatch(/formatText\(vehicle\.city\)/);
  });

  it('conta le "Città coperte" dalle sedi, non dai veicoli', () => {
    const block = home.slice(home.indexOf("const coveredCities"), home.indexOf("const partnerDealerNames"));
    expect(block).toContain("publishedRows");
    expect(block).not.toContain("vehicle.city");
  });

  it("legge la sede in ogni query che alimenta una card", () => {
    // Senza city e province nella join la localita' resterebbe vuota ovunque.
    for (const [name, source] of [["home", home], ["card", read("src/app/(marketplace)/auto/page.tsx")], ["ricerca", read("src/app/(marketplace)/ricerca/page.tsx")]] as const) {
      expect(source, `${name} non legge la sede della concessionaria`).toContain("legal_name, status, city, province");
    }
  });
});
