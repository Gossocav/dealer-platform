import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const PAGES = [
  "src/app/(marketplace)/registrazione/page.tsx",
  "src/app/(marketplace)/registrazione/base/page.tsx",
  "src/app/(marketplace)/registrazione/pro/page.tsx",
  "src/app/(marketplace)/registrazione/elite/page.tsx",
  "src/app/(marketplace)/registrazione/dealer-info-request-form.tsx",
];

// La registrazione stava fuori dal gruppo (marketplace), quindi non riceveva
// intestazione, menu e piede di pagina, e aveva un tema chiaro tutto suo: chi
// arrivava dal sito nuovo trovava un'altra grafica.
describe("registrazione dentro il marketplace", () => {
  it("sta nel gruppo che porta intestazione e piede di pagina", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/(marketplace)/registrazione/page.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/registrazione"))).toBe(false);
  });

  it("non lascia in giro il tema chiaro", () => {
    // Un solo riquadro dimenticato su fondo bianco si vede subito.
    for (const page of PAGES) {
      const source = read(page);
      for (const stale of ["from-slate-100", "bg-white p-", "bg-slate-50 p-", "text-slate-900", "border-slate-200"]) {
        expect(source, `${page} usa ancora "${stale}"`).not.toContain(stale);
      }
    }
  });

  it("scrive il colore del testo dei campi in linea", () => {
    // globals.css ha una regola NON incapsulata `input, select, textarea {
    // color: rgb(15 23 42) }` che batte le utility di Tailwind: con la sola
    // classe il testo digitato resterebbe nero su fondo scuro.
    const form = read("src/app/(marketplace)/registrazione/dealer-info-request-form.tsx");
    expect(form).toContain("FIELD_TEXT_STYLE");
    expect(form).toMatch(/const FIELD_TEXT_STYLE = \{ color: "#f8fafc" \}/);
    // Ogni campo scrivibile deve averlo: input di testo e area messaggio.
    const applied = form.match(/style=\{FIELD_TEXT_STYLE\}/g) ?? [];
    expect(applied.length).toBeGreaterThanOrEqual(2);
  });
});

// Il senso dell'intervento e' cambiare solo l'aspetto: se qui sparisse un
// campo o un collegamento, la registrazione smetterebbe di funzionare senza
// che nessun altro controllo se ne accorga.
describe("la registrazione fa ancora le stesse cose", () => {
  const plans = read("src/app/(marketplace)/registrazione/page.tsx");
  const form = read("src/app/(marketplace)/registrazione/dealer-info-request-form.tsx");

  it("propone gli stessi quattro percorsi", () => {
    for (const href of ["/registrazione/base", "/registrazione/pro", "/registrazione/elite", "/demo"]) {
      expect(plans).toContain(`href="${href}"`);
    }
  });

  it("ogni piano manda alla demo con il piano di interesse", () => {
    for (const plan of ["base", "pro", "elite"]) {
      expect(read(`src/app/(marketplace)/registrazione/${plan}/page.tsx`)).toContain(`href="/demo?piano=${plan}"`);
    }
  });

  it("il modulo informazioni conserva campi, trappola anti-bot e invio", () => {
    for (const field of ["companyName", "contactName", "email", "phone", "message"]) {
      expect(form, `manca il campo ${field}`).toContain(`handleChange("${field}")`);
    }
    expect(form).toContain("websiteTrap");
    expect(form).toContain("Invia richiesta");
  });
});
