import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scheda = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-detail-page.tsx"), "utf8");

/**
 * **La scheda del veicolo dice da dove viene ogni dato.**
 *
 * Questi test leggono il *testo* del sorgente: non provano che la pagina si
 * veda bene -- la resa a video del gestionale richiede le credenziali del
 * concessionario e da qui non e' verificabile -- ma provano che ogni frase
 * arriva dalla libreria che la sa scrivere, e non da una copia scritta a
 * mano nella pagina. Le frasi in se' sono provate in
 * `src/lib/parole-della-scheda.test.ts`.
 */
describe("la scheda chiede al database quello che le serve", () => {
  it("legge la provenienza, il regime IVA, le emissioni e l'origine", () => {
    for (const colonna of ["origine_dati", "vat_regime", "co2_emissions", "import_source"]) {
      expect(scheda, `manca ${colonna} nella select`).toContain(`${colonna},`);
    }
  });

  it("la data d'ingresso arriva incorporata, senza una seconda interrogazione", () => {
    // Una riga per vettura: `vehicle_id` e' la chiave primaria. La produzione
    // la consegna come oggetto (verificato il 18/09/2026) e la pagina accetta
    // anche l'elenco, perche' una forma inattesa farebbe sparire la data in
    // silenzio invece di dare errore.
    expect(scheda).toContain("vehicle_acquisitions(entered_on)");
    expect(scheda).toContain("Array.isArray(vehicle?.vehicle_acquisitions)");
  });

  it("resta vincolata alla concessionaria", () => {
    expect(scheda).toContain('.eq("dealer_id", dealerId)');
  });
});

describe("nessun valore resta nudo", () => {
  it("ogni campo della griglia porta la sua nota", () => {
    // Il conto: i `<Detail` con una nota devono essere quasi tutti. L'unico
    // senza e' lo Stato, che non arriva dal sito -- lo muovono il
    // concessionario e il tetto del piano.
    const conNota = scheda.match(/<Detail[^>]*nota=\{/g)?.length ?? 0;
    const senzaNota = scheda.match(/<Detail label="[^"]+" value=\{[^}]*\} \/>/g)?.length ?? 0;
    expect(conNota).toBeGreaterThanOrEqual(20);
    expect(senzaNota, "un campo della griglia non dice da dove viene").toBeLessThanOrEqual(1);
  });

  it("la nota la scrive la libreria, non la pagina", () => {
    // Tre schermate che se la scrivono da sole sono tre regole che fra sei
    // mesi diranno cose diverse.
    expect(scheda).toContain("notaDelCampo(");
    // La nota dell'ingresso e' una frase, non una fila di diciture: dal
    // 18/09/2026 la compone `notaIngresso` invece della pagina.
    expect(scheda).toContain("notaIngresso(");
    expect(scheda, "la nota dell'ingresso e' tornata una fila di diciture").not.toContain('.join(" · ")');
  });

  it("il prezzo assente non vale piu' zero", () => {
    expect(scheda, "il prezzo mostra ancora 0 € quando manca").not.toContain("Number(vehicle.price ?? 0)");
    expect(scheda).toContain("prezzoDaMostrare(vehicle?.price)");
  });

  it("l'immatricolazione segue il campo che l'ha prodotta", () => {
    // Leggere sempre il segno di `registration_date` direbbe "dal tuo sito" a
    // un'auto importata da file, che quel campo non l'ha mai avuto.
    expect(scheda).toContain("campoDellImmatricolazione(");
    expect(scheda).toContain("immatricolazioneDaMostrare(");
    expect(scheda, "la data viene ancora resa senza sapere da dove arriva").not.toContain("formatRegistrationLabel(");
  });

  it("il regime IVA vuoto dice perche'", () => {
    expect(scheda).toContain("regimeIvaDaMostrare(");
    expect(scheda).toContain('label="Regime IVA"');
  });
});

describe("i giorni in piazzale, con la frase giusta e su tutti i piani", () => {
  it("le due frasi le sceglie la libreria leggendo la qualita' del dato", () => {
    expect(scheda).toContain("fraseIngresso(");
    expect(scheda).toContain('provenienza(vehicle?.origine_dati, "entered_on")');
    expect(scheda, "i giorni sono contati a mano invece che con giorniTra").toContain("giorniTra(ingresso, oggiIso())");
  });

  it("quando la frase non c'e', si dice perche'", () => {
    expect(scheda).toContain("percheNienteIngresso(");
  });

  it("non e' chiusa dietro il piano", () => {
    // La data d'ingresso e i giorni in piazzale li deve vedere anche il Base:
    // la pagina Giacenza con fasce e capitale resta Pro, questa riga no.
    expect(scheda, "i giorni in piazzale sono stati chiusi dietro il piano").not.toContain(
      'pianoComprende(planCode, "giacenza")',
    );
  });

  it("e non si confonde con la data in cui l'abbiamo registrata noi", () => {
    // Per un'auto letta da un sito `created_at` e' la prima sincronizzazione,
    // non l'ingresso in piazzale.
    expect(scheda).toContain("Registrato su KeyAuto il");
    expect(scheda, '"Inserito il" non distingueva le due date').not.toContain(">Inserito il ");
  });
});

describe("il disaccordo con il sito si mostra e basta", () => {
  it("la frase dice chi non e' d'accordo", () => {
    expect(scheda).toContain("fraseDelDisaccordo(");
    expect(scheda).toContain('disaccordo(vehicle?.origine_dati, "price")');
  });

  it("in questa fetta non si chiede niente al concessionario", () => {
    // Prima si mostra, poi si chiede: i bottoni per adottare il valore del
    // sito o tenere il proprio sono la fetta successiva, e con loro la
    // conferma. Vedi SCRITTE_NON_MOSTRATE.md.
    for (const invito of ["Adotta quello del sito", "Tieni il mio", "Conferma il dato"]) {
      expect(scheda, `la scheda chiede gia' qualcosa: "${invito}"`).not.toContain(invito);
    }
  });
});
