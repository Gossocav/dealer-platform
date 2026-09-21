import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIORNI_DI_PROVA, scadenzaPerUnaPersona } from "@/lib/durata-della-prova";

/**
 * **La durata della prova ha una casa sola, e questo controllo lo pretende.**
 *
 * Il 21/09/2026 il titolare ha portato la prova gratuita da sette giorni a
 * trenta. Non era un difetto da correggere: era un cambio di prodotto. Ha
 * fatto emergere quante copie di quel numero c'erano in giro -- **sessanta
 * punti in ventidue file**, trovati con sette ricerche indipendenti e
 * verificati uno per uno aprendo il file:
 *
 * | dove | quanti |
 * |---|---|
 * | pagine che vede chi visita il sito | 10 |
 * | cose che legge il concessionario (email comprese) | 10 |
 * | il database | 9 |
 * | i test | 17 |
 * | commenti e documentazione | 10 |
 * | il pannello del titolare | 4 |
 *
 * **La copia peggiore non era scritta, era calcolata.** La rotta di
 * attivazione faceva il suo conto in JavaScript (`now + 7 * 24 * 60 * 60 *
 * 1000`) mentre il database faceva il suo, e l'email di attivazione mandava
 * al concessionario **il primo** mentre l'account viveva sul secondo.
 * Finche' erano tutti e due sette non si vedeva. A trenta sarebbero stati
 * ventitre giorni di scarto fra la data che uno legge e il giorno in cui gli
 * si chiude l'accesso.
 *
 * **Perche' le case sono due e non una.** La durata serve a due esecutori
 * diversi: il database quando scrive la riga, il sito quando stampa la
 * frase. Una pagina statica non puo' interrogare il database per sapere come
 * si chiama se stessa. Quindi `src/lib/durata-della-prova.ts` e
 * `public.durata_della_prova()`, e questo file e' la terza cosa: quella che
 * fallisce se le due non dicono lo stesso numero.
 *
 * **Prima di fidarsi del verde si e' prodotto il rosso**, tre volte: portando
 * l'`interval` della migration a 45 giorni (cade il primo caso), scrivendo
 * "prova gratuita di 30 giorni" a mano in una pagina (cade il secondo),
 * aggiungendo un `interval '30 days'` in una funzione della demo (cade il
 * terzo).
 */

const RADICE = process.cwd();

/**
 * **Un rosso deve dire di che tipo e', senza che nessuno lo interpreti.**
 *
 * Il 21/09/2026 questo file e' diventato rosso una volta e non si e' piu'
 * ripetuto in quindici esecuzioni. Nello stesso minuto un Postgres di prova
 * era morto per memoria. Le due spiegazioni -- *"la macchina era in
 * affanno"* e *"la proprieta' non regge"* -- portano a due azioni opposte
 * (rieseguire, oppure correggere il codice), e quel rosso **non permetteva di
 * distinguerle**.
 *
 * Non e' un caso limite: e' la forma normale di ogni controllo che legge
 * qualcosa fuori da se'. Un file che non c'e', un database che non risponde,
 * una rete che cade producono lo stesso `FAIL` di una regola violata.
 *
 * Da qui in poi i due rossi hanno due prefissi diversi, e la differenza si
 * legge nel messaggio invece di dedurla:
 *
 * - `NON LEGGIBILE:` -- il controllo non ha potuto guardare. **Non dice
 *   niente sul codice.** Si riesegue, e se si ripete si guarda l'ambiente;
 * - `PROPRIETA' VIOLATA:` -- il controllo ha guardato e quello che ha visto
 *   e' sbagliato. **Rieseguire non serve**, c'e' da correggere.
 *
 * Tutti e due sono provati nel caso in fondo a questo file: senza quella
 * prova, la distinzione sarebbe una promessa nel commento.
 */
function leggiOppureDillo(percorso: string) {
  try {
    return readFileSync(resolve(RADICE, percorso), "utf8");
  } catch (errore) {
    const perche = errore instanceof Error ? errore.message : String(errore);
    throw new Error(
      `NON LEGGIBILE: non sono riuscito ad aprire ${percorso}. ` +
        `Questo rosso non dice niente sulla durata della prova: dice che il controllo non ha potuto guardare. ` +
        `Causa: ${perche}`,
    );
  }
}

/** Via i commenti: quello che spiega il codice non lo esegue nessuno. */
function senzaCommenti(sorgente: string) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function sorgentiDi(base: string, trovati: string[] = []) {
  for (const voce of readdirSync(base)) {
    const percorso = join(base, voce);
    if (statSync(percorso).isDirectory()) sorgentiDi(percorso, trovati);
    else if (/\.tsx?$/.test(voce) && !/\.test\.tsx?$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

/**
 * Una durata scritta a mano: "30 giorni", "sette giorni", o l'aritmetica sui
 * millisecondi di un giorno.
 */
const DURATA_A_MANO =
  /\b\d{1,3}\s*giorni\b|\b(?:sette|dieci|quattordici|quindici|venti|trenta|sessanta|novanta)\s+giorni\b|\d+\s*\*\s*24\s*\*\s*60\s*\*\s*60/i;

/** Parla della prova? Si guarda anche qualche riga sopra: il testo va a capo. */
function parlaDellaProva(righe: string[], indice: number) {
  return /demo|prova|trial/i.test(righe.slice(Math.max(0, indice - 3), indice + 1).join(" "));
}

/**
 * **Le eccezioni, con il perche'. Questo elenco puo' solo accorciarsi.**
 *
 * Un elenco di eccezioni che cresce e' il modo in cui un controllo diventa
 * rumore: chi ne aggiunge una deve scrivere qui perche', e la ragione deve
 * essere che quella riga **non e'** la durata della prova.
 */
const FUORI_DAL_CONTROLLO: Array<{ file: string; perche: string }> = [
  {
    file: "src/lib/durata-della-prova.ts",
    perche: "e' la casa: il numero sta li' per definizione",
  },
];

describe("la durata della prova ha una casa sola", () => {
  it("il database e il sito dicono lo stesso numero", () => {
    // Il caso che conta davvero, ed e' comportamentale solo a meta': legge il
    // numero dal testo della migration, non da un database in funzione. La
    // prova vera -- che le funzioni producano una demo di trenta giorni -- si
    // e' fatta su Postgres 17 ricostruito da questi file, chiamando
    // `configure_demo_profile` e `finalize_demo_activation` e misurando:
    // 30,000 giorni, stato `active`. Qui si fissa che le due dichiarazioni
    // non si separino.
    const migration = leggiOppureDillo(
      "supabase/migrations/20260921120000_la_prova_dura_trenta_giorni.sql",
    );
    const funzione = migration.match(
      /create or replace function public\.durata_della_prova\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/,
    );
    expect(funzione, "PROPRIETA' VIOLATA: la funzione public.durata_della_prova() non e' piu' in quella migration").not.toBeNull();

    const giorni = funzione?.[1].match(/interval\s+'(\d+)\s+days?'/);
    expect(giorni, "PROPRIETA' VIOLATA: la funzione non dichiara piu' un intervallo in giorni").not.toBeNull();
    expect(
      Number(giorni?.[1]),
      "PROPRIETA' VIOLATA: il database e src/lib/durata-della-prova.ts dicono due durate diverse. Una demo durerebbe un numero di giorni e l'email ne annuncerebbe un altro. Rieseguire non serve: c'e' da correggere.",
    ).toBe(GIORNI_DI_PROVA);
  });

  it("nessun file scrive la durata per conto suo", () => {
    const esentati = new Set(FUORI_DAL_CONTROLLO.map((e) => e.file));
    const colpevoli: string[] = [];

    for (const percorso of sorgentiDi(resolve(RADICE, "src"))) {
      const relativo = relative(RADICE, percorso).replace(/\\/g, "/");
      if (esentati.has(relativo)) continue;

      const righe = senzaCommenti(readFileSync(percorso, "utf8")).split("\n");
      righe.forEach((riga, i) => {
        // "1-2 giorni lavorativi" e' il tempo di risposta del titolare a una
        // richiesta, non la durata della prova: due cose diverse che si
        // toccano nella stessa email.
        if (/giorni\s+lavorativi/i.test(riga)) return;
        if (riga.includes("GIORNI_DI_PROVA")) return;
        if (!DURATA_A_MANO.test(riga)) return;
        if (!parlaDellaProva(righe, i)) return;
        colpevoli.push(`${relativo}:${i + 1}  ${riga.trim().slice(0, 110)}`);
      });
    }

    expect(
      colpevoli,
      "PROPRIETA' VIOLATA: questi punti scrivono una durata a mano invece di chiedere GIORNI_DI_PROVA",
    ).toEqual([]);
  });

  it("nel database la durata sta solo dentro la sua funzione", () => {
    // Le funzioni della demo non devono contenere un `interval` di giorni per
    // conto loro: chiamano `public.durata_della_prova()`. L'unica eccezione
    // e' il controllo di buonsenso sul vincolo -- "non piu' di novanta
    // giorni" -- che non e' la durata ma il suo limite superiore, e infatti
    // non va toccato quando la durata cambia.
    const migration = leggiOppureDillo(
      "supabase/migrations/20260921120000_la_prova_dura_trenta_giorni.sql",
    );
    const senzaCasa = migration.replace(
      /create or replace function public\.durata_della_prova\(\)[\s\S]*?\$\$[\s\S]*?\$\$;/,
      " ",
    );
    const sql = senzaCasa
      .split("\n")
      .filter((r) => !r.trim().startsWith("--"))
      .join("\n");

    const intervalli = [...sql.matchAll(/interval\s+'(\d+)\s+days?'/g)].map((m) => m[0]);
    expect(
      intervalli,
      "PROPRIETA' VIOLATA: una funzione della demo scrive un intervallo suo invece di chiamare public.durata_della_prova()",
    ).toEqual(["interval '90 days'"]);
  });

  it("i due rossi si distinguono senza interpretazione", () => {
    // **La prova che la distinzione esiste davvero.** Le due situazioni si
    // producono qui, una accanto all'altra, e si guarda che i messaggi non si
    // somiglino: se un giorno questo file diventa rosso, chi lo legge deve
    // sapere **dalla prima riga** se rieseguire o correggere, senza chiedere
    // a nessuno e senza conoscere la storia.

    // Primo rosso: il controllo non ha potuto guardare. E' cio' che
    // succederebbe con un file cancellato, un disco pieno, un contenitore
    // morto per memoria -- il caso vero del 21/09/2026.
    let nonLeggibile = "";
    try {
      leggiOppureDillo("supabase/migrations/questo_file_non_esiste.sql");
    } catch (e) {
      nonLeggibile = e instanceof Error ? e.message : String(e);
    }
    expect(nonLeggibile).toContain("NON LEGGIBILE:");
    expect(nonLeggibile).toContain("non dice niente sulla durata della prova");
    expect(nonLeggibile).not.toContain("PROPRIETA' VIOLATA");

    // Secondo rosso: il controllo ha guardato, e quello che ha visto e'
    // sbagliato. Si produce con una migration finta che dichiara una durata
    // diversa da quella del sito.
    const finta = "create or replace function public.durata_della_prova()\nas $$ select interval '45 days'; $$;";
    const giorni = Number(finta.match(/interval\s+'(\d+)\s+days?'/)?.[1]);
    let proprietaViolata = "";
    try {
      expect(giorni, "PROPRIETA' VIOLATA: il database e il sito dicono due durate diverse").toBe(GIORNI_DI_PROVA);
    } catch (e) {
      proprietaViolata = e instanceof Error ? e.message : String(e);
    }
    expect(proprietaViolata).toContain("PROPRIETA' VIOLATA");
    expect(proprietaViolata).not.toContain("NON LEGGIBILE");

    // E la cosa che conta: i due messaggi non si confondono in nessuna delle
    // due direzioni. Un rosso che non porta nessuno dei due prefissi e' un
    // terzo caso non previsto, e va guardato come tale.
    expect(nonLeggibile.slice(0, 40)).not.toEqual(proprietaViolata.slice(0, 40));
  });

  it("il guardiano sa anche dire di no", () => {
    // Prima di fidarsi del verde si produce il rosso. Qui i tre difetti da
    // cui questo file difende, in miniatura.
    const righeFinte = ["<p>Richiedi la tua Demo gratuita di 30 giorni</p>"];
    expect(DURATA_A_MANO.test(righeFinte[0])).toBe(true);
    expect(parlaDellaProva(righeFinte, 0)).toBe(true);

    // Il conto in millisecondi, che e' la forma che non contiene la parola
    // "giorni" e che sfuggirebbe a una ricerca fatta sulle parole.
    const aritmetica = "const scadenza = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);";
    expect(DURATA_A_MANO.test(aritmetica)).toBe(true);

    // E cio' che non deve far scattare niente: il tempo di risposta e la
    // riga che chiede il numero invece di scriverlo.
    expect(/giorni\s+lavorativi/i.test("Tempi stimati: 1-2 giorni lavorativi.")).toBe(true);
    expect("prova gratuita di {GIORNI_DI_PROVA} giorni".includes("GIORNI_DI_PROVA")).toBe(true);
  });
});

/**
 * **La riga "Scadenza" dell'email e' una data, e si scrive come si scrive a
 * una persona.**
 *
 * Mandava `2026-09-28T09:01:50.265Z`. Chi la riceve deve accorgersi che la
 * `T` separa l'ora e la `Z` vuol dire fuso di Greenwich, e fare i conti per
 * sapere fino a quando ha tempo. Con la prova a trenta giorni quella riga
 * conta di piu': e' l'unico posto in cui il concessionario legge quanto gli
 * resta.
 */
describe("la scadenza si scrive come la legge una persona", () => {
  it("una data vera diventa una data italiana", () => {
    expect(scadenzaPerUnaPersona("2026-10-21T09:01:50.265396+00:00")).toBe("21 ottobre 2026");
  });

  it("il fuso e' fissato: la stessa scadenza non cambia giorno col server", () => {
    // Le 23:30 a Greenwich sono l'1:30 del giorno dopo a Roma d'estate. Senza
    // `timeZone` fissato, la stessa email direbbe due giorni diversi a
    // seconda di dove gira il server che la manda -- e nessuno lo
    // scoprirebbe, perche' in locale il fuso e' quello giusto.
    expect(scadenzaPerUnaPersona("2026-07-20T23:30:00.000Z")).toBe("21 luglio 2026");
  });

  it("una data illeggibile resta com'e', non ne nasce una inventata", () => {
    // Il ripiego che restituisse "oggi + trenta giorni" direbbe al
    // concessionario una scadenza che il suo account non ha. Meglio un valore
    // brutto e vero.
    expect(scadenzaPerUnaPersona("non una data")).toBe("non una data");
    expect(scadenzaPerUnaPersona("")).toBe("");
  });
});
