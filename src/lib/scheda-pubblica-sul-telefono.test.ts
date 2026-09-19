import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { descrizioneVaAccorciata, RIGHE_DESCRIZIONE_VISIBILI } from "@/lib/descrizione-annuncio";

const scheda = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/page.tsx"), "utf8");

/**
 * Il sorgente senza commenti. Serve perche' i commenti **nominano** la classe
 * che hanno tolto, per spiegare il difetto: un controllo che cercasse la
 * parola nel file intero si accenderebbe sulla sua stessa spiegazione.
 */
const codice = scheda.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/**
 * **La scheda pubblica letta dal telefono**, 18/09/2026. E' la pagina che
 * guarda chi sta decidendo se chiamare: un dato tagliato li' costa un
 * cliente, non un fastidio.
 *
 * La resa a video non e' verificabile da qui. Questi test fissano le due
 * decisioni che l'hanno prodotta; le misure che le hanno motivate stanno nei
 * commenti, con i numeri veri.
 */
describe("nessun dato della scheda tecnica viene tagliato", () => {
  it("il valore va a capo invece di finire a tre puntini", () => {
    // Il difetto: `truncate` piu' un tetto del 60% della riga. Su **174
    // automobili pubblicate su 279 (62%)** la **Versione** arrivava monca --
    // "MAZDA 3 2025 5HB 2.5L e-SKYACTIV G 140cv 6MT FWD Exclusive-L..." -- ed
    // e' esattamente il dato che distingue un allestimento da un altro.
    // Gli altri dodici campi ci stavano gia': il taglio riguardava solo
    // quello, ma su due schede su tre.
    const schedaTecnica = codice.slice(codice.indexOf("Scheda tecnica"));
    expect(schedaTecnica, "il valore viene ancora tagliato").not.toContain("truncate");
    expect(schedaTecnica).toContain("break-words");
  });

  it("sul telefono l'etichetta sta sopra il valore, non accanto", () => {
    // Accanto, il valore aveva il 60% di uno schermo stretto. Sopra, ha tutta
    // la larghezza: e' il tetto a strozzarlo, non la lunghezza del testo.
    const schedaTecnica = codice.slice(codice.indexOf("Scheda tecnica"));
    expect(schedaTecnica).toContain("flex flex-col");
    expect(schedaTecnica).toContain("sm:flex-row");
    // Il tetto resta solo da tablet in su, dove c'e' spazio per due colonne.
    expect(schedaTecnica).toContain("sm:max-w-[60%]");
    expect(schedaTecnica, "il tetto vale ancora sul telefono").not.toContain(" max-w-[60%]");
  });
});

describe("le caselle in cima non tagliano nemmeno il nome del campo", () => {
  it("etichetta e valore vanno a capo", () => {
    // Le cinque caselle sotto le fotografie stanno **due per riga** sul
    // telefono, e li' si tagliava anche il nome del campo: "Immatricolazione"
    // sono sedici caratteri e si leggeva "Immatricolaz...". Fra i valori,
    // "Meccanico Sequenziale" faceva la stessa fine.
    // Ci si aggancia al codice, non ai commenti: `codice` li ha gia' tolti.
    const inizio = codice.indexOf("heroSpecs.map(");
    const caselle = codice.slice(inizio, codice.indexOf("</div>", codice.indexOf("{spec.value}", inizio)));
    expect(inizio, "le caselle in cima non si trovano piu'").toBeGreaterThan(0);
    expect(caselle, "le caselle in cima tagliano ancora").not.toContain("truncate");
    expect(caselle).toContain("break-words");
  });
});

describe("nemmeno i contatti della concessionaria vengono tagliati", () => {
  it("l'email va a capo: tagliata non si puo' scrivere", () => {
    // Lo stesso `truncate` della scheda tecnica stava anche sulla riga dei
    // contatti, e li' costava di piu': il 18/09/2026 **tre indirizzi email su
    // cinque** superavano i caratteri che entrano in uno schermo stretto. Una
    // versione tagliata si legge male, un'email tagliata non si scrive -- ed
    // e' il modo in cui il compratore avrebbe chiamato.
    const riga = codice.slice(codice.indexOf("function InfoRow"));
    expect(riga, "i contatti vengono ancora tagliati").not.toContain("truncate");
    expect(riga).toContain("break-words");
    expect(riga).toContain("sm:flex-row");
  });
});

describe("il taglio non torna da un'altra parte, in nessuna pagina pubblica", () => {
  /**
   * **Il guardiano non elenca i posti, conta gli usi.** Il difetto l'avevo
   * trovato in un punto e nella sola scheda auto era in **tre**: scheda
   * tecnica, caselle in cima, contatti della concessionaria. Un elenco di tre
   * posti si dimentica; una regola no.
   *
   * Allargato a **tutto il marketplace** il 19/09/2026, prima che il titolare
   * aprisse le altre pagine dal telefono: cosi' quello che trova guardando e'
   * solo cio' che un test non puo' vedere.
   *
   * `truncate` taglia su una riga sola e ci mette tre puntini. Su una pagina
   * pubblica, dove chi legge sta decidendo se comprare un'automobile, non si
   * usa. **`line-clamp` e' un'altra cosa e resta ammesso**: tiene piu' righe,
   * si usa sui titoli delle schede in elenco, e il testo intero e' a un tocco
   * di distanza sulla pagina dell'auto.
   */
  function sorgenti(cartella: string, raccolti: string[] = []): string[] {
    for (const nome of readdirSync(resolve(process.cwd(), cartella))) {
      const percorso = `${cartella}/${nome}`;
      if (statSync(resolve(process.cwd(), percorso)).isDirectory()) sorgenti(percorso, raccolti);
      else if (nome.endsWith(".tsx")) raccolti.push(percorso);
    }
    return raccolti;
  }

  /**
   * L'unica eccezione, con il suo perche'. Puo' solo accorciarsi.
   *
   * La striscia dei nomi delle concessionarie in home scorre di lato come un
   * nastro: e' `whitespace-nowrap` per costruzione, e mandarla a capo la
   * romperebbe. Non taglia niente -- il testo scorre tutto.
   */
  const NASTRO_CHE_SCORRE = "src/components/marketplace/marquee-dealers.tsx";

  it("nessuna pagina pubblica taglia il testo su una riga sola", () => {
    const colpevoli: string[] = [];
    for (const percorso of [...sorgenti("src/app/(marketplace)"), ...sorgenti("src/components/marketplace")]) {
      const testo = readFileSync(resolve(process.cwd(), percorso), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^[ \t]*\/\/.*$/gm, " ");
      // `truncate` come classe intera: `line-clamp-2` non contiene la parola,
      // ma un `sm:truncate` si'.
      if (/(^|["'\s:])truncate(["'\s]|$)/.test(testo)) colpevoli.push(percorso);
    }
    expect(
      colpevoli,
      `Queste pagine pubbliche tagliano ancora il testo:\n  ${colpevoli.join("\n  ")}\n` +
        "Su una pagina che guarda chi sta comprando, un dato tagliato e' un dato perso: il 18/09/2026 erano tre " +
        "indirizzi email su cinque, ed e' il campo da cui nasce il contatto.",
    ).toEqual([]);
  });

  it("il nastro che scorre resta l'unica eccezione, e si sa perche'", () => {
    const nastro = readFileSync(resolve(process.cwd(), NASTRO_CHE_SCORRE), "utf8");
    expect(nastro, `${NASTRO_CHE_SCORRE} non e' piu' un nastro: l'eccezione va tolta`).toContain("whitespace-nowrap");
    // E non deve nemmeno lui tagliare: scorre, non tronca.
    expect(nastro).not.toContain("truncate");
  });

  it("e il guardiano vede davvero un taglio nuovo", () => {
    // Un controllo mai visto rosso non e' un controllo.
    const forma = /(^|["'\s:])truncate(["'\s]|$)/;
    expect(forma.test('className="min-w-0 truncate text-sm"')).toBe(true);
    expect(forma.test('className="sm:truncate"')).toBe(true);
    expect(forma.test('className="line-clamp-2 min-w-0"')).toBe(false);
    expect(forma.test("// niente truncate qui")).toBe(true);
  });
});

describe("la descrizione si accorcia senza nascondersi", () => {
  it("il testo sta in <summary>, che si vede sempre", () => {
    // **La verifica che conta**: `<summary>` e' visibile aperto o chiuso.
    // Quello che cambia aprendo e' solo il taglio delle righe, che e' CSS.
    // Cosi' il testo non finisce mai dentro una parte nascosta della pagina,
    // e chi la legge -- persona o motore di ricerca -- lo trova comunque.
    const blocco = scheda.slice(scheda.indexOf("<details"), scheda.indexOf("</details>"));
    expect(blocco).toContain("<summary");
    expect(blocco).toContain("{descrizione}");
    // Il testo deve stare PRIMA della chiusura di summary, non dopo.
    expect(blocco.indexOf("{descrizione}")).toBeLessThan(blocco.indexOf("</summary>"));
  });

  it("si accorcia con il CSS, non togliendo parole", () => {
    expect(scheda).toContain("line-clamp-5");
    expect(scheda).toContain("group-open:line-clamp-none");
    expect(scheda).toContain("Mostra tutta la descrizione");
  });

  it("niente JavaScript: la scheda resta precompilata", () => {
    // Un componente interattivo manderebbe codice al browser su ogni
    // annuncio. `<details>` lo usano gia' il menu del telefono e le FAQ.
    expect(scheda, "la scheda pubblica e' diventata un componente del browser").not.toContain('"use client"');
  });

  it("su una descrizione che ci sta gia' non si chiede niente", () => {
    // "Mostra tutta la descrizione" sotto tre righe e' un invito a non fare
    // niente. In produzione il 18/09/2026: 156 schede lo mostrano, 42 no.
    expect(descrizioneVaAccorciata(null)).toBe(false);
    expect(descrizioneVaAccorciata("   ")).toBe(false);
    expect(descrizioneVaAccorciata("Auto in ottimo stato, unico proprietario.")).toBe(false);
    // Sei righe di dotazioni: si accorcia anche se i caratteri sono pochi.
    expect(descrizioneVaAccorciata("-CLIMA\n-CERCHI\n-NAVI\n-LED\n-SENSORI\n-CAMERA")).toBe(true);
    // Un discorso lungo: si accorcia per i caratteri.
    expect(descrizioneVaAccorciata("a".repeat(181))).toBe(true);
    expect(descrizioneVaAccorciata("a".repeat(180))).toBe(false);
  });

  it("le righe visibili sono cinque, e il numero vive in un posto solo", () => {
    expect(RIGHE_DESCRIZIONE_VISIBILI).toBe(5);
    expect(scheda).toContain(`line-clamp-${RIGHE_DESCRIZIONE_VISIBILI}`);
  });
});
