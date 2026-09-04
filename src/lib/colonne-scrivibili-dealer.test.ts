import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Su `dealers` il permesso di **scrittura** per chi ha una sessione non e'
 * sull'intera tabella: e' colonna per colonna, dal 20/07/2026. Senza, un
 * concessionario poteva scriversi da solo lo stato dell'abbonamento, il piano
 * o la scadenza della prova.
 *
 * Il difetto che questo test impedisce, visto dal titolare il 04/09/2026
 * premendo Salva nelle Impostazioni: "permission denied for table dealers", e
 * **non si salvava piu' niente** -- PostgreSQL rifiuta l'intera scrittura se
 * una sola colonna non e' permessa. La colonna `rental_url`, aggiunta il
 * 03/09, era finita nell'elenco di quelle leggibili dal pubblico ma non in
 * quello di quelle che il concessionario puo' scrivere.
 *
 * E' la terza volta che una colonna nuova entra in un elenco di permessi e
 * non nell'altro. Qui i due elenchi si guardano insieme.
 */
function ultimoElencoScrivibile(): { percorso: string; colonne: string[] } {
  const cartella = "supabase/migrations";
  const file = readdirSync(resolve(process.cwd(), cartella))
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  let ultima: { percorso: string; sql: string } | null = null;

  for (const nome of file) {
    const percorso = `${cartella}/${nome}`;
    const contenuto = leggi(percorso);
    if (contenuto.includes("revoke update on public.dealers from authenticated")) {
      ultima = { percorso, sql: contenuto };
    }
  }

  expect(ultima, "nessuna migration definisce le colonne scrivibili di dealers").not.toBeNull();
  const { percorso, sql } = ultima as { percorso: string; sql: string };

  // Si cerca **dopo** la revoca: piu' in alto la stessa frase compare dentro
  // il commento che spiega perche' l'elenco si riscrive per intero, e prendere
  // quella darebbe un elenco fatto di parole italiane.
  const dopoLaRevoca = sql.indexOf("revoke update on public.dealers from authenticated");
  const inizio = sql.indexOf("grant update (", dopoLaRevoca);
  const fine = sql.indexOf(") on public.dealers to authenticated", inizio);
  expect(inizio, "grant update non trovato").toBeGreaterThan(-1);
  expect(fine, "grant update senza chiusura").toBeGreaterThan(inizio);

  const colonne = sql
    .slice(sql.indexOf("(", inizio) + 1, fine)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  return { percorso, colonne };
}

/** Le colonne che la pagina Impostazioni scrive davvero quando si preme Salva. */
function colonneSalvateDalleImpostazioni(): string[] {
  const pagina = leggi("src/app/impostazioni/page.tsx");
  const inizio = pagina.indexOf("const payload = {");
  const fine = pagina.indexOf("};", inizio);
  expect(inizio, "payload delle Impostazioni non trovato").toBeGreaterThan(-1);

  return [...pagina.slice(inizio, fine).matchAll(/^\s{6}([a-z_]+):/gm)].map((riga) => riga[1]);
}

describe("le Impostazioni possono scrivere tutto quello che compilano", () => {
  const { percorso, colonne } = ultimoElencoScrivibile();
  const salvate = colonneSalvateDalleImpostazioni();

  it("il modulo scrive piu' di una colonna: se non fosse cosi' il confronto non proverebbe niente", () => {
    expect(salvate.length).toBeGreaterThan(10);
  });

  it("ogni colonna che il modulo scrive e' fra quelle permesse", () => {
    for (const colonna of salvate) {
      expect(colonne, `${colonna} non e' scrivibile: ${percorso} la lascia fuori`).toContain(colonna);
    }
  });

  /**
   * PostgreSQL rifiuta l'intera scrittura se una sola colonna non e' permessa:
   * non si perde un campo, si perde il salvataggio.
   *
   * L'esempio era `rental_url`, la colonna che il 04/09/2026 aveva bloccato
   * tutte le Impostazioni. Il campo della pagina noleggi e' stato tolto dal
   * modulo lo stesso giorno, insieme ai rimandi ai siti delle concessionarie:
   * il permesso nel database resta -- una colonna che nessuno scrive non fa
   * danni -- ma qui l'ancora torna a essere una colonna che il modulo scrive
   * davvero.
   */
  it("basta una colonna fuori elenco per far fallire tutto il salvataggio", () => {
    expect(salvate).toContain("website");
    expect(colonne).toContain("website");
  });

  // Il campo della pagina noleggi non c'e' piu' nel modulo: se tornasse senza
  // che nessuno lo abbia deciso, il controllo qui sopra lo prenderebbe
  // comunque -- ma vale la pena dirlo, perche' e' stato tolto di proposito.
  it("la pagina noleggi non si chiede piu' nelle Impostazioni", () => {
    const pagina = leggi("src/app/impostazioni/page.tsx");
    expect(pagina).not.toContain("rental_url");
    expect(pagina).not.toContain("Pagina noleggi");
  });
});

/**
 * L'elenco delle colonne scrivibili e' anche una protezione: quello che non
 * c'e' dentro, il concessionario non se lo puo' scrivere da solo.
 */
describe("quello che il concessionario non deve potersi scrivere", () => {
  const { colonne } = ultimoElencoScrivibile();

  const VIETATE: Record<string, string> = {
    subscription_status: "si darebbe da solo l'abbonamento pagato",
    subscription_plan: "si darebbe da solo il piano superiore",
    plan: "idem",
    account_type: "si toglierebbe da solo lo stato di prova",
    status: "si approverebbe da solo",
    demo_expires_at: "si allungherebbe la prova all'infinito",
    demo_status: "idem",
    user_id: "si attaccherebbe la concessionaria a un altro account",
    id: "non si cambia l'identita' di una riga",
  };

  for (const [colonna, perche] of Object.entries(VIETATE)) {
    it(`${colonna} resta fuori: ${perche}`, () => {
      expect(colonne).not.toContain(colonna);
    });
  }

  // Provato su un Postgres vero il 04/09/2026, con i permessi ricostruiti
  // dalle migration: con la correzione il salvataggio delle Impostazioni
  // riesce (UPDATE 1) e tutte e cinque le colonne di cui sopra continuano a
  // rispondere "permission denied for table dealers".
  it("l'elenco non e' un permesso sull'intera tabella travestito", () => {
    const sql = leggi("supabase/migrations/20260904120000_impostazioni_salvano_il_noleggio.sql");
    expect(sql).toContain("revoke update on public.dealers from authenticated");
    expect(sql).toMatch(/grant update \(/);
    expect(sql).not.toMatch(/grant update on public\.dealers to authenticated/);
  });
});
