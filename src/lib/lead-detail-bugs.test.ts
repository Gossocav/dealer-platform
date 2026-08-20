import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const pagina = read("src/app/lead/[id]/page.tsx");
const migration = read("supabase/migrations/20260804000000_leads_add_notes.sql");

// Prima erano lo stesso caso: se la richiesta falliva -- rete assente,
// database giu' -- la pagina annunciava "Lead non trovato", cioe' diceva al
// concessionario che un suo contatto non esisteva.
describe("un guasto non viene scambiato per un lead inesistente", () => {
  it("l'errore di lettura non viene piu' ignorato", () => {
    expect(pagina).not.toContain("if (!error && data)");
    expect(pagina).toContain("setLoadError");
  });

  it("le due schermate dicono cose diverse", () => {
    expect(pagina).toContain("Non siamo riusciti a caricare il lead");
    expect(pagina).toContain("Lead non trovato");
  });

  it("da un guasto si puo' riprovare, da un lead inesistente no", () => {
    // "if (!lead) {" e non "if (!lead)": quest'ultimo compare prima, dentro
    // il salvataggio della nota, e il ritaglio verrebbe vuoto.
    const ramoErrore = pagina.slice(pagina.indexOf("if (loadError)"), pagina.indexOf("if (!lead) {"));
    expect(ramoErrore).toContain("Riprova");
  });
});

// Il concessionario scriveva "richiamare giovedi'", cambiava pagina, e la nota
// spariva: il campo non ha mai salvato niente.
describe("le note interne si salvano davvero", () => {
  it("la colonna esiste", () => {
    expect(migration).toContain("alter table public.leads add column if not exists notes text");
  });

  it("la pagina la legge e la scrive", () => {
    expect(pagina).toContain("notes, created_at");
    expect(pagina).toContain('.update({ notes: note.trim() || null })');
  });

  it("non promette piu' un salvataggio futuro", () => {
    expect(pagina).not.toContain("nel prossimo aggiornamento");
  });

  it("il comando di salvataggio esiste e non si preme a vuoto", () => {
    expect(pagina).toContain("Salva nota");
    // Disabilitato mentre salva e quando non c'e' niente di nuovo da salvare.
    expect(pagina).toContain("disabled={savingNote || note === (lead.notes ?? \"\")}");
  });

  // La colonna arriva con una modifica al database che potrebbe non essere
  // ancora stata applicata in produzione.
  it("se la colonna non c'e' ancora, lo dice in modo comprensibile", () => {
    expect(pagina).toContain("manca un aggiornamento del database");
    expect(pagina).toMatch(/column .*notes.* does not exist/);
  });
});
