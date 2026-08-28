import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  const pathname = rawPathname || "/";
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

  it("il componente applica il ripiego", () => {
    expect(shell).toContain('const pathname = usePathname() || "/"');
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
