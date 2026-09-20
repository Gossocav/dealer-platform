import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **Ogni pagina pubblica dichiara il proprio indirizzo canonico, e dichiara
 * se stessa.**
 *
 * L'indirizzo canonico e' la riga con cui una pagina dice a chi indicizza
 * *"la versione buona di me sono io"*. Senza, due indirizzi che mostrano la
 * stessa pagina -- con una barra finale, con un parametro di provenienza --
 * diventano due pagine diverse che si fanno concorrenza; con quella riga
 * puntata **alla pagina sbagliata**, il sito chiede di essere ignorato a
 * favore di qualcos'altro. E' esattamente il difetto del 20/09/2026, quando
 * undici pagine di risultati su dodici dichiaravano di essere un doppione
 * della prima.
 *
 * **Perche' questo controllo esiste, ed e' la parte che vale.** Lo stesso
 * giorno, il quadro di cosa il sito dichiara e' stato fatto **a mano**, con
 * uno script che leggeva le pagine vere. Quello script ha risposto che la
 * home non aveva nessun canonico: falso. Il canonico della home e'
 * l'indirizzo del sito, e lo script -- che accorciava i valori togliendo
 * l'indirizzo del sito per tenere stretta la tabella -- ne ricavava una
 * stringa vuota, letta come "assente". Il titolare ha ricevuto la
 * segnalazione e ha chiesto di correggere una riga che era gia' giusta.
 *
 * Una misura a mano si puo' sbagliare cosi' e nessuno se ne accorge. Questo
 * controllo guarda i sorgenti, gira a ogni modifica, e non accorcia niente.
 *
 * **Due trappole dentro il controllo stesso**, tutte e due gia' pagate qui:
 *
 * 1. **la pagina non e' l'unico posto dove puo' stare.** `/demo` e' un
 *    componente client e non puo' dichiarare `metadata`: il suo canonico sta
 *    nel `layout.tsx` accanto. Un controllo che guardasse solo `page.tsx` la
 *    segnalerebbe a torto -- ed e' il caso "diventa rosso quando non
 *    dovrebbe", il piu' insidioso perche' invita a rimettere le cose com'erano;
 * 2. **un commento non e' codice.** Il file di `/ricerca` cita la
 *    documentazione di Google e contiene la parola "canonical" in una frase
 *    in inglese. Cercandola senza togliere i commenti, una pagina che ha
 *    buttato via la sua riga passerebbe verde grazie a una citazione.
 *
 * **Questo controllo sostituisce `canonical-coverage.test.ts`** (28/08/2026),
 * che faceva la stessa promessa con un **elenco di diciassette file scritto a
 * mano**. Non era sbagliato: era fermo. Una pagina pubblica nuova non ci
 * sarebbe entrata da sola, e nessuno l'avrebbe saputo -- e' la differenza,
 * gia' scritta in AGENTS.md, fra un guardiano che **elenca i nomi** e uno che
 * **controlla la regola**. Chiedeva inoltre solo che la parola "canonical"
 * comparisse nel file, senza togliere i commenti e **senza guardare dove
 * puntasse**: una pagina che dichiarasse l'indirizzo di un'altra passava
 * verde, ed e' esattamente il difetto del 20/09/2026. Il suo secondo caso --
 * la sitemap e la home che scrivono lo stesso indirizzo -- e' conservato qui
 * sotto.
 */

const RADICE = resolve(process.cwd(), "src/app/(marketplace)");

/** Via i commenti: quello che spiega il codice non lo esegue nessuno. */
function senzaCommenti(sorgente: string) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function paginePubbliche(base: string, trovate: string[] = []) {
  for (const voce of readdirSync(base)) {
    const percorso = join(base, voce);
    if (statSync(percorso).isDirectory()) paginePubbliche(percorso, trovate);
    else if (voce === "page.tsx") trovate.push(percorso);
  }
  return trovate;
}

/** Da `src/app/(marketplace)/registrazione/base/page.tsx` a `/registrazione/base`. */
function rottaDi(percorsoPagina: string) {
  const dentro = relative(RADICE, percorsoPagina).replace(/\\/g, "/").replace(/\/?page\.tsx$/, "");
  const segmenti = dentro.split("/").filter((s) => s !== "" && !/^\(.+\)$/.test(s));
  return segmenti.length === 0 ? "/" : `/${segmenti.join("/")}`;
}

/**
 * Il codice che puo' dichiarare il canonico di una pagina: la pagina stessa
 * piu' il `layout.tsx` che le sta accanto (vedi la trappola 1).
 */
function codiceCheDichiara(percorsoPagina: string) {
  const accanto = percorsoPagina.replace(/page\.tsx$/, "layout.tsx");
  const pezzi = [readFileSync(percorsoPagina, "utf8")];
  if (existsSync(accanto)) pezzi.push(readFileSync(accanto, "utf8"));
  return senzaCommenti(pezzi.join("\n"));
}

/**
 * Cosa il controllo pretende, separato dai file cosi' da poterlo provare su
 * un caso finto: e' l'unico modo di sapere che sa anche dire di no.
 */
function seDichiaraSeStessa(codice: string, rotta: string) {
  if (!/alternates\s*:/.test(codice) || !codice.includes("canonical")) {
    return { va: false, perche: "non dichiara nessun indirizzo canonico" };
  }
  // Una rotta con un segmento variabile lo compone: si pretende il prefisso
  // fisso, che e' la parte che una copia incollata sbaglierebbe.
  const variabile = rotta.indexOf("/[");
  const atteso =
    variabile === -1 ? `toAbsoluteUrl("${rotta}")` : `\`${rotta.slice(0, variabile)}/\${`;
  const nominaSeStessa =
    variabile === -1 ? codice.includes(`"${rotta}"`) : codice.includes(atteso);
  return nominaSeStessa
    ? { va: true, perche: "" }
    : { va: false, perche: `il canonico non nomina ${rotta}: atteso ${atteso}` };
}

describe("ogni pagina pubblica dice chi e'", () => {
  it("tutte dichiarano un canonico che punta a se stesse", () => {
    const pagine = paginePubbliche(RADICE);
    const colpevoli: string[] = [];

    for (const pagina of pagine) {
      const rotta = rottaDi(pagina);
      const esito = seDichiaraSeStessa(codiceCheDichiara(pagina), rotta);
      if (!esito.va) colpevoli.push(`${rotta} (${relative(process.cwd(), pagina)}): ${esito.perche}`);
    }

    expect(colpevoli).toEqual([]);
    // Se un giorno la cartella si svuota, il controllo non deve passare
    // perche' non ha guardato niente: "zero differenze li' vuol dire non
    // guardato, non tutto a posto".
    expect(pagine.length).toBeGreaterThanOrEqual(19);
  });

  it("la home e' fra quelle guardate, ed e' quella che si sbaglia a leggere", () => {
    // Il canonico della home e' l'indirizzo del sito: e' il valore che, letto
    // con uno strumento che accorcia, sembra vuoto. Qui non lo e'.
    const rotte = paginePubbliche(RADICE).map(rottaDi);
    expect(rotte).toContain("/");
  });

  it("il guardiano sa anche dire di no", () => {
    // Prima di fidarsi del verde si produce il rosso: tre pagine finte che
    // devono essere tutte e tre respinte.
    expect(seDichiaraSeStessa('export const metadata = { title: "Nuova" };', "/nuova").va).toBe(false);
    expect(
      seDichiaraSeStessa('alternates: { canonical: toAbsoluteUrl("/altra") }', "/nuova").va,
    ).toBe(false);
    expect(
      seDichiaraSeStessa('alternates: { canonical: toAbsoluteUrl("/auto") }', "/auto/[id]").va,
    ).toBe(false);
    // E il caso buono passa, altrimenti direbbe di no a tutto.
    expect(
      seDichiaraSeStessa('alternates: { canonical: toAbsoluteUrl("/nuova") }', "/nuova").va,
    ).toBe(true);
    expect(
      seDichiaraSeStessa("alternates: { canonical: toAbsoluteUrl(`/auto/${id}`) }", "/auto/[id]").va,
    ).toBe(true);
  });

  it("la sitemap dichiara la home come la home si dichiara", () => {
    // Ereditato da canonical-coverage.test.ts. Lo stesso indirizzo scritto in
    // due modi -- con e senza barra finale -- e' un'incoerenza che poi si
    // legge come errore.
    const sitemap = readFileSync(resolve(process.cwd(), "src/app/sitemap.ts"), "utf8");
    expect(sitemap).toContain('entry.path === "/" ? baseUrl');
  });

  it("un canonico scritto solo dentro un commento non conta", () => {
    // Il file di /ricerca cita la documentazione di Google e nomina
    // "canonical" in una frase: senza togliere i commenti, una pagina che ha
    // perso la sua riga passerebbe grazie a una citazione.
    const soloCommento = `// alternates: { canonical: toAbsoluteUrl("/nuova") }\nexport default function P() {}`;
    expect(seDichiaraSeStessa(senzaCommenti(soloCommento), "/nuova").va).toBe(false);
  });
});
