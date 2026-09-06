import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gli endpoint del pannello amministrativo hanno una serratura sola.
 *
 * **Quale difetto impedisce.** Fino al 06/09/2026 la verifica "chi chiama e'
 * un amministratore?" era ricopiata a mano dentro **sei** endpoint, circa 70
 * righe l'una: leggere il token dall'intestazione, chiedere a Supabase chi
 * sia, guardare il ruolo in app_metadata, ripiegare su profiles, e rifiutare
 * con 401/403/500 nei casi giusti.
 *
 * Sei copie identiche non fanno danni finche' restano identiche. Il problema
 * e' il giorno che una si scosta: la schermata che si dimentica un caso e'
 * quella che lascia entrare qualcuno, e non lo si scopre guardando le altre
 * cinque, che continuano a essere corrette. Un controllo di accesso non
 * sopporta di esistere in piu' esemplari.
 *
 * Questo test si legge il sorgente perche' la cosa da fissare non e' un
 * comportamento -- quello lo provano i test dei singoli endpoint, e
 * src/lib/admin-api-context.test.ts prova la serratura vera -- ma una
 * **decisione**: che di serrature ce ne sia una sola. Il tipo non puo'
 * esprimerla, e un endpoint nuovo scritto copiando un vecchio la
 * infrangerebbe senza che niente diventi rosso.
 */

const CARTELLA = resolve(process.cwd(), "src/app/api/admin");

function rotte(dir: string): string[] {
  return readdirSync(dir).flatMap((voce) => {
    const percorso = resolve(dir, voce);
    if (statSync(percorso).isDirectory()) return rotte(percorso);
    return voce === "route.ts" ? [percorso] : [];
  });
}

const endpoint = rotte(CARTELLA).map((percorso) => ({
  nome: percorso.slice(percorso.indexOf("api/admin")),
  codice: readFileSync(percorso, "utf8"),
}));

describe("il pannello amministrativo ha una serratura sola", () => {
  it("gli endpoint ci sono, e sono quelli che ci aspettiamo", () => {
    // Se un giorno la cartella cambiasse nome o si svuotasse, le prove qui
    // sotto passerebbero su un elenco vuoto senza proteggere piu' niente.
    expect(endpoint.length).toBeGreaterThanOrEqual(8);
  });

  it("nessun endpoint si legge il token da solo", () => {
    for (const { nome, codice } of endpoint) {
      expect(codice, `${nome} estrae il token per conto suo invece di usare admin-api-context`).not.toMatch(
        /toLowerCase\(\)\.startsWith\("bearer /
      );
    }
  });

  it("nessun endpoint chiede a Supabase chi sta chiamando", () => {
    for (const { nome, codice } of endpoint) {
      expect(codice, `${nome} verifica la sessione per conto suo`).not.toMatch(/auth\.getUser\(/);
    }
  });

  it("nessun endpoint decide da solo se il ruolo basta", () => {
    for (const { nome, codice } of endpoint) {
      expect(codice, `${nome} controlla il ruolo per conto suo`).not.toMatch(/isPlatformAdminRole\(\s*resolveUserRoleFromMetadata/);
    }
  });

  it("ogni endpoint passa dal modulo comune", () => {
    for (const { nome, codice } of endpoint) {
      expect(codice, `${nome} non usa admin-api-context: come decide chi entra?`).toContain("contestoAmministratore");
    }
  });
});
