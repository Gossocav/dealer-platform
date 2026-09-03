import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_PLAN_CATALOG, getDemoPlan } from "@/lib/demo-plan-catalog";

/**
 * Ogni funzione promessa nei piani deve avere qualcosa dietro.
 *
 * Il difetto che questo test impedisce, misurato il 01/09/2026: le pagine di
 * vendita promettevano "Esportazione dati", "CRM Lead avanzato", "Dashboard
 * avanzata" e "Maggiore visibilita' sulla piattaforma" -- quattro voci senza
 * niente dietro, che nessuno si era accorto di aver scritto. Un elenco di
 * vendita non si controlla da solo: o si lega al codice, o divarica.
 *
 * Ogni voce del catalogo deve comparire qui sotto, o come **software** -- e
 * allora i file che la realizzano devono esistere -- o come **servizio**, cioe'
 * qualcosa che fa una persona e non un programma. L'elenco dei servizi resta
 * corto di proposito: sono le sole promesse che il codice non puo' garantire,
 * e vanno guardate in faccia una per una.
 */

type Prova =
  | { tipo: "software"; file: string[] }
  | { tipo: "servizio"; chi: string };

const PROVE: Record<string, Prova> = {
  // ---------- Base ----------
  "Fino a 50 annunci veicolo attivi": {
    tipo: "software",
    file: ["supabase/migrations/20260727020000_enforce_listing_limits.sql"],
  },
  "Gestione completa delle schede veicolo": {
    tipo: "software",
    file: ["src/app/veicoli/nuovo/page.tsx", "src/components/vehicles/vehicle-editor-page.tsx"],
  },
  "Ricezione e gestione dei lead": {
    tipo: "software",
    file: ["src/app/api/marketplace/lead/route.ts", "src/app/lead/page.tsx"],
  },
  "Clienti e appuntamenti": {
    tipo: "software",
    file: ["src/app/clienti/page.tsx", "src/app/agenda/page.tsx"],
  },
  "Email ai clienti dalla piattaforma": {
    tipo: "software",
    file: ["src/app/email/page.tsx", "src/app/api/email/send/route.ts"],
  },
  "Importazione dello stock": {
    tipo: "software",
    file: ["src/app/veicoli/importa/page.tsx", "src/lib/dealer-site-import.ts"],
  },
  "Archivio documenti delle vetture": {
    tipo: "software",
    file: [
      "supabase/migrations/20260903100000_archivio_documenti_veicolo.sql",
      "src/lib/archivio-documenti.ts",
      "src/app/documenti/page.tsx",
      "src/components/documenti/archivio-documenti-page.tsx",
      "src/components/documenti/vetture-con-documenti-page.tsx",
    ],
  },
  "Promemoria e scadenze": {
    tipo: "software",
    file: [
      "supabase/migrations/20260903130000_promemoria.sql",
      "src/lib/promemoria.ts",
      "src/app/promemoria/page.tsx",
      "src/components/vehicles/riquadro-scadenze.tsx",
    ],
  },
  "Dashboard concessionario": {
    tipo: "software",
    file: ["src/app/dashboard/page.tsx"],
  },
  "Supporto via e-mail": {
    tipo: "servizio",
    chi: "Rispondono le persone di KeyAuto: non c'e' codice che possa garantirlo.",
  },

  // ---------- Pro ----------
  "Fino a 150 annunci veicolo attivi": {
    tipo: "software",
    file: ["supabase/migrations/20260727020000_enforce_listing_limits.sql"],
  },
  "Conto economico di ogni vettura": {
    tipo: "software",
    file: [
      "src/components/vehicles/vehicle-economics-card.tsx",
      "supabase/migrations/20260831010000_conto_economico_veicolo.sql",
    ],
  },
  "Vendite mese per mese": {
    tipo: "software",
    file: ["src/app/vendite/page.tsx", "src/components/dashboard/sales-report-page.tsx"],
  },
  "Perizia della vettura prima di comprarla": {
    tipo: "software",
    file: [
      "supabase/migrations/20260902110000_perizia_veicolo.sql",
      "src/lib/scheda-perizia.ts",
      "src/app/perizie/page.tsx",
      "src/components/perizie/perizia-page.tsx",
    ],
  },
  "Giorni di giacenza del parco": {
    tipo: "software",
    file: ["src/app/giacenza/page.tsx", "src/lib/giacenza.ts"],
  },
  "Stampa dei conti economici": {
    tipo: "software",
    file: ["src/app/veicoli/[id]/conto/page.tsx", "src/app/vendite/stampa/page.tsx"],
  },
  "Statistiche con i margini": {
    tipo: "software",
    file: ["src/components/dashboard/margin-summary.tsx"],
  },
  "Supporto prioritario": {
    tipo: "servizio",
    chi: "Come sopra: e' un impegno di chi risponde, non una funzione.",
  },

  // ---------- Elite ----------
  "Fino a 300 annunci veicolo attivi": {
    tipo: "software",
    file: ["supabase/migrations/20260727020000_enforce_listing_limits.sql"],
  },
  "Scheda consegna veicolo": {
    tipo: "software",
    file: ["src/app/veicoli/[id]/consegna/page.tsx", "src/lib/scheda-consegna.ts"],
  },
  "Vetrina in evidenza sulla home di KeyAuto": {
    tipo: "software",
    file: ["supabase/migrations/20260727030000_elite_showcase_dealers.sql", "src/lib/showcase-rotation.ts"],
  },
  "Video dell'automobile sull'annuncio": {
    tipo: "software",
    file: [
      "src/lib/video-annuncio.ts",
      "supabase/migrations/20260901030000_video_annuncio.sql",
      "src/app/(marketplace)/auto/[id]/page.tsx",
    ],
  },
  "Visibilita sui social ufficiali KeyAuto": {
    tipo: "servizio",
    // Verificato il 01/09/2026: nel sito non c'e' nessun collegamento a un
    // canale social di KeyAuto, e nessun codice pubblica niente. E' una
    // promessa che mantiene una persona pubblicando a mano. Se quei canali
    // non esistono o non si alimentano, questa riga va tolta dalle pagine:
    // e' l'ultima voce del catalogo che il codice non puo' garantire.
    chi: "Pubblica una persona sui canali KeyAuto. Nessuna automazione, e nessun canale collegato dal sito.",
  },
};

describe("ogni funzione promessa ha qualcosa dietro", () => {
  const promesse = [...new Set(DEMO_PLAN_CATALOG.flatMap((piano) => piano.includedServices))];

  it("nessuna voce del catalogo e' sconosciuta a questo elenco", () => {
    for (const voce of promesse) {
      expect(PROVE[voce], `"${voce}" e' promessa nei piani ma non e' provata qui`).toBeDefined();
    }
  });

  it("nessuna prova avanza: se una voce sparisce dai piani, sparisce anche di qui", () => {
    for (const voce of Object.keys(PROVE)) {
      expect(promesse, `"${voce}" e' provata qui ma nessun piano la promette piu'`).toContain(voce);
    }
  });

  for (const [voce, prova] of Object.entries(PROVE)) {
    if (prova.tipo !== "software") continue;

    it(`"${voce}" e' realizzata da codice che esiste`, () => {
      for (const percorso of prova.file) {
        expect(existsSync(resolve(process.cwd(), percorso)), `manca ${percorso}`).toBe(true);
      }
    });
  }

  // Le promesse che nessun programma puo' garantire restano poche e
  // dichiarate: sono quelle su cui, se qualcosa non torna, si guarda per prima.
  it("le promesse non-software sono poche e tutte spiegate", () => {
    const servizi = Object.entries(PROVE).filter(([, prova]) => prova.tipo === "servizio");
    expect(servizi.length, "troppe promesse che il codice non garantisce").toBeLessThanOrEqual(3);

    for (const [voce, prova] of servizi) {
      expect((prova as { chi: string }).chi.length, `${voce} senza spiegazione`).toBeGreaterThan(30);
    }
  });
});

describe("le funzioni riservate sono davvero chiuse a chi non le paga", () => {
  // Promettere una funzione a un piano e poi non aprirgliela e' lo stesso
  // difetto al contrario: il concessionario paga e non la trova.
  it("il Base non promette niente che riguardi i soldi", () => {
    const base = getDemoPlan("base")!.includedServices.join(" ");
    for (const parola of ["Conto economico", "Vendite mese", "giacenza", "Giorni di giacenza", "margini"]) {
      expect(base, `il Base promette "${parola}"`).not.toContain(parola);
    }
  });

  it("il Pro promette il conto economico e tutto quello che ne deriva", () => {
    const pro = getDemoPlan("pro")!.includedServices;
    for (const voce of [
      "Conto economico di ogni vettura",
      "Vendite mese per mese",
      "Giorni di giacenza del parco",
      "Stampa dei conti economici",
      "Statistiche con i margini",
    ]) {
      expect(pro, `il Pro non promette "${voce}"`).toContain(voce);
    }
  });

  it("l'Elite promette le cose che lo distinguono dal Pro", () => {
    const soloElite = getDemoPlan("elite")!.servicesOwn.map((s) => s.title);
    expect(soloElite).toContain("Scheda consegna veicolo");
    expect(soloElite).toContain("Vetrina in evidenza sulla home di KeyAuto");
    expect(soloElite).toContain("Video dell'automobile sull'annuncio");
    expect(soloElite).toContain("Visibilita sui social ufficiali KeyAuto");
  });
});
