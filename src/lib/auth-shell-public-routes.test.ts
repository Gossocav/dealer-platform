import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizzaPercorso } from "@/lib/percorso-della-home";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const shell = read("src/components/auth-shell.tsx");

/**
 * La stessa classificazione che fa AuthShell, ricostruita qui per poterla
 * interrogare: l'elenco vero e' dentro il componente, che e' un componente
 * client e non si puo' montare in questi test.
 */
const PUBLIC_OR_STATUS_ROUTES = [
  "/",
  "/demo",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/registrazione",
  "/auto",
  "/ricerca",
  "/concessionarie",
  "/come-funziona",
  "/per-chi-compra",
  "/per-le-concessionarie",
  "/faq",
  "/privacy",
  "/termini",
  "/termini-concessionari",
  "/consenso-marketing",
  "/account/sospeso",
  "/account/in-attesa",
];

function isPublic(rawPathname: string | null) {
  // **La normalizzazione e' quella VERA, non una copia.** Il resto di questa
  // funzione ricostruisce la classificazione del guscio perche' e' un
  // componente client e non si puo' montare qui; ma la parte che il
  // 21/09/2026 ha tenuto la home vuota -- come si riconosce la radice -- si
  // chiama, non si riscrive. Un test che confronta con una propria
  // trascrizione prova la trascrizione.
  const pathname = normalizzaPercorso(rawPathname);
  return PUBLIC_OR_STATUS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// In produzione la home serviva "Verifica autenticazione..." al posto della
// pagina, a Google e a chiunque non esegua JavaScript. Tutte le altre pagine
// pubbliche stavano bene: e' quel "solo la home" che ha portato alla causa.
describe("un percorso assente non trasforma la home in pagina protetta", () => {
  it("il percorso vuoto vale come radice", () => {
    // Senza il ripiego: "" non e' "/" e non comincia per "//", quindi nessuna
    // voce dell'elenco corrisponde e la radice finisce fra le protette.
    expect(isPublic("")).toBe(true);
    expect(isPublic(null)).toBe(true);
  });

  it("la radice si riconosce in tutte e tre le forme che assume davvero", () => {
    // **`/index` e' il valore vero, non un'ipotesi.** Il 21/09/2026 una sonda
    // temporanea nel guscio ha scritto nell'HTML il percorso grezzo, e la
    // copia ricostruita in produzione ha risposto `/index` -- letto due volte
    // a venti secondi di distanza. E' il nome del file prerenderizzato che
    // Vercel usa quando ricostruisce la radice, e non e' ne' vuoto ne' "/":
    // il ripiego di prima copriva solo il primo caso, e la home serviva
    // "Verifica autenticazione..." a chi non esegue JavaScript per tutto il
    // tempo fra una pubblicazione e l'altra.
    expect(isPublic("/index")).toBe(true);
    expect(isPublic("")).toBe(true);
    expect(isPublic(null)).toBe(true);
    expect(isPublic("/")).toBe(true);

    // E non si e' allargata la porta: `/index` diventa la radice, non un
    // lasciapassare per tutto cio' che le somiglia.
    expect(isPublic("/indexof")).toBe(false);
    expect(isPublic("/index/qualcosa")).toBe(false);
    expect(isPublic("/dashboard")).toBe(false);
  });

  it("il componente applica il ripiego", () => {
    /**
     * **Riscritto il 21/09/2026: fissava il testo, non la proprieta'.**
     *
     * L'asserzione copiava la riga parola per parola, quindi e' caduta il
     * giorno in cui quella riga e' diventata due -- una sonda diagnostica
     * che legge il valore grezzo prima del ripiego. Il codice faceva
     * esattamente la stessa cosa. E' il caso gia' scritto in AGENTS.md: si
     * fissa la proprieta', non la forma.
     *
     * **E c'e' una seconda trappola, presa in diretta quello stesso
     * giorno**: il commento che spiega come togliere la sonda contiene la
     * riga vecchia, alla lettera. Un guardiano che cerca quel testo senza
     * togliere i commenti passa **grazie alla spiegazione**, non grazie al
     * codice.
     */
    const codice = shell.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

    // La proprieta': quello che arriva da usePathname passa per la
    // normalizzazione prima di essere confrontato con l'elenco. Dal
    // 21/09/2026 quel ripiego non e' piu' un `|| "/"` scritto a mano ma una
    // funzione con dentro le tre forme, provata qui sopra per davvero.
    expect(codice).toMatch(/normalizzaPercorso\(\s*usePathname\(\)\s*\)/);
  });

  it("la radice resta pubblica anche quando il percorso arriva normale", () => {
    expect(isPublic("/")).toBe(true);
  });
});

describe("le altre pagine si comportano esattamente come prima", () => {
  it("le pubbliche restano pubbliche", () => {
    for (const percorso of [
      "/auto",
      "/auto/26c72aed-a1db-46a3-86b1-1b2efad068d9",
      "/ricerca",
      "/concessionarie",
      "/concessionarie/autogepy-spa",
      "/faq",
      "/privacy",
      "/termini",
      "/come-funziona",
      "/per-chi-compra",
      "/per-le-concessionarie",
      "/registrazione",
      "/demo",
      "/login",
    ]) {
      expect(isPublic(percorso), percorso).toBe(true);
    }
  });

  // La correzione cambia la classificazione di un solo valore -- la stringa
  // vuota -- e quel valore puo' essere soltanto la radice. Nessuna pagina
  // protetta diventa raggiungibile.
  it("le protette restano protette", () => {
    for (const percorso of [
      "/dashboard",
      "/veicoli",
      "/veicoli/nuovo",
      "/clienti",
      "/lead",
      "/agenda",
      "/statistiche",
      "/impostazioni",
      "/email",
      "/abbonamento",
      "/admin",
      "/admin/dealers",
    ]) {
      expect(isPublic(percorso), percorso).toBe(false);
    }
  });

  it("una pagina che comincia come una pubblica non diventa pubblica", () => {
    expect(isPublic("/autorizzazioni")).toBe(false);
    expect(isPublic("/faqx")).toBe(false);
  });
});
