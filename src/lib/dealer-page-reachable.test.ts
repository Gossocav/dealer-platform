import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, isMarketplaceVehiclePublishable } from "@/lib/public-marketplace";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const dealerPage = read("src/app/(marketplace)/concessionarie/[slug]/page.tsx");
const vehiclePage = read("src/app/(marketplace)/auto/[id]/page.tsx");
const searchPage = read("src/app/(marketplace)/ricerca/page.tsx");
const ogRoute = read("src/app/og/concessionaria/[slug]/route.tsx");

/**
 * La pagina della concessionaria cercava solo fra quelle in stato "approved",
 * mentre tutto il resto del marketplace pubblica i veicoli anche di quelle in
 * stato "active". Una concessionaria "active" avrebbe quindi avuto le sue auto
 * in vetrina, l'immagine di anteprima della sua pagina funzionante -- e la
 * pagina stessa a rispondere "non trovato", con il bottone della scheda
 * veicolo che ci punta dritto.
 *
 * Non era ancora capitato: nessun percorso di approvazione scrive "active" su
 * dealers.status, e in produzione entrambe le concessionarie erano "approved".
 * Ma la costante esiste proprio perche' quello stato e' ammesso.
 */
describe("chi ha i veicoli in vetrina ha anche la sua pagina", () => {
  it("la pagina della concessionaria ammette gli stessi stati con cui il marketplace pubblica", () => {
    expect(dealerPage).toContain('.in("status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)');
    // Il valore singolo era il difetto: se ricompare, le due condizioni si
    // sono separate di nuovo.
    expect(dealerPage).not.toContain('.eq("status", "approved")');
  });

  it("ogni stato che rende pubblico un veicolo apre anche la pagina di chi lo vende", () => {
    for (const stato of MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES) {
      expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: stato }), stato).toBe(true);
    }
  });

  it("le altre pagine pubbliche usano la stessa costante, non una copia", () => {
    for (const [nome, sorgente] of [
      ["ricerca", searchPage],
      ["anteprima concessionaria", ogRoute],
    ] as const) {
      expect(sorgente, nome).toContain("MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES");
    }
  });

  // Il bottone aggiunto sulla scheda veicolo rende raggiungibile in un clic
  // quella pagina: se tornasse a rispondere "non trovato", il difetto non
  // sarebbe piu' teorico.
  it("la scheda veicolo continua a puntare a quella pagina", () => {
    expect(vehiclePage).toContain("href={`/concessionarie/${dealerSlug}`}");
  });
});
