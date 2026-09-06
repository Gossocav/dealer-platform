import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il controllo dell'isolamento deve guardare **tutte** le tabelle.
 *
 * **Quale difetto impedisce.** `scripts/verifica-isolamento.mjs` interroga la
 * produzione con la sola chiave pubblica del sito e dice se qualcosa e'
 * leggibile senza login. E' il controllo su cui il progetto si fida da dopo
 * l'incidente del 22/08/2026, quando con quella chiave si leggevano nome,
 * email e telefono dei clienti.
 *
 * Il 06/09/2026 e' emerso che guardava **23 tabelle su 33**. Le dieci
 * scoperte comprendevano `vehicle_appraisals`, `vehicle_documents`,
 * `vehicle_economics` e `vehicle_sales`: perizie, documenti di persone, conto
 * economico e vendite. Erano protette -- provate a mano quel giorno -- ma
 * nessuno lo sapeva, e nessuno se ne sarebbe accorto se avessero smesso di
 * esserlo.
 *
 * Un controllo che guarda un elenco scritto a mano invecchia in silenzio: la
 * tabella nuova la aggiunge una migration, l'elenco no. Da qui in avanti una
 * tabella nuova fa fallire questo test finche' qualcuno non dichiara **a
 * quale dei due mondi appartiene** -- riservata, oppure parte della vetrina
 * pubblica con il suo controllo.
 *
 * Si legge il testo dei file invece di importare lo script perche' quello,
 * importato, partirebbe: ha codice al livello piu' esterno e chiude il
 * processo con un codice di uscita.
 */

const script = readFileSync(resolve(process.cwd(), "scripts/verifica-isolamento.mjs"), "utf8");
const cartellaMigrazioni = resolve(process.cwd(), "supabase/migrations");

/** Le tabelle che le migration creano davvero. */
const tabelleCreate = new Set<string>();
for (const nome of readdirSync(cartellaMigrazioni).filter((n) => n.endsWith(".sql"))) {
  const sql = readFileSync(resolve(cartellaMigrazioni, nome), "utf8");
  for (const trovato of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi)) {
    tabelleCreate.add(trovato[1].toLowerCase());
  }
}

/** I nomi che lo script nomina, in qualunque dei suoi elenchi. */
function nominateNelloScript() {
  const nomi = new Set<string>();
  const riservate = script.slice(script.indexOf("const RISERVATE = ["), script.indexOf("];", script.indexOf("const RISERVATE = [")));
  for (const trovato of riservate.matchAll(/"([a-z_]+)"/g)) nomi.add(trovato[1]);

  const vetrina = script.slice(script.indexOf("const VETRINA = {"), script.indexOf("};", script.indexOf("const VETRINA = {")));
  for (const trovato of vetrina.matchAll(/^\s{2}([a-z_]+):/gm)) nomi.add(trovato[1]);

  const immagini = /const IMMAGINI = "([a-z_]+)"/.exec(script);
  if (immagini) nomi.add(immagini[1]);

  return nomi;
}

describe("il controllo dell'isolamento non lascia tabelle fuori", () => {
  it("le migration e lo script si leggono davvero", () => {
    // Se una delle due letture tornasse vuota, la prova sotto passerebbe
    // sempre senza controllare niente.
    expect(tabelleCreate.size).toBeGreaterThan(25);
    expect(nominateNelloScript().size).toBeGreaterThan(25);
  });

  it("ogni tabella creata da una migration e' nominata dallo script", () => {
    const nominate = nominateNelloScript();
    const dimenticate = [...tabelleCreate].filter((t) => !nominate.has(t)).sort();

    expect(
      dimenticate,
      dimenticate.length === 0
        ? ""
        : `Queste tabelle esistono ma il controllo dell'isolamento non le guarda: ${dimenticate.join(", ")}. ` +
          "Vanno messe fra le RISERVATE (nessuno le deve leggere senza login) oppure fra quelle di vetrina, " +
          "con scritto cosa di loro deve restare fuori. Non basta aggiungere il nome: va deciso a cosa serve."
    ).toEqual([]);
  });

  /**
   * Le tabelle che esistono in produzione ma che nessuna migration crea.
   *
   * **L'elenco e' vuoto, ed e' una buona notizia.** Il 06/09/2026 conteneva
   * sette nomi -- `import_runs`, `import_items`, `import_errors`,
   * `import_sources`, `import_profiles`, `import_dedup_keys`,
   * `lead_activities` -- create a mano in produzione senza lasciare il file
   * corrispondente. La migration `20260906180000` le ha scritte, leggendole
   * dalla produzione e riconfrontandole riga per riga.
   *
   * Se un giorno tornasse a riempirsi, vuol dire che qualcuno ha creato una
   * tabella a mano invece di scrivere una migration: il controllo qui sotto
   * lo dira'.
   */
  const SENZA_MIGRATION: string[] = [];

  it("lo script non nomina tabelle che non esistono da nessuna parte", () => {
    const fantasmi = [...nominateNelloScript()]
      .filter((t) => !tabelleCreate.has(t) && !SENZA_MIGRATION.includes(t))
      .sort();

    expect(
      fantasmi,
      `lo script controlla tabelle che nessuna migration crea: ${fantasmi.join(", ")}. ` +
        "Se esistono davvero in produzione vanno aggiunte a SENZA_MIGRATION con la prova, " +
        "altrimenti il controllo le dara' per protette senza guardare niente."
    ).toEqual([]);
  });
});
