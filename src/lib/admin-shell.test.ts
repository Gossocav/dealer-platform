import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const PAGINE = [
  "src/app/admin/page.tsx",
  "src/app/admin/dealers/page.tsx",
  "src/app/admin/demo-requests/page.tsx",
  "src/app/admin/info-requests/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/dealer-approval/page.tsx",
] as const;

const shell = read("src/components/layout/admin-shell.tsx");

// Ogni pagina amministrativa si disegnava la propria intestazione, con
// larghezze diverse fra loro e nessun modo di passare da una sezione
// all'altra: si tornava alla dashboard o si scriveva l'indirizzo a mano.
describe("il pannello amministrativo e' un pezzo solo", () => {
  it.each(PAGINE)("%s usa l'involucro comune", (percorso) => {
    expect(read(percorso)).toContain("<AdminShell");
  });

  it.each(PAGINE)("%s non si ridisegna la cornice da sola", (percorso) => {
    const sorgente = read(percorso);
    expect(sorgente).not.toContain('min-h-screen bg-slate-50');
    // La larghezza la decide l'involucro: una pagina che si dichiara la
    // propria tornerebbe a essere piu' larga delle altre.
    expect(sorgente).not.toContain("mx-auto max-w-7xl");
  });

  it("l'involucro porta il menu di tutte le sezioni", () => {
    for (const sezione of ["/admin", "/admin/dealers", "/admin/demo-requests", "/admin/info-requests", "/admin/users", "/admin/dealer-approval"]) {
      expect(shell).toContain(`href: "${sezione}"`);
    }
  });

  it("la sezione aperta si riconosce, e la dashboard non risulta sempre attiva", () => {
    // "/admin" e' prefisso di tutte le altre: con un semplice startsWith
    // resterebbe evidenziata anche stando altrove.
    expect(shell).toContain('sezione.href === "/admin" ? pathname === "/admin" : pathname.startsWith(sezione.href)');
    expect(shell).toContain('aria-current={attiva ? "page" : undefined}');
  });

  it("una riga non e' larga quanto lo schermo", () => {
    expect(shell).toContain("max-w-6xl");
    expect(shell).not.toContain("max-w-7xl");
  });
});
