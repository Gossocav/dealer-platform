import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const resetPage = read("src/app/reset-password/page.tsx");
const loginPage = read("src/app/login/login-client.tsx");
const activation = read("src/app/api/admin/demo-requests/route.ts");

describe("create-password page", () => {
  it("is where the activation link lands", () => {
    expect(activation).toMatch(/redirectTo: `\$\{resolveAppBaseUrl\(\)\}\/reset-password`/);
  });

  it("asks the dealer to create a password, not to reset one", () => {
    expect(resetPage).toContain("Crea la tua password");
    expect(resetPage).toContain("Primo accesso");
  });

  it("wears the same layout as the login page", () => {
    // Chi ci arriva sta entrando per la prima volta e deve riconoscere il
    // sito: stesso pannello scuro, stesso marchio, stessa impaginazione.
    for (const marker of ["KEYAUTO", "rounded-[36px]", "bg-slate-950", "lg:grid-cols-[1.02fr_0.98fr]"]) {
      expect(resetPage, `manca ${marker}`).toContain(marker);
      expect(loginPage, `${marker} non e' piu' nel login`).toContain(marker);
    }
  });

  it("shows the password rules while typing", () => {
    // Scoprirli da un errore dopo l'invio e' il modo piu' rapido per far
    // rinunciare qualcuno al primo accesso.
    expect(resetPage).toMatch(/Almeno 8 caratteri/);
    expect(resetPage).toMatch(/Una lettera maiuscola/);
    expect(resetPage).toMatch(/Una lettera minuscola/);
    expect(resetPage).toMatch(/Un numero/);
  });

  it("explains an expired link instead of failing on submit", () => {
    expect(resetPage).toMatch(/linkState === "missing"/);
    expect(resetPage).toMatch(/non e piu valido/);
    expect(resetPage).toContain("/forgot-password");
  });

  it("sends the dealer to the login once the password is set", () => {
    expect(resetPage).toMatch(/done \?/);
    expect(resetPage).toMatch(/Vai all&apos;accesso/);
  });
});

// Il concessionario che entra normalmente deve trovare la pagina di sempre:
// la creazione password riguarda solo chi arriva dal link di attivazione.
describe("login page stays untouched", () => {
  it("still asks for email and password", () => {
    expect(loginPage).toContain('htmlFor="email"');
    expect(loginPage).toContain('htmlFor="password"');
    expect(loginPage).toContain("signInWithPassword");
  });

  it("still shows Accedi, not the create-password wording", () => {
    expect(loginPage).toMatch(/>Accedi</);
    expect(loginPage).not.toContain("Crea la tua password");
    expect(loginPage).not.toContain("Primo accesso");
  });

  it("keeps remember-me and password recovery", () => {
    expect(loginPage).toContain("Ricordami");
    expect(loginPage).toContain("/forgot-password");
  });
});
