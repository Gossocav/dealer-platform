import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const MIGRATION = "supabase/migrations/20260831000000_colonne_riservate_non_pubbliche.sql";
const sql = leggi(MIGRATION);

/**
 * Le colonne che il pubblico non deve leggere, e la ragione di ciascuna.
 *
 * La protezione per riga nasconde le righe, non le colonne: `vehicles` e
 * `dealers` devono essere pubbliche perche' sono il marketplace, e lo erano
 * in tutte le loro colonne. Misurato il 31/08/2026 con la sola chiave del
 * sito: 44 colonne su vehicles, 38 su dealers, tutte leggibili da chiunque.
 */
const RISERVATE: Record<string, Record<string, string>> = {
  vehicles: {
    vin: "con il telaio si clona l'identita' di un'automobile",
    plate: "la targa identifica il veicolo e chi ce l'ha davanti casa",
    customer_id: "lega una vettura a una scheda cliente, che e' dato personale",
    import_source: "rivela da quale sito rispecchiamo lo stock",
    import_source_id: "idem",
    import_missing_since: "meccanica interna della sincronizzazione",
    import_synced_at: "idem",
  },
  dealers: {
    plan: "il listino clienti della piattaforma",
    subscription_plan: "idem",
    subscription_status: "chi paga e chi no",
    account_type: "chi e' in prova e chi no",
    demo_expires_at: "quando scade la prova di un concorrente",
    demo_status: "idem",
    demo_started_at: "idem",
    demo_approved_at: "idem",
    demo_approved_by: "idem",
    demo_converted_at: "idem",
    demo_revoked_at: "idem",
    demo_request_id: "idem",
    fiscal_code: "il codice fiscale del titolare e' dato personale",
    contact_person: "il nome della persona di riferimento e' dato personale",
    user_id: "lega la concessionaria a un account",
  },
};

/** Le colonne concesse al pubblico dalla migration, tabella per tabella. */
function concesse(tabella: string): string[] {
  const inizio = sql.indexOf(`grant select (`, sql.indexOf(`revoke select on public.${tabella}`));
  const fine = sql.indexOf(`on public.${tabella} to anon;`, inizio);
  expect(inizio, `nessun grant per ${tabella}`).toBeGreaterThan(-1);
  expect(fine, `grant di ${tabella} senza chiusura`).toBeGreaterThan(inizio);

  return sql
    .slice(sql.indexOf("(", inizio) + 1, sql.lastIndexOf(")", fine))
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Le colonne che il codice pubblico chiede davvero.
 *
 * Si guardano solo i file che usano `publicSupabase`, cioe' quelli che
 * interrogano con la chiave del sito: il gestionale usa un'altra chiave e un
 * altro ruolo, e non e' toccato da questi permessi.
 */
function chieste(): Record<string, Set<string>> {
  const trovate: Record<string, Set<string>> = { vehicles: new Set(), dealers: new Set() };

  const file: string[] = [];
  const visita = (cartella: string) => {
    for (const voce of readdirSync(resolve(process.cwd(), cartella))) {
      const percorso = `${cartella}/${voce}`;
      if (statSync(resolve(process.cwd(), percorso)).isDirectory()) visita(percorso);
      else if (/\.tsx?$/.test(voce) && !voce.includes(".test.")) file.push(percorso);
    }
  };
  visita("src/app/(marketplace)");
  visita("src/app/og");
  file.push("src/lib/public-marketplace.ts", "src/app/sitemap.ts");

  for (const percorso of file) {
    const sorgente = leggi(percorso);
    if (!sorgente.includes("publicSupabase")) continue;

    // Ogni blocco comincia con .from("tabella") e la sua select e' la prima
    // che segue: e' l'ordine con cui si scrive una query di Supabase.
    for (const pezzo of sorgente.split('.from("').slice(1)) {
      const tabella = pezzo.slice(0, pezzo.indexOf('"'));
      const select = /\.select\(\s*"([^"]+)"/.exec(pezzo);
      if (!select || !(tabella in trovate)) continue;

      let testo = select[1];

      // Prima i gruppi annidati -- dealers!inner(...), vehicle_images(...) --
      // che appartengono a un'altra tabella e vanno tolti di mezzo.
      for (const gruppo of testo.matchAll(/([a-z_]+)!?\w*\(([^)]*)\)/g)) {
        const nome = gruppo[1];
        if (!(nome in trovate)) continue;
        for (const colonna of gruppo[2].split(",")) {
          const pulita = colonna.trim().split(":").pop()?.trim();
          if (pulita) trovate[nome].add(pulita);
        }
      }
      testo = testo.replace(/[a-z_]+!?\w*\([^)]*\)/g, "");

      for (const colonna of testo.split(",")) {
        const pulita = colonna.trim().split(":").pop()?.trim();
        if (pulita && /^[a-z_0-9]+$/.test(pulita)) trovate[tabella].add(pulita);
      }

      // Anche le colonne su cui si **filtra** e si **ordina** vogliono il
      // permesso: Postgres non distingue fra leggere un valore e confrontarlo.
      // Una colonna filtrata e non concessa fa fallire tutta la query, ed e'
      // il modo piu' facile di rompere il sito con questa migration.
      // Ci si ferma alla fine dell'istruzione: dopo il punto e virgola
      // comincia altro codice, e i suoi filtri parlano di un'altra tabella.
      const finePezzo = pezzo.indexOf(";", pezzo.indexOf(select[0]));
      const istruzione = finePezzo === -1 ? pezzo : pezzo.slice(0, finePezzo);
      for (const filtro of istruzione.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|order|contains|overlaps)\(\s*"([a-z_0-9.]+)"/g)) {
        const colonna = filtro[1];
        // I filtri sulle colonne di una tabella annidata si scrivono
        // "dealers.status": appartengono a quella, non a questa.
        if (colonna.includes(".")) {
          const [altra, sua] = colonna.split(".");
          if (altra in trovate) trovate[altra].add(sua);
          continue;
        }
        trovate[tabella].add(colonna);
      }
    }
  }

  return trovate;
}

const lette = chieste();

// Se il lettore qui sopra smettesse di trovare le query, tutti i controlli
// sotto passerebbero a vuoto. Questo li tiene onesti.
describe("il lettore delle interrogazioni pubbliche funziona", () => {
  it("trova le colonne che sappiamo esserci", () => {
    expect(lette.vehicles.size).toBeGreaterThan(20);
    expect(lette.dealers.size).toBeGreaterThan(6);
    expect(lette.vehicles.has("price")).toBe(true);
    expect(lette.dealers.has("legal_name")).toBe(true);
  });
});

describe("il pubblico legge solo quello che deve", () => {
  for (const tabella of Object.keys(RISERVATE)) {
    it(`nessuna colonna riservata di ${tabella} e' concessa al pubblico`, () => {
      const pubbliche = new Set(concesse(tabella));
      for (const [colonna, ragione] of Object.entries(RISERVATE[tabella])) {
        expect(pubbliche.has(colonna), `${tabella}.${colonna} e' concessa al pubblico: ${ragione}`).toBe(false);
      }
    });

    it(`nessuna pagina pubblica chiede una colonna riservata di ${tabella}`, () => {
      // Anche se il database la rifiutasse, chiederla romperebbe la pagina:
      // Postgres nega l'intera interrogazione, non la singola colonna.
      for (const [colonna, ragione] of Object.entries(RISERVATE[tabella])) {
        expect(lette[tabella].has(colonna), `una pagina pubblica chiede ${tabella}.${colonna}: ${ragione}`).toBe(false);
      }
    });

    it(`tutto quello che le pagine pubbliche chiedono a ${tabella} e' concesso`, () => {
      // Il verso opposto, ed e' quello che rompe il sito invece di aprirlo:
      // una colonna chiesta e non concessa fa fallire l'intera query.
      const pubbliche = new Set(concesse(tabella));
      for (const colonna of lette[tabella]) {
        expect(pubbliche.has(colonna), `${tabella}.${colonna} e' chiesta dal marketplace ma non concessa in ${MIGRATION}`).toBe(true);
      }
    });
  }
});

describe("il telaio non esce dal gestionale", () => {
  const scheda = leggi("src/app/(marketplace)/auto/[id]/page.tsx");
  const datiStrutturati = leggi("src/lib/structured-data.ts");

  it("non compare nella scheda pubblica", () => {
    expect(scheda).not.toContain('label: "Telaio"');
    expect(scheda).not.toMatch(/\bvin\b/);
  });

  it("non compare nei dati strutturati per i motori di ricerca", () => {
    // Google lo accetterebbe e lo gradirebbe. Non lo diamo lo stesso.
    expect(datiStrutturati).not.toContain("vehicleIdentificationNumber");
  });
});
