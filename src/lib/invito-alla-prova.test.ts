import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_LIMITS } from "@/lib/demo-access";

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
  // **Questo caso diceva "sette giorni", e fissava il numero due volte.**
  // Pretendeva `GIORNI_DI_PROVA === 7` **e** che la migration di luglio
  // contenesse `interval '7 days'`: due affermazioni sullo stesso numero, mai
  // messe a confronto fra loro. Il 21/09/2026, portando la prova a trenta
  // giorni, e' caduto -- ed era giusto che cadesse, perche' il numero era
  // cambiato. Ma la sua ragione, scritta qui sopra, non parlava del numero:
  // parlava del fatto che **la pagina di vendita non deve dichiarare una
  // durata diversa da quella che la piattaforma concede**. Quella ragione
  // regge ancora, e adesso il caso guarda lei.
  //
  // Il confronto vero fra il numero del sito e quello del database sta in
  // `src/lib/durata-della-prova.test.ts`: qui basta che l'invito non
  // conosca nessun numero per conto suo.
  it("l'invito non sa quanto dura la prova: lo chiede", () => {
    expect(invito).toContain('from "@/lib/durata-della-prova"');
    expect(invito).toContain("{GIORNI_DI_PROVA} giorni");
    expect(invito).not.toMatch(/\b\d+ giorni\b/);
  });

  it("il numero dei veicoli non e' scritto a mano ma preso dai limiti veri", () => {
    expect(invito).toContain("DEMO_LIMITS.vehicles");
    expect(DEMO_LIMITS.vehicles).toBe(10);
  });

  it("la costante non vive piu' dentro il componente", () => {
    // Era esportata da qui, ed era gia' "un posto solo" -- ma in un
    // componente della pagina dei piani, dove nessun altro sarebbe andato a
    // prenderla. Infatti nessuno c'e' andato: il numero e' ricomparso a mano
    // in sessanta punti. Un posto solo in un posto che nessuno raggiunge non
    // e' un posto solo.
    expect(invito).not.toMatch(/export const GIORNI_DI_PROVA/);
  });

  // "Gratuita" e' la parola che fa decidere, ed e' anche la piu' costosa da
  // smentire: si scrive perche' la prova non ha davvero nessun costo.
  it("dice gratuita, e dice che non si paga niente per iniziare", () => {
    expect(invito).toContain("gratuita");
    expect(invito).toContain("Non paghi niente per iniziare");
  });
});
