import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **I pacchetti tecnici del router restano fuori dalle scansioni, e la regola
 * che li tiene fuori non deve prendere una pagina vera.**
 *
 * **Il difetto, misurato in Search Console il 21/09/2026.** Su 999 indirizzi
 * di esempio forniti da Google, **999 avevano la forma `?_rsc=<token>`**:
 * circa 2.780 richieste di scansione su 3.650 in 45 giorni -- il **76%** --
 * spese su pacchetti tecnici invece che sulle schede. In cima alla
 * classifica /privacy, /come-funziona, /login, /termini, cioe' le pagine
 * collegate dal pie' di pagina, che sta su ogni schermata. Le schede auto
 * erano **15 su 999**. Nello stesso periodo 262 pagine risultavano "Rilevata,
 * ma attualmente non indicizzata" e **zero** "scansionata ma non
 * indicizzata": Google conosceva quelle pagine e non le ha mai scaricate,
 * perche' il tempo lo stava spendendo altrove.
 *
 * **Perche' bloccarli non toglie niente a chi indicizza.** Il contenuto
 * viaggia dentro l'HTML (`self.__next_f`); `_rsc` lo attacca il router del
 * browser per la navigazione **successiva**. Verificato con un browser vero
 * prima di scrivere la regola: rendendo due pagine con tutte le richieste
 * `_rsc` abortite -- 15 e 21 tentate, altrettante abortite, **zero passate**
 * -- il contenuto esce identico byte per byte.
 *
 * Questo file tiene ferme le tre cose che rendono vera quella frase.
 */

const robots = readFileSync(resolve(process.cwd(), "src/app/robots.ts"), "utf8");
const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

/** Via i commenti: quello che spiega il codice non lo esegue nessuno. */
function senzaCommenti(sorgente: string) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Le rotte pubbliche, ricavate dalle cartelle e non da un elenco a mano. */
function rottePubbliche(base: string, trovate: string[] = []) {
  for (const voce of readdirSync(base)) {
    const percorso = join(base, voce);
    if (statSync(percorso).isDirectory()) rottePubbliche(percorso, trovate);
    else if (voce === "page.tsx") trovate.push(percorso);
  }
  return trovate;
}

/** I nomi dei file che la compilazione produce, se c'e' una compilazione. */
function fileCostruiti(base: string, trovati: string[] = []) {
  for (const voce of readdirSync(base)) {
    const percorso = join(base, voce);
    if (statSync(percorso).isDirectory()) fileCostruiti(percorso, trovati);
    else trovati.push(voce);
  }
  return trovati;
}

/**
 * Le regole scritte nel sorgente, lette come le leggerebbe un motore.
 *
 * Non e' un motore robots completo e non vuole esserlo: applica la sola
 * regola che decide questo caso -- **a regole contrastanti vince la
 * corrispondenza piu' lunga, e a pari lunghezza vince il permesso** -- cosi'
 * il test controlla una proprieta' invece della presenza di una riga. La
 * verifica su tutte le forme e' stata fatta con Protego e robotspy.
 */
function regoleDalSorgente(tipo: "allow" | "disallow") {
  const blocco = senzaCommenti(robots).match(new RegExp(`${tipo}:\\s*\\[([\\s\\S]*?)\\]`));
  const scritte = [...(blocco?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // `PRIVATE_AREA_PREFIXES` non e' una stringa letterale: qui non serve, i
  // casi provati non toccano le aree riservate.
  return scritte;
}

function combacia(regola: string, indirizzo: string) {
  const parti = regola.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parti.join(".*")}`).test(indirizzo);
}

function permesso(indirizzo: string) {
  const piuLunga = (tipo: "allow" | "disallow") =>
    regoleDalSorgente(tipo)
      .filter((r) => combacia(r, indirizzo))
      .reduce((max, r) => Math.max(max, r.length), -1);
  return piuLunga("allow") >= piuLunga("disallow");
}

describe("i pacchetti del router restano fuori dalle scansioni", () => {
  it("robots.txt li vieta, e nella forma che li prende tutti", () => {
    // **Non `/*_rsc=`.** Next emette due forme, e sono nello stesso file
    // (`set-cache-busting-search-param.js`): `_rsc=<impronta>` quando
    // l'impronta c'e', e **`_rsc` nudo** quando e' vuota. La regola con
    // l'uguale avrebbe lasciato passare la seconda -- ed e' esattamente il
    // genere di dettaglio che si scopre leggendo il sorgente e non a memoria.
    const codice = senzaCommenti(robots);
    expect(codice).toContain('"/*_rsc"');
    expect(codice).not.toContain('"/*_rsc="');
  });

  it("la regola non puo' colpire nessuna pagina vera", () => {
    // `Disallow: /*_rsc` prende quelle quattro lettere **in qualunque
    // posizione dell'indirizzo, percorso compreso**. Oggi e' innocuo perche'
    // nessuna rotta le contiene -- passati i 294 indirizzi della sitemap in
    // un motore robots vero, bloccati 0 -- ma una rotta futura che le
    // contenesse sparirebbe **in silenzio**: nessun errore, nessun rosso,
    // solo una pagina che non viene piu' scansionata.
    //
    // Qui il controllo si fa sulle cartelle invece che sulla sitemap, cosi'
    // gira senza rete e vede la rotta **il giorno che nasce**, non il giorno
    // che entra nella sitemap.
    const radice = resolve(process.cwd(), "src/app");
    const colpevoli = rottePubbliche(radice)
      .map((f) => relative(radice, f).replace(/\\/g, "/"))
      .filter((r) => r.includes("_rsc"));

    expect(colpevoli).toEqual([]);
  });

  it("i file del programma restano leggibili, anche quello sfortunato", () => {
    // **Il danno che la regola da sola faceva, trovato da una verifica
    // ostile prima di pubblicarla.** `Disallow: /*_rsc` cerca quelle quattro
    // lettere **ovunque nell'indirizzo**, e i file costruiti a ogni
    // pubblicazione hanno nomi casuali di tredici caratteri su un alfabeto
    // che comprende il trattino basso. Prima o poi ne esce uno chiamato
    // `ab_rsc7k2x9.js`, e quel giorno chi indicizza smette di scaricare un
    // pezzo del programma, senza nessun errore. **Raro e possibile**: quanto
    // sia probabile dipende da assunti che non abbiamo misurato, e un numero
    // preciso sarebbe una stima travestita. Un guasto silenzioso si previene
    // comunque.
    //
    // `Allow: /_next/` e' piu' lungo del divieto, e a regole contrastanti
    // vince la piu' lunga.
    // Si controlla la **proprieta'**, non la presenza della riga: che un
    // indirizzo di quel tipo risulti permesso. La verifica completa e' stata
    // fatta con due motori robots veri (Protego e robotspy); qui ne vive una
    // miniatura, che applica la sola regola che conta -- **vince la
    // corrispondenza piu' lunga** -- alle regole scritte nel sorgente.
    const sfortunato = "/_next/static/immutable/chunks/ab_rsc7k2x9.js";
    expect(permesso(sfortunato)).toBe(true);
    expect(permesso("/_next/static/immutable/chunks/2k_8snrpv8b1c.js")).toBe(true);
    // E la cura resta: i pacchetti tecnici restano fuori.
    expect(permesso("/privacy?_rsc=abc")).toBe(false);
    expect(permesso("/privacy?_rsc")).toBe(false);
    expect(permesso("/privacy")).toBe(true);

    // Se la compilazione di oggi ha davvero prodotto un file con quelle
    // lettere, lo si stampa: non e' un difetto, e' la prova che il permesso
    // qui sopra serve davvero.
    const costruiti = resolve(process.cwd(), ".next/static");
    if (existsSync(costruiti)) {
      const sfortunati = fileCostruiti(costruiti).filter((f) => f.includes("_rsc"));
      for (const f of sfortunati) expect(permesso(`/_next/static/chunks/${f}`)).toBe(true);
    }
  });

  it("il guardiano sa anche dire di no", () => {
    // Prima di fidarsi del verde si produce il rosso: se la regola sparisse,
    // o tornasse nella forma con l'uguale, queste due condizioni cadono.
    const finto = 'disallow: ["/admin/", "/*_rsc="]';
    expect(senzaCommenti(finto)).not.toContain('"/*_rsc"');
    expect(senzaCommenti(finto)).toContain('"/*_rsc="');
    // E una rotta finta con quelle lettere dentro deve risultare colpevole.
    expect(["auto/_rsc-speciale/page.tsx"].filter((r) => r.includes("_rsc"))).toHaveLength(1);
  });
});

/**
 * **La condizione che farebbe cadere tutto il ragionamento qui sopra.**
 *
 * Esiste un caso in cui l'HTML iniziale contiene uno script che scarica
 * `?_rsc=` e da cui dipende l'idratazione della pagina: si accende con
 * **Cache Components** (in Next 16 ha assorbito la Partial Prerendering).
 * Oggi qui e' spento, e per questo il blocco in robots.txt non fa danno.
 *
 * Il giorno che qualcuno lo accendesse, quel blocco diventerebbe una pagina
 * che **non si idrata** -- e una frase dentro un commento non la rilegge
 * nessuno mentre cambia una configurazione. Questo test la rilegge al posto
 * suo.
 *
 * **Cosa fare se questo test diventa rosso**, ed e' il motivo per cui e'
 * scritto qui: non si toglie il test. Si va in `src/app/robots.ts`, si
 * rimuove la riga `"/*_rsc"` **prima** di pubblicare con la nuova
 * configurazione, e si rifa' la misura con un browser vero -- rendere una
 * pagina con quelle richieste bloccate e guardare se il contenuto esce
 * intero. Se esce intero, la riga puo' tornare; se non esce, la cura
 * dell'indicizzazione va ripensata da capo.
 */
describe("la condizione che farebbe cadere il blocco dei pacchetti", () => {
  it("Cache Components e la Partial Prerendering restano spente", () => {
    const codice = senzaCommenti(config);
    expect(codice).not.toMatch(/cacheComponents\s*:/);
    expect(codice).not.toMatch(/\bppr\s*:/);
  });
});
