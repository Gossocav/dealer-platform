import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_PLAN_CATALOG, getDemoPlan } from "@/lib/demo-plan-catalog";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Il difetto che questi test impediscono, misurato il 01/09/2026 prima di
 * avere un solo cliente: le pagine di vendita promettevano quattro cose che
 * nel codice non esistono. "Esportazione dati" a Pro ed Elite -- nessun
 * pulsante scarica niente. "Maggiore visibilita' sulla piattaforma" al Pro --
 * esiste solo come vetrina Elite. "CRM Lead avanzato" e "Dashboard avanzata"
 * a Pro ed Elite -- indistinguibili da quelli del Base.
 *
 * Nessuno aveva ancora comprato, quindi non e' stata una promessa tradita. Ma
 * una riga di elenco che non corrisponde a niente e' un debito che si paga al
 * primo cliente, e il modo di non contrarlo piu' e' avere una sorgente sola.
 */
describe("le pagine promettono solo quello che il catalogo dichiara", () => {
  const PAGINE_DI_VENDITA = [
    "src/app/(marketplace)/registrazione/base/page.tsx",
    "src/app/(marketplace)/registrazione/pro/page.tsx",
    "src/app/(marketplace)/registrazione/elite/page.tsx",
    "src/app/(marketplace)/per-le-concessionarie/page.tsx",
    "src/app/abbonamento/page.tsx",
    "src/app/abbonamento/base/page.tsx",
    "src/app/abbonamento/pro/page.tsx",
  ];

  const PROMESSE_RITIRATE = [
    "Esportazione dati",
    "CRM Lead avanzato",
    "Dashboard concessionario avanzata",
    "Maggiore visibilita sulla piattaforma",
    "Maggiore visibilità sulla piattaforma",
  ];

  it("nessuna pagina rimette una promessa ritirata", () => {
    for (const percorso of PAGINE_DI_VENDITA) {
      const sorgente = leggi(percorso);
      for (const promessa of PROMESSE_RITIRATE) {
        expect(sorgente, `${percorso} promette ancora "${promessa}"`).not.toContain(promessa);
      }
    }
  });

  it("nemmeno il catalogo le rimette", () => {
    for (const piano of DEMO_PLAN_CATALOG) {
      for (const promessa of PROMESSE_RITIRATE) {
        expect(piano.includedServices, `${piano.code} promette "${promessa}"`).not.toContain(promessa);
      }
    }
  });
});

/**
 * Il criterio della divisione, deciso dal titolare il 01/09/2026: non quante
 * auto hai, ma cosa ci fai. Base = farsi trovare, Pro = sapere quanto
 * guadagni, Elite = vendere di piu'.
 */
describe("la divisione dei piani segue il criterio deciso", () => {
  const conto = "Conto economico di ogni vettura";

  it("il conto economico e' la ragione per passare al Pro", () => {
    expect(getDemoPlan("base")?.includedServices).not.toContain(conto);
    expect(getDemoPlan("pro")?.includedServices).toContain(conto);
    expect(getDemoPlan("elite")?.includedServices).toContain(conto);
  });

  // Il difetto che questo impedisce: mettere il conto economico nell'Elite
  // lascerebbe il Pro con soli 100 annunci in piu' del Base -- un piano di
  // mezzo vuoto, che nessuno sceglie, e un salto da chiedere al cliente da
  // 99 a 399 invece che da 99 a 199.
  it("il Pro aggiunge qualcosa oltre alla capienza", () => {
    const aggiunte = getDemoPlan("pro")?.servicesOwn.map((s) => s.title) ?? [];
    const oltreGliAnnunci = aggiunte.filter((titolo) => !/annunci/i.test(titolo));
    expect(oltreGliAnnunci.length, "il Pro aggiunge solo annunci: e' un piano vuoto").toBeGreaterThanOrEqual(3);
  });

  it("il Base non promette nessuna funzione che parli di soldi", () => {
    const base = getDemoPlan("base")?.includedServices ?? [];
    for (const parola of ["Conto economico", "margin", "Margine", "Vendite mese", "giacenza", "Giacenza"]) {
      expect(base.join(" "), `il Base promette "${parola}"`).not.toContain(parola);
    }
  });

  it("l'Elite aggiunge visibilita', non rendicontazione", () => {
    const aggiunte = getDemoPlan("elite")?.servicesOwn.map((s) => s.title).join(" ") ?? "";
    expect(aggiunte).toContain("Vetrina in evidenza");
    expect(aggiunte).toContain("social");
    expect(aggiunte).not.toContain("Conto economico");
  });
});

describe("i piani sono cumulativi: chi paga di piu' non perde niente", () => {
  it("tutto quello del Base sta nel Pro, e tutto quello del Pro sta nell'Elite", () => {
    const base = getDemoPlan("base")!.includedServices;
    const pro = getDemoPlan("pro")!.includedServices;
    const elite = getDemoPlan("elite")!.includedServices;

    // Salvo la capienza, che sostituisce quella del piano sotto invece di
    // aggiungersi: "fino a 150" non convive con "fino a 50".
    for (const voce of base.filter((v) => !/annunci/i.test(v))) {
      expect(pro, `il Pro perde "${voce}"`).toContain(voce);
    }
    for (const voce of pro.filter((v) => !/annunci/i.test(v))) {
      expect(elite, `l'Elite perde "${voce}"`).toContain(voce);
    }
  });

  // Ogni voce dice cosa fa: un elenco di titoli senza spiegazione si legge
  // come un elenco di sigle, e chi compra non capisce cosa sta comprando.
  it("ogni voce ha una spiegazione, non solo un titolo", () => {
    for (const piano of DEMO_PLAN_CATALOG) {
      for (const servizio of piano.services) {
        expect(servizio.description.length, `${piano.code}: "${servizio.title}" senza spiegazione`).toBeGreaterThan(40);
      }
    }
  });
});
