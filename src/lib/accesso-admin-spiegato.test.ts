import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * L'accesso al pannello amministrativo deve dire perche' rifiuta.
 *
 * Il 05/09/2026 il titolare non riusciva a entrare e non capiva perche'.
 * Stava usando l'account da concessionario invece di quello da
 * amministratore, ma la pagina non glielo diceva: lo spostava sulla
 * dashboard in silenzio, sia arrivandoci gia' collegato sia dopo aver
 * scritto le credenziali. Dalla schermata il pannello sembrava rotto, e la
 * causa si e' trovata solo leggendo il codice.
 */

const sorgente = readFileSync(resolve(process.cwd(), "src/components/admin-login.tsx"), "utf8");

function senzaCommenti(testo: string) {
  return testo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("la pagina di accesso amministrativo", () => {
  const codice = senzaCommenti(sorgente);

  it("non sposta piu' nessuno sulla dashboard senza dirlo", () => {
    expect(codice).not.toContain('router.replace("/dashboard")');
    expect(codice).not.toContain("router.replace('/dashboard')");
  });

  it("dice con quale account sei collegato quando non basta", () => {
    expect(codice).toContain("sessioneNonAmministratore");
    expect(codice).toContain("Sei collegato come");
  });

  it("dice che l'account non ha accesso, invece di tacere", () => {
    expect(codice).toContain("Questo account non ha accesso al pannello amministrativo");
  });

  it("offre il modo di uscire senza lasciare la pagina", () => {
    expect(codice).toContain("esciDallAccount");
    expect(codice).toContain("auth.signOut()");
  });

  /**
   * La verifica del ruolo era scritta identica in due punti dello stesso
   * file. E' un controllo di accesso: due copie sono due regole che possono
   * divergere, e la copia dimenticata e' quella che sbaglia.
   */
  it("verifica il ruolo in un posto solo", () => {
    expect(codice.split("isPlatformAdminRole(resolveUserRoleFromMetadata(").length - 1).toBe(1);
    expect(codice).toContain("async function eAmministratore(");
  });
});
