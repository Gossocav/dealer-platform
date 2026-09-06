import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La CI deve continuare a guardare le dipendenze.
 *
 * **Quale difetto impedisce.** Il 06/09/2026 il progetto aveva sette avvisi
 * di sicurezza aperti sulle dipendenze, quattro di gravita' alta, rimasti li'
 * per settimane. Nessuno era sfruttabile da fuori -- stavano tutti nella
 * catena di compilazione -- ma il punto e' che **nessuno se n'era accorto**:
 * la CI eseguiva tipi, lint, test e build, e nient'altro.
 *
 * Sistemati in un pomeriggio, si torna a zero. Poi escono avvisi nuovi, e
 * senza qualcosa che li guardi si torna a sette senza che nessuno lo sappia.
 *
 * Il difetto che questo test impedisce non e' una vulnerabilita': e' che il
 * passaggio venga tolto dalla CI perche' un giorno da' fastidio. Il momento
 * in cui da' fastidio e' esattamente quello in cui serve.
 */

const ci = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

describe("la CI controlla le dipendenze", () => {
  it("blocca se una dipendenza di produzione ha una vulnerabilita' alta", () => {
    expect(ci, "il controllo bloccante sulle dipendenze e' sparito dalla CI").toContain(
      "npm audit --omit=dev --audit-level=high"
    );
  });

  it("il controllo bloccante non e' stato reso innocuo", () => {
    // `continue-on-error: true` sul passaggio sbagliato lo trasformerebbe in
    // un avviso che non ferma niente: sembrerebbe esserci e non servirebbe.
    const passaggio = ci.slice(
      ci.indexOf("npm audit --omit=dev") - 400,
      ci.indexOf("npm audit --omit=dev")
    );

    expect(passaggio, "il controllo bloccante e' stato marcato continue-on-error").not.toContain("continue-on-error");
  });

  it("guarda anche il resto dell'albero, senza bloccare", () => {
    // Un avviso su un attrezzo di compilazione senza correzione disponibile
    // non deve fermare ogni modifica: si vede nel registro e si sistema
    // quando la correzione esce.
    expect(ci).toContain("continue-on-error: true");
  });

  it("gli altri quattro controlli sono ancora tutti li'", () => {
    // Il difetto di aggiungere un passaggio e perderne un altro riscrivendo
    // il file.
    for (const comando of ["npx tsc --noEmit", "npm run lint", "npm run test", "npm run build"]) {
      expect(ci, `manca ${comando}`).toContain(comando);
    }
  });
});
