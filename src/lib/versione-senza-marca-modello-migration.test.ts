import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822020000_versione_senza_marca_modello.sql"),
  "utf8"
);

// I commenti spiegano anche cio' che la migration ha deciso di NON fare, e
// nominano quindi parole che nel codice non devono comparire.
const soloCodice = migration
  .split("\n")
  .map((riga) => riga.replace(/--.*$/, ""))
  .join("\n");

// L'importazione da sito scriveva il titolo intero dentro la Versione, e i
// veicoli entrati prima della correzione quel doppione ce l'hanno gia' salvato.
// La migration lo toglie una volta sola.
//
// Questi controlli leggono il testo della migration: dicono che le protezioni
// sono scritte, non che il database si comporti cosi'. La prova vera e' stata
// fatta eseguendola su un Postgres 16 con dodici veicoli di esempio -- doppione
// esatto, prefisso, solo modello, versioni gia' pulite, maiuscole diverse,
// modelli con '%' e '_' dentro -- verificando riga per riga il risultato e
// rieseguendola per confermare che la seconda volta non tocca niente. Va
// rifatta cosi' se questa regola cambia.
describe("la versione ripulita dal doppione", () => {
  it("aggiorna solo le righe che cambierebbero davvero", () => {
    expect(migration).toContain("v.version is distinct from p.versione_nuova");
  });

  it("non tocca marca e modello", () => {
    expect(soloCodice).not.toMatch(/set\s+(brand|model)\s*=/);
  });

  // Marca e modello sono testo scritto da altri: dentro un "like" un '%' o un
  // '_' smetterebbero di essere caratteri e diventerebbero jolly, tagliando
  // versioni che non c'entrano niente.
  it("confronta il prefisso senza passare da like", () => {
    expect(soloCodice).toContain("left(lower(btrim(valore))");
    expect(soloCodice).not.toMatch(/\blike\b/i);
  });

  it("svuota il campo invece di lasciare una stringa vuota", () => {
    expect(migration).toContain("nullif(");
  });

  it("non lascia in giro la funzione d'appoggio", () => {
    expect(migration).toContain("drop function if exists public.togli_ripetizione_iniziale");
  });

  it("sta tutta dentro una transazione", () => {
    expect(migration.trimStart().startsWith("begin;") || migration.includes("\nbegin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });
});
