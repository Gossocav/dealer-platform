import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

function tuttiIFile(cartella: string): string[] {
  const trovati: string[] = [];

  for (const voce of readdirSync(resolve(process.cwd(), cartella))) {
    const percorso = join(cartella, voce);
    if (statSync(resolve(process.cwd(), percorso)).isDirectory()) {
      trovati.push(...tuttiIFile(percorso));
    } else if (voce.endsWith(".tsx") || voce.endsWith(".ts")) {
      trovati.push(percorso);
    }
  }

  return trovati;
}

/**
 * Nessuna pagina pubblica manda i visitatori sul sito di una concessionaria.
 *
 * Deciso dal titolare il 04/09/2026, dopo averli provati: un pulsante che
 * porta al sito del venditore -- o alla sua pagina noleggi -- e' un'uscita
 * dalla piattaforma messa nel punto piu' visibile della pagina. Chi arriva sul
 * marketplace guardando un'automobile deve poter fare tutto qui.
 *
 * Erano in tre posti, e trovarli tutti ha richiesto di cercarli invece di
 * ricordarli: i due pulsanti in cima alla pagina della concessionaria, la riga
 * "Sito web" nel riquadro del venditore su **ogni scheda auto**, e il rimando
 * dentro i dati strutturati per Google. Per questo il controllo guarda tutte
 * le pagine pubbliche invece di elencare quelle note.
 *
 * I dati restano nel database e nelle Impostazioni: e' una decisione su cosa
 * si mostra, non sulla cancellazione di quello che le concessionarie hanno
 * scritto.
 */
describe("nessuna pagina pubblica porta al sito di una concessionaria", () => {
  const PUBBLICHE = [...tuttiIFile("src/app/(marketplace)"), ...tuttiIFile("src/components/marketplace")];

  it("le pagine pubbliche si trovano: se l'elenco fosse vuoto il controllo non proverebbe niente", () => {
    expect(PUBBLICHE.length).toBeGreaterThan(15);
  });

  // Queste colonne non hanno nessun altro significato: se compaiono in una
  // pagina pubblica, ci stanno per essere mostrate.
  const VIETATE = ["rental_url", "facebook_url", "instagram_url", "linkedin_url", "social_links"];

  for (const colonna of VIETATE) {
    it(`nessuna pagina pubblica nomina ${colonna}`, () => {
      for (const percorso of PUBBLICHE) {
        expect(leggi(percorso), `${percorso} rimanda al sito della concessionaria`).not.toContain(colonna);
      }
    });
  }

  /**
   * "website" va cercato con piu' attenzione: la parola compare anche come
   * tipo di anteprima social delle nostre pagine (`type: "website"`) e come
   * nome della trappola anti-robot nel modulo informazioni (`websiteTrap`).
   * Sono due cose nostre, non il sito di un concessionario.
   */
  it("e nessuna legge il sito della concessionaria dal database", () => {
    for (const percorso of PUBBLICHE) {
      const righe = leggi(percorso)
        .split("\n")
        .filter((riga) => /\bwebsite\b/i.test(riga))
        .filter((riga) => !/type:\s*"website"/.test(riga))
        .filter((riga) => !/websiteTrap/i.test(riga))
        // `website: null` e' la dichiarazione esplicita che non c'e' nessun
        // sito da consegnare: e' il contrario di un rimando.
        .filter((riga) => !/website:\s*null/.test(riga));

      expect(righe, `${percorso} usa ancora il sito della concessionaria:\n${righe.join("\n")}`).toEqual([]);
    }
  });

  // Dire a Google "questa azienda sta anche qui" e' un rimando come gli altri,
  // e per di piu' passa peso al sito del concessionario invece che al nostro.
  it("nemmeno i dati strutturati lo dichiarano", () => {
    const paginaConcessionaria = leggi("src/app/(marketplace)/concessionarie/[slug]/page.tsx");
    // Si parte dalla chiamata, non dall'import: nella riga di importazione i
    // due nomi compaiono insieme e in ordine inverso, e la porzione verrebbe
    // vuota.
    const daticStrutturati = paginaConcessionaria.slice(
      paginaConcessionaria.indexOf("buildDealerJsonLd({"),
      paginaConcessionaria.indexOf("buildBreadcrumbJsonLd([")
    );
    expect(daticStrutturati).toContain("website: null");
  });

  // Il componente che disegnava i due pulsanti non esiste piu': lasciarlo
  // inutilizzato sarebbe un invito a rimetterlo.
  it("il componente dei due pulsanti non c'e' piu'", () => {
    const esiste = PUBBLICHE.some((percorso) => percorso.includes("collegamenti-concessionaria"));
    expect(esiste).toBe(false);
  });
});
