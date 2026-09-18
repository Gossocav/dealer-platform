import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fraseIngresso, percheNienteIngresso } from "@/lib/giacenza";
import {
  calcolatoDaKeyAuto,
  disaccordo,
  etichettaProvenienza,
  fraseDelDisaccordo,
  notaDelCampo,
  scriviDalSito,
  dalSito,
  SENZA_SEGNO,
} from "@/lib/provenienza-dati";
import { regimeIvaDaMostrare } from "@/lib/regime-iva";
import { campoDellImmatricolazione, giornoDaMostrare, immatricolazioneDaMostrare, prezzoDaMostrare } from "@/lib/vehicles";

/**
 * **Le parole che compaiono a schermo si provano qui.**
 *
 * La resa a video del gestionale non e' verificabile senza le credenziali del
 * concessionario: questi test sono l'unico modo di sapere che ogni frase dice
 * davvero quello che deve dire. Ognuno nomina la frase che fissa.
 */

describe("ogni valore ha la sua provenienza, sempre", () => {
  it("un campo senza segno lo dice, invece di tacere", () => {
    // Tacere lascerebbe un numero nudo -- la regola applicata a meta' -- su
    // tutte le schede nate prima del 15/09/2026, su quelle importate da file
    // e su quelle toccate dal foglio di consegna.
    expect(etichettaProvenienza({}, "price")).toBe(SENZA_SEGNO);
    expect(etichettaProvenienza(null, "price")).toBe("provenienza non registrata");
    expect(etichettaProvenienza({ price: { fonte: "sballata" } }, "price")).toBe(SENZA_SEGNO);
  });

  it("le quattro fonti dicono ciascuna la sua", () => {
    expect(etichettaProvenienza({ a: { fonte: "dealer" } }, "a")).toBe("scritto da te");
    expect(etichettaProvenienza({ a: { fonte: "sito" } }, "a")).toBe("dal tuo sito · da confermare");
    expect(etichettaProvenienza({ a: { fonte: "sito", confermato_il: "2026-09-18" } }, "a")).toBe("dal tuo sito");
    expect(etichettaProvenienza({ a: { fonte: "dedotto" } }, "a")).toBe("deciso dal tuo sito · da confermare");
    expect(etichettaProvenienza({ a: { fonte: "feed" } }, "a")).toBe("dal tuo feed · da confermare");
  });

  it("un campo vuoto dice perche' e' vuoto, non da dove sarebbe venuto", () => {
    // Sono due domande diverse. Accanto a un trattino, "provenienza non
    // registrata" risponde a una che nessuno ha fatto: chi guarda vuole
    // sapere perche' il dato non c'e'. E la ragione cambia: su un'auto
    // agganciata a un sito il dato manca perche' il sito non lo dichiara, su
    // una scritta a mano perche' nessuno l'ha scritto.
    expect(notaDelCampo({}, "color", null, true)).toBe("il tuo sito non lo dichiara");
    expect(notaDelCampo({}, "color", "", true)).toBe("il tuo sito non lo dichiara");
    expect(notaDelCampo({}, "equipment", [], true)).toBe("il tuo sito non lo dichiara");
    expect(notaDelCampo({}, "color", null, false)).toBe("non e' stato indicato");
    // Con un valore, torna la provenienza.
    expect(notaDelCampo({ color: { fonte: "sito" } }, "color", "Rosso", true)).toBe("dal tuo sito · da confermare");
    expect(notaDelCampo({}, "color", "Rosso", true)).toBe(SENZA_SEGNO);
    // Zero e' un valore, non un vuoto.
    expect(notaDelCampo({ price: { fonte: "dealer" } }, "price", 0, true)).toBe("scritto da te");
  });

  it("una data si scrive senza passare dal fuso di chi guarda", () => {
    // "2026-02-12" letta come mezzanotte UTC diventa l'11 febbraio per chi
    // sta a ovest di Greenwich: la data d'ingresso di un'auto entrata il
    // primo del mese risulterebbe dell'ultimo giorno del mese prima.
    expect(giornoDaMostrare("2026-02-12")).toBe("12/02/2026");
    expect(giornoDaMostrare("2026-02-12T00:00:00Z")).toBe("12/02/2026");
    expect(giornoDaMostrare(null)).toBeNull();
    expect(giornoDaMostrare("non una data")).toBeNull();
  });

  it("un numero contato da noi dice da cosa l'abbiamo contato", () => {
    // Due numeri calcolati sulla stessa schermata da due date diverse --
    // l'ingresso dal sito e l'acquisto scritto a mano -- si leggono come lo
    // stesso numero se non si dice da dove vengono.
    expect(calcolatoDaKeyAuto()).toBe("calcolato da KeyAuto");
    expect(calcolatoDaKeyAuto("dalla data d'ingresso dichiarata dal tuo sito")).toBe(
      "calcolato da KeyAuto dalla data d'ingresso dichiarata dal tuo sito",
    );
  });
});

describe("il disaccordo dice chi non e' d'accordo", () => {
  it("lo legge solo dove esiste davvero", () => {
    // Su un campo che arriva dal sito il sito non e' in disaccordo con se
    // stesso: lo riscrive e basta.
    expect(disaccordo({ price: { fonte: "sito", il_sito_dice: { valore: "1", visto_il: "x" } } }, "price")).toBeNull();
    expect(disaccordo({ price: { fonte: "dealer" } }, "price")).toBeNull();
    expect(disaccordo({}, "price")).toBeNull();
  });

  it("porta il valore, il giorno e la fonte", () => {
    const esito = scriviDalSito(
      { price: { fonte: "dealer" } },
      { price: 18900 },
      dalSito({ price: 19400 }, "feed"),
      "2026-09-18",
    );
    expect(disaccordo(esito.origineDati, "price")).toEqual({ valore: "19400", vistoIl: "2026-09-18", fonte: "feed" });
  });

  it("la frase cambia con chi l'ha detto, e non sceglie per default", () => {
    // "Il tuo sito ora dice" a una concessionaria che manda un feed e' una
    // provenienza sbagliata, peggio di nessuna.
    expect(fraseDelDisaccordo("19.400 €", "sito")).toBe("Il tuo sito ora dice 19.400 €: sul marketplace vale il tuo.");
    expect(fraseDelDisaccordo("19.400 €", "feed")).toBe("Il tuo feed ora dice 19.400 €: sul marketplace vale il tuo.");
    expect(fraseDelDisaccordo("19.400 €", null)).toBe("Dove l'abbiamo letto ora dice 19.400 €: sul marketplace vale il tuo.");
  });
});

describe("la giacenza ha due frasi, e per tutto il resto tace", () => {
  it("dichiarata e dedotta non si confondono mai", () => {
    expect(fraseIngresso(214, "sito")).toBe("In piazzale da 214 giorni");
    expect(fraseIngresso(88, "dedotto")).toBe("In vetrina sul tuo sito da almeno 88 giorni");
    expect(fraseIngresso(1, "sito")).toBe("In piazzale da 1 giorno");
    expect(fraseIngresso(0, "sito")).toBe("In piazzale da oggi");
    expect(fraseIngresso(0, "dedotto")).toBe("In vetrina sul tuo sito da oggi");
  });

  it("niente frase per una fonte che non dice da quando e' in piazzale", () => {
    // Oggi `feed` e `dealer` su questo campo non esistono; domani potrebbero.
    // Il ripiego su "In piazzale da" sarebbe una misura inventata.
    expect(fraseIngresso(50, "feed")).toBeNull();
    expect(fraseIngresso(50, "dealer")).toBeNull();
    expect(fraseIngresso(50, null)).toBeNull();
  });

  it("niente frase e nessuno zero quando i giorni non ci sono o sono impossibili", () => {
    expect(fraseIngresso(null, "sito")).toBeNull();
    expect(fraseIngresso(-3, "sito")).toBeNull();
  });

  it("e il trattino non resta mai da solo: dice perche'", () => {
    expect(percheNienteIngresso({ enteredOn: null, fonte: null, giorni: null })).toBe(
      "il tuo sito non dice quando e' entrata",
    );
    expect(percheNienteIngresso({ enteredOn: "2026-01-10", fonte: "sito", giorni: -3 })).toBe(
      "la data d'ingresso e' nel futuro",
    );
    expect(percheNienteIngresso({ enteredOn: "2026-01-10", fonte: "feed", giorni: 5 })).toBe(
      "non sappiamo da dove arriva questa data",
    );
    expect(percheNienteIngresso({ enteredOn: "2026-01-10", fonte: "sito", giorni: 5 })).toBeNull();
  });
});

describe("il prezzo che manca non vale zero", () => {
  it("un'auto senza prezzo non dichiara 0 €", () => {
    // Era a video da mesi: formatCurrency(Number(price ?? 0)). Accanto a una
    // dicitura di provenienza sarebbe diventato un numero finto firmato.
    expect(prezzoDaMostrare(null)).toEqual({ testo: "—", perche: "nessun prezzo indicato" });
    expect(prezzoDaMostrare("")).toEqual({ testo: "—", perche: "nessun prezzo indicato" });
    expect(prezzoDaMostrare("non un numero")).toEqual({ testo: "—", perche: "nessun prezzo indicato" });
  });

  it("ma zero scritto e' un dato e si mostra", () => {
    expect(prezzoDaMostrare(0).perche).toBeNull();
    expect(prezzoDaMostrare(0).testo).toContain("0");
    expect(prezzoDaMostrare("9500.00").testo).toBe(prezzoDaMostrare(9500).testo);
  });
});

describe("l'immatricolazione non inventa il giorno", () => {
  it("da una fonte automatica si scrive il mese, non il primo del mese", () => {
    // Il sito dichiara "2022-01-01" per tutto cio' che e' immatricolato a
    // gennaio 2022: quel "01" non e' un giorno.
    const auto = { registration_date: "2022-01-01", registration_month: null, year: 2022 };
    expect(immatricolazioneDaMostrare(auto, "sito")).toBe("01/2022");
    expect(immatricolazioneDaMostrare(auto, "dedotto")).toBe("01/2022");
    expect(immatricolazioneDaMostrare(auto, "feed")).toBe("01/2022");
  });

  it("quella scritta dal concessionario si mostra per intero", () => {
    expect(immatricolazioneDaMostrare({ registration_date: "2022-03-17" }, "dealer")).toBe("17/03/2022");
    // Senza segno si mostra cio' che c'e' scritto, e la dicitura accanto dira'
    // che la provenienza non e' registrata.
    expect(immatricolazioneDaMostrare({ registration_date: "2022-03-17" }, null)).toBe("17/03/2022");
  });

  it("il giorno non cambia con il fuso di chi guarda", () => {
    // La scheda gira nel browser: "2022-01-01" letta come mezzanotte UTC
    // diventa il 31 dicembre per chi sta a ovest di Greenwich.
    expect(immatricolazioneDaMostrare({ registration_date: "2022-01-01" }, "dealer")).toBe("01/01/2022");
  });

  it("senza data piena resta quello che si sa", () => {
    expect(immatricolazioneDaMostrare({ registration_month: 9, year: 2018 }, "sito")).toBe("09/2018");
    expect(immatricolazioneDaMostrare({ year: 2018 }, "sito")).toBe("2018");
    expect(immatricolazioneDaMostrare({}, "sito")).toBeNull();
  });

  it("e la provenienza segue il campo che ha prodotto la scritta", () => {
    // Un'auto importata da file ha solo l'anno: leggere il segno di
    // registration_date direbbe una fonte che quel campo non ha mai avuto.
    expect(campoDellImmatricolazione({ registration_date: "2022-01-01", year: 2022 })).toBe("registration_date");
    expect(campoDellImmatricolazione({ registration_month: 9, year: 2018 })).toBe("registration_month");
    expect(campoDellImmatricolazione({ year: 2018 })).toBe("year");
    expect(campoDellImmatricolazione({ registration_month: 13, year: 2018 })).toBe("year");
    expect(campoDellImmatricolazione({})).toBeNull();
  });
});

describe("il regime IVA vuoto non e' il margine", () => {
  it("i due valori si scrivono per esteso", () => {
    expect(regimeIvaDaMostrare("esposta", true)).toEqual({ testo: "IVA esposta", perche: null });
    expect(regimeIvaDaMostrare("margine", true)).toEqual({ testo: "Regime del margine", perche: null });
  });

  it("il vuoto dice perche' e' vuoto, e non diventa margine", () => {
    // Su Autogepy il campo e' vuoto su 117 auto su 122: tradurlo in "margine"
    // inventerebbe un dato fiscale su quasi tutto il parco.
    expect(regimeIvaDaMostrare(null, true)).toEqual({ testo: "—", perche: "il tuo sito non lo dichiara" });
    expect(regimeIvaDaMostrare(null, false)).toEqual({ testo: "—", perche: "non e' ancora stato indicato" });
    expect(regimeIvaDaMostrare("qualcos'altro", true).testo).toBe("—");
  });
});

/**
 * **Il guardiano promesso dalla migration e mai scritto.**
 *
 * `20260915010000` dice: "Nessuna pagina la legge a mano. Una funzione sola...
 * e un test che fallisce se qualcuno la interroga da un'altra parte". Quel
 * test non c'era, e la fetta che mostra i dati e' la prima lettura a schermo:
 * e' il momento in cui serve. Senza, "un posto solo" e' una decorazione e la
 * terza schermata leggera' `.fonte` per conto suo.
 */
describe("origine_dati si legge in un posto solo", () => {
  const CASA = "src/lib/provenienza-dati.ts";

  function sorgenti(cartella: string, raccolti: string[] = []): string[] {
    for (const nome of readdirSync(resolve(process.cwd(), cartella))) {
      const percorso = `${cartella}/${nome}`;
      if (statSync(resolve(process.cwd(), percorso)).isDirectory()) sorgenti(percorso, raccolti);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) raccolti.push(percorso);
    }
    return raccolti;
  }

  /** Il testo senza commenti: una spiegazione puo' nominare quello che vuole. */
  function senzaCommenti(testo: string): string {
    return testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  }

  it("nessun file legge il segno per conto suo", () => {
    const colpevoli: string[] = [];
    for (const percorso of sorgenti("src")) {
      if (percorso.endsWith(CASA)) continue;
      const testo = senzaCommenti(readFileSync(resolve(process.cwd(), percorso), "utf8"));
      const letture = [
        /origine_dati\s*(\?\.|\.|\[)/, // origine_dati.price, origine_dati?.["x"]
        /\bil_sito_dice\b/,
        /\bconfermato_il\b/,
      ].filter((forma) => forma.test(testo));
      if (letture.length > 0) colpevoli.push(percorso);
    }
    expect(
      colpevoli,
      `Questi file leggono origine_dati a mano invece di passare da ${CASA}:\n  ${colpevoli.join("\n  ")}\n` +
        "La forma del segno e' di quella libreria sola: letta da tre parti, fra sei mesi le tre diranno cose diverse.",
    ).toEqual([]);
  });

  it("e il guardiano vede davvero una lettura a mano", () => {
    // Un controllo mai visto rosso non e' un controllo.
    const finto = 'const fonte = vehicle.origine_dati.price.fonte;';
    expect(/origine_dati\s*(\?\.|\.|\[)/.test(senzaCommenti(finto))).toBe(true);
    expect(/origine_dati\s*(\?\.|\.|\[)/.test(senzaCommenti("// origine_dati.price.fonte"))).toBe(false);
    expect(/origine_dati\s*(\?\.|\.|\[)/.test("origine_dati: scrittura.origineDati")).toBe(false);
  });
});
