import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_LIMITS } from "@/lib/demo-access";
import { GIORNI_DI_PROVA } from "@/components/marketplace/invito-alla-prova";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const invito = leggi("src/components/marketplace/invito-alla-prova.tsx");
const PAGINE = ["base", "pro", "elite"].map((c) => `src/app/(marketplace)/registrazione/${c}/page.tsx`);

/**
 * L'invito a provare e' il punto della pagina in cui il concessionario decide
 * se scriverti. Diceva "Registrazione diretta disattivata": vero -- l'account
 * nasce dalla demo che il titolare approva, non c'e' iscrizione fai-da-te --
 * ma raccontato dal lato sbagliato, come una cosa nostra che abbiamo spento.
 * A chi legge suonava come un guasto.
 */
describe("l'invito parla al concessionario, non di noi", () => {
  it("nessuna pagina dice piu' che qualcosa e' disattivato", () => {
    for (const percorso of PAGINE) {
      expect(leggi(percorso), percorso).not.toContain("disattivata");
    }
  });

  it("le tre pagine usano lo stesso invito, non tre copie", () => {
    for (const percorso of PAGINE) {
      expect(leggi(percorso), percorso).toContain("<InvitoAllaProva");
    }
  });

  it("restano tutte e due le strade per farsi vivi", () => {
    expect(invito).toContain("/demo?piano=");
    expect(invito).toContain("#richiedi-informazioni");
  });
});

/**
 * Il difetto che questi test impediscono: scrivere sulla pagina di vendita un
 * numero diverso da quello che la piattaforma concede davvero. E' la stessa
 * forma delle quattro funzioni promesse e mai esistite, e costa di piu':
 * questa e' una promessa che il cliente verifica il primo giorno.
 */
describe("la durata e i limiti dichiarati sono quelli veri", () => {
  it("sette giorni e' quello che concede il database", () => {
    const rpc = leggi("supabase/migrations/20260717000005_demo_rpc_core.sql");
    expect(GIORNI_DI_PROVA).toBe(7);
    expect(rpc, "il database non concede piu' 7 giorni").toContain("interval '7 days'");
  });

  it("il numero dei veicoli non e' scritto a mano ma preso dai limiti veri", () => {
    expect(invito).toContain("DEMO_LIMITS.vehicles");
    expect(DEMO_LIMITS.vehicles).toBe(10);
  });

  it("la durata compare nel testo, e viene dalla costante", () => {
    expect(invito).toContain("{GIORNI_DI_PROVA} giorni");
    expect(invito).not.toMatch(/\b7 giorni\b/);
  });

  // "Gratuita" e' la parola che fa decidere, ed e' anche la piu' costosa da
  // smentire: si scrive perche' la prova non ha davvero nessun costo.
  it("dice gratuita, e dice che non si paga niente per iniziare", () => {
    expect(invito).toContain("gratuita");
    expect(invito).toContain("Non paghi niente per iniziare");
  });
});
