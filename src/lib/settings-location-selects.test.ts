import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const settings = read("src/app/impostazioni/page.tsx");
const signup = read("src/app/demo/page.tsx");

// Provincia e citta' erano caselle di testo libero. Bastava riscrivere
// "milano" al posto di "Milano" per uscire da tutte le ricerche per distanza
// del marketplace: nessun errore, nessun avviso, i veicoli semplicemente non
// comparivano piu'. La posizione sulla mappa si ricava dal nome del comune,
// che deve corrispondere esattamente.
describe("provincia e città nelle impostazioni", () => {
  it("non sono più caselle di testo libero", () => {
    expect(settings).not.toMatch(/<Field label="Città"/);
    expect(settings).not.toMatch(/<Field label="Provincia"/);
  });

  it("si scelgono dagli stessi elenchi della registrazione", () => {
    // Elenchi diversi fra i due punti d'ingresso riporterebbero il problema:
    // un comune valido in un posto e sconosciuto nell'altro.
    for (const source of [settings, signup]) {
      expect(source).toContain("ITALIAN_PROVINCES");
      expect(source).toContain("ITALIAN_CITIES_BY_PROVINCE");
    }
    expect(settings).toContain("<ProvinceSelect");
    expect(settings).toContain("<CitySelect");
  });

  it("le città seguono la provincia scelta", () => {
    expect(settings).toContain("ITALIAN_CITIES_BY_PROVINCE[province as ItalianProvinceCode]");
    expect(settings).toMatch(/disabled=\{!province\}/);
  });

  it("svuota la città quando non appartiene alla nuova provincia", () => {
    // Una coppia provincia/citta' incoerente non e' collocabile sulla mappa,
    // quindi vale quanto un dato mancante.
    const block = settings.slice(settings.indexOf("<ProvinceSelect"), settings.indexOf("<CitySelect"));
    expect(block).toContain("ITALIAN_CITIES_BY_PROVINCE[value as ItalianProvinceCode]");
    expect(block).toMatch(/\?\s*s\.city\s*:\s*""/);
  });

  it("non cancella di nascosto un valore salvato in passato", () => {
    // Chi ha gia' "milano" scritto a mano deve vederlo e poterlo correggere,
    // non ritrovarsi il campo vuoto senza spiegazione.
    expect(settings).toContain("(da correggere)");
    const occurrences = settings.match(/\(da correggere\)/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it("spiega al concessionario perché quei due campi contano", () => {
    expect(settings).toMatch(/ricerche per distanza/);
  });
});
