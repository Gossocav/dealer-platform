import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { campiImmatricolazioneDaModulo } from "@/lib/vehicles";

/**
 * Il difetto, segnalato dal titolare il 27/08/2026: **un veicolo importato non
 * si poteva modificare**. Si apriva la scheda, si cambiava il prezzo, si
 * premeva Salva e rispondeva "compila i campi obbligatori mancanti".
 *
 * Misurato in produzione sulle 232 automobili importate dai siti delle
 * concessionarie -- cioe' 232 su 234, quasi tutto il parco:
 *
 * | campo preteso           | quante ne erano prive |
 * |-------------------------|-----------------------|
 * | Interni                 | 232                   |
 * | Cilindrata              | 232                   |
 * | Potenza kW              | 232                   |
 * | Potenza CV              | 232                   |
 * | Data immatricolazione   | 232                   |
 * | Chilometri              | 13                    |
 * | Carrozzeria / Porte     | 10                    |
 *
 * Sono dati che il concessionario non ha -- i siti di origine non li
 * pubblicano -- non dati che si e' dimenticato di scrivere. Pretenderli per
 * salvare significa impedirgli di correggere un prezzo.
 */

const editor = readFileSync(
  resolve(process.cwd(), "src/components/vehicles/vehicle-editor-page.tsx"),
  "utf8",
);

function campiObbligatori(): string[] {
  const blocco = editor.slice(editor.indexOf("const CAMPI_OBBLIGATORI"));
  return [...blocco.slice(0, blocco.indexOf("]")).matchAll(/"([a-zA-Z]+)"/g)].map((t) => t[1]);
}

describe("modificare un veicolo importato non deve chiedere l'impossibile", () => {
  it("non pretende i dati che i siti delle concessionarie non pubblicano", () => {
    const obbligatori = campiObbligatori();

    for (const campo of ["interiorType", "engineSize", "powerKw", "powerCv", "registrationDate"]) {
      expect(obbligatori, campo).not.toContain(campo);
    }
  });

  // Dieci veicoli importati su 232 non hanno carrozzeria o porte, tredici non
  // hanno i chilometri: pochi, ma sono comunque schede che non si potrebbero
  // toccare.
  it("non pretende nemmeno quelli che mancano solo ad alcuni", () => {
    const obbligatori = campiObbligatori();

    for (const campo of ["bodyType", "doors", "mileage", "color", "version"]) {
      expect(obbligatori, campo).not.toContain(campo);
    }
  });

  it("resta obbligatorio cio' che l'importazione porta sempre, e senza cui l'annuncio non sta in piedi", () => {
    expect(campiObbligatori().sort()).toEqual(
      ["brand", "fuel", "model", "price", "status", "transmission", "vehicleCategory", "vehicleCondition"].sort(),
    );
  });

  // L'asterisco accanto all'etichetta e' una promessa: se dice che il campo e'
  // obbligatorio e poi si salva lo stesso, il modulo mente.
  it("l'asterisco resta solo dove serve davvero", () => {
    for (const etichetta of ["Carrozzeria", "Colore", "Interni", "Chilometri"]) {
      expect(editor, etichetta).toContain(`>${etichetta}</span>`);
    }
    expect(editor).toContain(">Marca *</span>");
  });
});

/**
 * Il secondo difetto, che sarebbe comparso proprio togliendo il primo: salvare
 * un veicolo importato ne **cancellava l'anno di immatricolazione**. L'anno si
 * ricava dalla data piena, e quelle vetture la data piena non ce l'hanno --
 * portano mese e anno letti dal sito. Aprire la scheda e premere Salva avrebbe
 * quindi tolto dalla vetrina un dato vero: "10/2025" sarebbe diventato niente.
 */
describe("salvare non deve cancellare l'immatricolazione che c'e' gia'", () => {
  it("senza data piena, l'anno in archivio resta dov'e'", () => {
    expect(campiImmatricolazioneDaModulo({ registrationDate: "", annoInArchivio: "2025" })).toEqual({
      registration_date: null,
      year: "2025",
    });
  });

  it("con la data piena comanda la data, e l'anno si ricava da li'", () => {
    expect(campiImmatricolazioneDaModulo({ registrationDate: "2019-03-15", annoInArchivio: "2025" })).toEqual({
      registration_date: "2019-03-15",
      year: "2019",
    });
  });

  it("senza niente da conservare non si inventa niente", () => {
    expect(campiImmatricolazioneDaModulo({ registrationDate: "", annoInArchivio: null })).toEqual({
      registration_date: null,
      year: null,
    });
  });

  it("il modulo usa questa funzione invece di ricavare l'anno per conto suo", () => {
    expect(editor).toContain("campiImmatricolazioneDaModulo({");
    expect(editor).not.toContain("state.registrationDate.trim().slice(0, 4)");
  });
});
