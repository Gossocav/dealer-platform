import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const migration = leggi("supabase/migrations/20260903140000_pagina_noleggi_concessionaria.sql");
const riquadro = leggi("src/components/marketplace/collegamenti-concessionaria.tsx");
const pagina = leggi("src/app/(marketplace)/concessionarie/[slug]/page.tsx");
const impostazioni = leggi("src/app/impostazioni/page.tsx");

/**
 * Il pulsante "Le nostre offerte di noleggio", chiesto dal titolare il
 * 03/09/2026: molte concessionarie hanno un sito dedicato -- noleggio.
 * autogepy.it -- che dalla loro pagina su KeyAuto non era raggiungibile.
 *
 * Nel farlo si e' chiuso anche quello che era rimasto a meta': sito web e
 * social si raccolgono nelle Impostazioni dal 02/07/2026 e non comparivano da
 * nessuna parte.
 */
describe("i collegamenti sulla pagina della concessionaria", () => {
  it("il noleggio ha il suo pulsante, con le parole chieste", () => {
    expect(riquadro).toContain("Le nostre offerte di noleggio");
    expect(pagina).toContain("<CollegamentiConcessionaria");
  });

  // E' una cosa che si vende, non un recapito: chi guarda le auto e pensa
  // "forse invece la noleggio" deve vederlo senza cercarlo.
  it("il noleggio sta davanti agli altri", () => {
    expect(riquadro.indexOf("Le nostre offerte di noleggio")).toBeLessThan(riquadro.indexOf("formatWebsiteForDisplay(website)"));
  });

  it("compaiono anche sito web e i tre social", () => {
    for (const nome of ["Facebook", "Instagram", "LinkedIn"]) {
      expect(riquadro, `manca ${nome}`).toContain(nome);
    }
    expect(riquadro).toContain("resolveClickableWebsite(website)");
  });

  /**
   * Il difetto che questo test impedisce: un pulsante che porta su una pagina
   * morta. I campi sono a testo libero dal 02/07/2026, quindi nel database
   * puo' esserci qualsiasi cosa, e un pulsante rotto e' peggio di un pulsante
   * assente.
   */
  it("ogni indirizzo si ricontrolla prima di diventare un pulsante", () => {
    const controlli = (riquadro.match(/resolveClickableWebsite\(/g) ?? []).length;
    expect(controlli).toBeGreaterThanOrEqual(5);
  });

  // Una sezione vuota sotto un'intestazione sembra un guasto.
  it("senza nemmeno un indirizzo il riquadro non si disegna", () => {
    expect(riquadro).toContain("if (!noleggio && !sito && social.length === 0) return null;");
  });

  // Stessa convenzione degli altri collegamenti esterni del marketplace.
  it("i collegamenti si aprono a parte e non passano forza ai motori", () => {
    const aperture = (riquadro.match(/rel="noopener noreferrer nofollow"/g) ?? []).length;
    expect(aperture).toBeGreaterThanOrEqual(3);
  });
});

describe("dove il concessionario scrive l'indirizzo", () => {
  it("c'e' una casella nelle Impostazioni, accanto al sito", () => {
    expect(impostazioni).toContain("Pagina noleggi");
    expect(impostazioni).toContain("rental_url: noleggio.url");
  });

  // Un indirizzo che non e' un indirizzo si ferma prima di essere salvato:
  // sulla pagina pubblica lo vedrebbero i clienti prima del concessionario.
  it("l'indirizzo si controlla prima di salvarlo", () => {
    expect(impostazioni).toContain("normalizeWebsiteUrl(form.rental)");
    expect(impostazioni).toContain("if (noleggio.error)");
  });
});

/**
 * **Questi leggono il testo del file SQL.** La prova vera e' stata fatta su un
 * Postgres 15 in Docker, ricostruendo i permessi com'erano il 31/08: il
 * pubblico legge la pagina noleggi, continua a leggere nome, sito e social, e
 * continua a non vedere il piano e il referente.
 */
describe("il permesso pubblico", () => {
  /**
   * Il difetto che questo test impedisce, e che sarebbe stato silenzioso: su
   * `dealers` il pubblico ha i permessi colonna per colonna, e `grant select`
   * non sostituisce quello di prima ma lo affianca. Una colonna aggiunta senza
   * rifare l'elenco resterebbe invisibile al marketplace: il concessionario
   * scrive l'indirizzo, lo vede salvato, e il pulsante non compare a nessuno.
   */
  it("l'elenco si toglie prima di rifarlo, e comprende la pagina noleggi", () => {
    // L'istruzione, non la frase: "grant select (...)" compare anche nel
    // commento che spiega perche' l'elenco va rifatto per intero.
    const istruzione = migration.indexOf("grant select (\n  id,");
    expect(migration.indexOf("revoke select on public.dealers from anon")).toBeLessThan(istruzione);
    const elenco = migration.slice(istruzione, migration.indexOf(") on public.dealers to anon"));
    expect(elenco).toContain("rental_url");
  });

  it("non perde nessuna colonna di quelle che erano gia' pubbliche", () => {
    const nuovo = migration.slice(migration.indexOf("grant select (\n  id,"), migration.indexOf(") on public.dealers to anon"));
    const vecchia = leggi("supabase/migrations/20260831000000_colonne_riservate_non_pubbliche.sql");
    const prima = vecchia.slice(vecchia.lastIndexOf("grant select ("), vecchia.indexOf(") on public.dealers to anon"));

    const colonne = (testo: string) =>
      testo
        .split("\n")
        .map((riga) => riga.trim().replace(/,$/, ""))
        .filter((riga) => /^[a-z_]+$/.test(riga));

    for (const colonna of colonne(prima)) {
      expect(colonne(nuovo), `${colonna} non e' piu' pubblica`).toContain(colonna);
    }
  });

  it("e le colonne riservate restano fuori", () => {
    const elenco = migration.slice(migration.indexOf("grant select (\n  id,"), migration.indexOf(") on public.dealers to anon"));
    const colonne = elenco
      .split("\n")
      .map((riga) => riga.trim().replace(/,$/, ""))
      .filter((riga) => /^[a-z_]+$/.test(riga));

    for (const riservata of ["subscription_plan", "contact_person", "fiscal_code", "user_id", "account_type"]) {
      expect(colonne, `${riservata} non deve essere pubblica`).not.toContain(riservata);
    }
  });
});
