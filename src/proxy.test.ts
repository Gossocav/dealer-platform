import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("proxy security headers", () => {
  const response = proxy(new NextRequest("https://local/dashboard"));

  it("sets a Content-Security-Policy with frame-ancestors 'none'", () => {
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets the standard hardening headers", () => {
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });
});

/**
 * `unsafe-eval` non deve tornare in produzione.
 *
 * **Quale difetto impedisce.** Trovato il 06/09/2026 in una verifica di
 * sicurezza: la Content-Security-Policy servita da www.keyauto.it concedeva
 * `'unsafe-eval'` a chiunque, cioe' permetteva al browser di eseguire codice
 * costruito al volo da una stringa. E' il permesso che trasforma un difetto
 * qualsiasi in esecuzione di codice.
 *
 * Non serviva: nei 75 file compilati di una build di produzione, zero
 * contengono `eval(` o `new Function(`. In sviluppo invece serve, perche'
 * Turbopack ricarica i moduli a caldo valutandoli da stringa.
 *
 * Una riga di regole e' una stringa sola, lunga, che si modifica di rado e
 * quasi sempre per aggiungere un permesso a qualcos'altro. Il giorno che
 * qualcuno ci reincolla `'unsafe-eval'` -- copiandola da una guida, o per
 * far funzionare una libreria in fretta -- nessuno se ne accorgerebbe
 * guardando il diff. Questo test se ne accorge.
 */
describe("la regola sugli script non regala 'unsafe-eval' ai visitatori", () => {
  const leggiCsp = async (ambiente: string) => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", ambiente);
    const modulo = await import("./proxy");
    const csp = modulo.proxy(new NextRequest("https://local/")).headers.get("Content-Security-Policy");
    vi.unstubAllEnvs();
    vi.resetModules();
    return csp ?? "";
  };

  it("in produzione non c'e'", async () => {
    const csp = await leggiCsp("production");

    expect(csp, "la produzione concede 'unsafe-eval'").not.toContain("'unsafe-eval'");
    // La prova sarebbe superata anche da una riga vuota o rotta: questa
    // verifica che la regola ci sia ancora e riguardi davvero gli script.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("in sviluppo c'e', altrimenti si rompe il ricaricamento automatico", async () => {
    expect(await leggiCsp("development")).toContain("'unsafe-eval'");
  });
});
