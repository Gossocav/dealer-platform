import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La home puo' conservare una copia **solo finche' `auth-shell` ripiega su
 * "/"**. I due file non si nominano a vicenda, e questo test e' l'unico filo
 * che li tiene legati.
 *
 * Cos'e' successo, e perche' il filo serve. Con un percorso vuoto il
 * confronto in `auth-shell` falliva su ogni voce dell'elenco delle pagine
 * pubbliche -- "" non e' "/", e "" non comincia per "//" -- quindi la sola
 * radice veniva scambiata per un'area protetta e mostrava "Verifica
 * autenticazione..." al posto della pagina. Con la copia conservata quella
 * pagina sbagliata e' stata servita **per ore** a Google e a chi non esegue
 * JavaScript. La cura di allora (PR #151) fu togliere la cache alla home:
 * curava il sintomo e costava 1,8 secondi a ogni visita.
 *
 * Corretta la causa, la cache e' tornata. Ma se un domani qualcuno togliesse
 * quel `|| "/"` -- sembra una ridondanza -- il difetto tornerebbe **e la
 * cache lo diffonderebbe di nuovo**, e nessuno collegherebbe le due cose.
 */

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const authShell = leggi("src/components/auth-shell.tsx");
const home = leggi("src/app/(marketplace)/page.tsx");

describe("la home puo' restare in cache", () => {
  it("auth-shell ripiega su / quando il percorso arriva vuoto", () => {
    expect(authShell).toContain('usePathname() || "/"');
  });

  it('la radice e\' fra le pagine pubbliche riconosciute', () => {
    const elenco = authShell.slice(authShell.indexOf("PUBLIC_OR_STATUS_ROUTES"), authShell.indexOf("];"));
    expect(elenco).toContain('"/"');
  });

  it("la home conserva una copia invece di ricalcolarsi ogni volta", () => {
    expect(home).toContain("export const revalidate = 300");
    expect(home).not.toContain('export const dynamic = "force-dynamic"');
  });

  /**
   * `/auto` legge i filtri dall'indirizzo, quindi Next la calcola comunque a
   * ogni richiesta: li' `force-dynamic` e' onesto e non va tolto sperando in
   * un guadagno che non arriverebbe.
   */
  it("la pagina di ricerca resta calcolata a ogni richiesta, e va bene cosi'", () => {
    const ricerca = leggi("src/app/(marketplace)/auto/page.tsx");
    expect(ricerca).toContain("searchParams");
    expect(ricerca).toContain('export const dynamic = "force-dynamic"');
  });
});
