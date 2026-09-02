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
    // rinunciare qualcuno al primo accesso. Le regole non sono piu' scritte
    // dentro la pagina: le legge dall'elenco condiviso, lo stesso che il
    // guscio del gestionale usa per la scadenza.
    expect(resetPage).toContain("REGOLE_PASSWORD");
    expect(resetPage).toContain("rule.verifica(password)");
    expect(resetPage).toContain("{rule.etichetta}");

    const regole = read("src/lib/password-rules.ts");
    for (const etichetta of ["Almeno 8 caratteri", "Una lettera maiuscola", "Una lettera minuscola", "Un numero"]) {
      expect(regole, `manca la regola "${etichetta}"`).toContain(etichetta);
    }
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

// L'indirizzo pubblico e' cambiato piu' volte (anteprima Vercel, poi
// keyauto.it). Un vecchio dominio lasciato come ripiego non rompe la build e
// non fallisce i test: manda semplicemente i concessionari su un sito morto,
// e lo si scopre solo quando qualcuno non riesce a entrare.
describe("no stale domain is baked into the code", () => {
  const FILES = [
    "src/app/api/admin/demo-requests/route.ts",
    "src/app/forgot-password/page.tsx",
  ];

  it.each(FILES)("%s falls back to the real public domain", (path) => {
    const source = read(path);

    expect(source).toContain('FALLBACK_PRODUCTION_APP_URL = "https://www.keyauto.it"');
    expect(source).not.toContain("dealer-platform-six.vercel.app");
  });

  it("prefers the configured environment variable over the fallback", () => {
    // Il ripiego serve solo se la variabile manca: non deve diventare la
    // fonte abituale dell'indirizzo.
    expect(read(FILES[0])).toMatch(/process\.env\.APP_BASE_URL[\s\S]{0,80}FALLBACK_PRODUCTION_APP_URL/);
  });
});
