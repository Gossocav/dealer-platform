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
    expect(pagina).toContain("<PulsanteNoleggio");
  });

  /**
   * Il riquadro "Dove trovarci" l'ha fatto togliere il titolare il 04/09/2026:
   * metteva in una sezione a se' cose che non c'entrano fra loro. Il sito e'
   * diventato una riga sotto il nome della concessionaria.
   *
   * Il difetto che questo test impedisce: rimetterlo senza accorgersene, o
   * lasciare il sito senza un posto dove stare. Un dato che il concessionario
   * compila nelle Impostazioni e che poi non compare da nessuna parte e' un
   * campo che si smette di riempire -- e' proprio quello che era successo a
   * sito e social fra il 02/07 e il 03/09/2026.
   */
  it('il riquadro "Dove trovarci" non c\'e\' piu\', e il sito sta in cima', () => {
    // Il nome compare ancora nei commenti, che raccontano perche' e' stato
    // tolto: qui si cerca il testo disegnato, cioe' dentro un tag.
    expect(riquadro).not.toMatch(/>Dove trovarci</);
    expect(pagina).not.toMatch(/>Dove trovarci</);
    // Dal 04/09/2026 il sito e' un pulsante gemello del noleggio, non piu' una
    // riga di testo sotto il nome.
    expect(pagina).toContain("<BottoneSitoConcessionaria website=");

    const nome = pagina.indexOf("{dealerName}");
    const sito = pagina.indexOf("<BottoneSitoConcessionaria");
    const auto = pagina.indexOf("<DealerVehicleSearch");
    expect(nome).toBeLessThan(sito);
    expect(sito).toBeLessThan(auto);
  });

  /**
   * I due pulsanti in cima devono essere identici: il titolare li ha voluti
   * cosi' il 04/09/2026. Lo stile e' scritto una volta sola in una costante,
   * perche' due classi copiate divergono al primo ritocco -- e due gemelli
   * che smettono di somigliarsi si notano subito.
   */
  it("il noleggio e il sito sono due pulsanti identici", () => {
    expect(riquadro).toContain("const PULSANTE_IN_CIMA");
    expect(riquadro).toContain("bg-gradient-to-br from-white via-blue-100 to-blue-500");

    // Lo stile compare una volta sola: e' la definizione condivisa.
    const definizioni = (riquadro.match(/from-white via-blue-100 to-blue-500/g) ?? []).length;
    expect(definizioni, "lo stile e' stato copiato invece che condiviso").toBe(1);

    // E i due lo usano entrambi.
    const usi = (riquadro.match(/className=\{PULSANTE_IN_CIMA\}/g) ?? []).length;
    expect(usi).toBe(2);

    // Nessun altro pulsante pieno sulla pagina: erano tre e si facevano
    // concorrenza, e "Catalogo auto" e' tornato un collegamento in fondo.
    const pieniInPagina = (pagina.match(/from-white via-blue-100 to-blue-500/g) ?? []).length;
    expect(pieniInPagina).toBe(0);
  });

  it("il sito dice cosa succede premendolo, non il proprio indirizzo", () => {
    // Un indirizzo lungo dentro un pulsante o lo allarga o va troncato, e in
    // tutti e due i casi i due gemelli smettono di somigliarsi.
    expect(riquadro).toContain("Visita il nostro sito");
    expect(riquadro).not.toContain("formatWebsiteForDisplay");
  });

  /**
   * Il difetto che questo test impedisce: un collegamento che porta su una
   * pagina morta. I campi sono a testo libero dal 02/07/2026, quindi nel
   * database puo' esserci qualsiasi cosa, e un pulsante rotto e' peggio di un
   * pulsante assente.
   */
  it("ogni indirizzo si ricontrolla prima di diventare un collegamento", () => {
    expect(riquadro).toContain("resolveClickableWebsite(rentalUrl)");
    expect(riquadro).toContain("resolveClickableWebsite(website)");

    // Senza indirizzo valido non si disegna niente: un pulsante che non porta
    // da nessuna parte, o una riga vuota sotto il nome, sembrano un guasto.
    const rese = (riquadro.match(/if \(!\w+\) return null;/g) ?? []).length;
    expect(rese).toBe(2);
  });

  // Stessa convenzione degli altri collegamenti esterni del marketplace.
  it("i collegamenti si aprono a parte e non passano forza ai motori", () => {
    const aperture = (riquadro.match(/rel="noopener noreferrer nofollow"/g) ?? []).length;
    expect(aperture).toBe(2);
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
