import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_ROUTES, isAccountRoute } from "@/lib/account-routes";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const serverRoute = read("src/app/api/account/resolve-route/route.ts");
const loginClient = read("src/app/login/login-client.tsx");

// Il server rispondeva "/account/demo-scaduta", il client non riconosceva
// quella destinazione, la scartava come risposta non valida e mostrava
// "Impossibile verificare lo stato account". Chi aveva la demo scaduta non
// riusciva piu' a entrare.
describe("chi ha la demo scaduta riesce a entrare", () => {
  it("la destinazione della demo scaduta e' riconosciuta", () => {
    expect(isAccountRoute("/account/demo-scaduta")).toBe(true);
  });

  it("il server puo' davvero rispondere quella destinazione", () => {
    expect(serverRoute).toContain('route: "/account/demo-scaduta"');
  });
});

// La causa non era la destinazione mancante: era che l'elenco esisteva in due
// copie, e una e' rimasta indietro.
describe("l'elenco delle destinazioni esiste in un posto solo", () => {
  it("ogni destinazione che il server puo' restituire e' nell'elenco", () => {
    const dalServer = Array.from(serverRoute.matchAll(/route: "(\/[a-z/-]+)"/g)).map((m) => m[1]);

    expect(dalServer.length).toBeGreaterThan(0);
    for (const destinazione of new Set(dalServer)) {
      expect(isAccountRoute(destinazione), `il client rifiuterebbe ${destinazione}`).toBe(true);
    }
  });

  it("il client non tiene piu' un elenco suo", () => {
    expect(loginClient).toContain('from "@/lib/account-routes"');
    expect(loginClient).not.toContain('value === "/dashboard"');
  });

  it("qualcosa che non e' una destinazione viene rifiutato", () => {
    for (const finta of ["/veicoli", "/", "", null, undefined, 42, "/account/inventata"]) {
      expect(isAccountRoute(finta), String(finta)).toBe(false);
    }
  });

  it("l'elenco copre gli stati che un account puo' avere", () => {
    expect(ACCOUNT_ROUTES).toContain("/dashboard");
    expect(ACCOUNT_ROUTES).toContain("/admin");
    expect(ACCOUNT_ROUTES).toContain("/account/sospeso");
    expect(ACCOUNT_ROUTES).toContain("/account/in-attesa");
    expect(ACCOUNT_ROUTES).toContain("/account/demo-scaduta");
  });
});
