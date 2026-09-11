import { describe, expect, it } from "vitest";
import {
  aggiungiSaltate,
  chiaveSorgente,
  leggiCursore,
  ordinaARotazione,
  percorriFila,
  serveAncora,
  daSegnalareOggi,
  sitiInRitardo,
  type EsitoLetturaFila,
} from "@/lib/sincronizzazione-turni";

/**
 * Il blocco del 10/09/2026, riprodotto.
 *
 * Tre siti collegati. Dal 7 settembre il sito di Autogepy rispondeva "troppe
 * richieste" (429) a quasi ogni scheda: la sua fetta di tempo si consumava in
 * letture fallite, le stesse a ogni chiamata; il flag "ancora da fare"
 * restava acceso per lui, ogni run andava al tetto delle venti chiamate, il
 * riepilogo era verde, e le sue 140 auto non venivano aggiornate da tre
 * giorni. Nel riepilogo compariva per primo un altro sito, e sembrava fosse
 * quello a non finire mai.
 */

type Voce = { sourceId: string; url: string };
const voci = (prefisso: string, quante: number): Voce[] =>
  Array.from({ length: quante }, (_, i) => ({ sourceId: `${prefisso}-${i + 1}`, url: `https://www.${prefisso}/${i + 1}` }));

const pagina = (voce: Voce): EsitoLetturaFila => ({ ok: true, html: `<html>${voce.sourceId}</html>` });
const frenato: EsitoLetturaFila = { ok: false, motivo: "frenato" };
const nonLetta: EsitoLetturaFila = { ok: false, motivo: "non-letta" };

/** Un orologio finto: ogni lettura costa un secondo, il tempo finisce a `budget`. */
function orologio(budgetSecondi: number) {
  let adesso = 0;
  return {
    scaduto: () => adesso >= budgetSecondi,
    avanza: (secondi = 1) => {
      adesso += secondi;
    },
    letti: () => adesso,
  };
}

describe("un sito che frena non consuma il tempo degli altri", () => {
  it("il blocco di oggi: Autogepy risponde 429, De Lorenzi e Ponginibbi vengono serviti lo stesso", async () => {
    const siti = [
      { dealer_id: "dl", import_source: "delorenziauto.it", voci: voci("delorenziauto.it", 30) },
      { dealer_id: "ag", import_source: "autogepy.it", voci: voci("autogepy.it", 25) },
      { dealer_id: "po", import_source: "ponginibbigroup.it", voci: voci("ponginibbigroup.it", 20) },
    ];

    // Quarantacinque secondi in tutto, divisi in parti uguali: quindici a testa.
    const risultati = new Map<string, Awaited<ReturnType<typeof percorriFila>>>();
    for (const sito of siti) {
      const tempo = orologio(15);
      const esito = await percorriFila({
        voci: sito.voci,
        scaduto: tempo.scaduto,
        leggi: async (voce) => {
          tempo.avanza(1);
          // Autogepy: la prima passa, poi 429, come misurato il 10/09/2026.
          if (sito.import_source === "autogepy.it") return voce.sourceId.endsWith("-1") ? pagina(voce) : frenato;
          return pagina(voce);
        },
        elabora: async () => "fatta",
      });
      risultati.set(sito.import_source, esito);
    }

    const autogepy = risultati.get("autogepy.it")!;
    const deLorenzi = risultati.get("delorenziauto.it")!;
    const ponginibbi = risultati.get("ponginibbigroup.it")!;

    // Autogepy si ferma al primo 429 invece di bruciare quindici secondi.
    expect(autogepy.fermataPer).toBe("freno");
    expect(autogepy.esaminate).toBe(2);
    expect(autogepy.fatte).toBe(1);
    expect(autogepy.fallite).toEqual(["autogepy.it-2"]);

    // Gli altri due fanno il loro lavoro per intero nel tempo che hanno.
    expect(deLorenzi.fatte).toBe(15);
    expect(ponginibbi.fatte).toBe(15);
    expect(deLorenzi.fermataPer).toBeNull();
    expect(ponginibbi.fermataPer).toBeNull();
  });

  it("un sito che non risponde mai non tiene acceso 'ancora da fare' per tutti", async () => {
    const tempo = orologio(15);
    const esito = await percorriFila({
      voci: voci("fermo.it", 25),
      scaduto: tempo.scaduto,
      leggi: async () => {
        tempo.avanza(1);
        return frenato;
      },
      elabora: async () => "fatta",
    });

    expect(esito.fatte).toBe(0);
    expect(esito.restanti).toBe(25);
    // Restano venticinque schede, ma richiamare non servirebbe a niente.
    expect(serveAncora(esito)).toBe(false);
  });

  it("tre pagine non lette di fila fermano il sito, senza aspettare che il tempo finisca", async () => {
    const tempo = orologio(60);
    const esito = await percorriFila({
      voci: voci("giu.it", 40),
      scaduto: tempo.scaduto,
      leggi: async () => {
        tempo.avanza(1);
        return nonLetta;
      },
      elabora: async () => "fatta",
    });

    expect(esito.fermataPer).toBe("letture-fallite");
    expect(esito.esaminate).toBe(3);
    expect(tempo.letti()).toBe(3);
  });

  it("una pagina non letta ogni tanto non ferma un sito che funziona", async () => {
    const tempo = orologio(60);
    const esito = await percorriFila({
      voci: voci("ok.it", 12),
      scaduto: tempo.scaduto,
      leggi: async (voce) => {
        tempo.avanza(1);
        return voce.sourceId.endsWith("-4") || voce.sourceId.endsWith("-8") ? nonLetta : pagina(voce);
      },
      elabora: async () => "fatta",
    });

    expect(esito.fermataPer).toBeNull();
    expect(esito.fatte).toBe(10);
    expect(esito.fallite).toEqual(["ok.it-4", "ok.it-8"]);
    // Le due fallite restano da fare: il run dopo le ritenta.
    expect(esito.restanti).toBe(2);
  });

  it("il tetto del piano ferma le importazioni e non lascia niente 'da fare'", async () => {
    // Ponginibbi dal 04/09/2026: 71 auto sul sito, piano da 50. Ventuno auto
    // che il database rifiuta a ogni chiamata, contate come "restanti" per
    // sempre: era la prima delle due cause del tetto a venti chiamate.
    const tempo = orologio(60);
    let inserite = 0;
    const esito = await percorriFila({
      voci: voci("ponginibbigroup.it", 21),
      scaduto: tempo.scaduto,
      leggi: async (voce) => {
        tempo.avanza(1);
        return pagina(voce);
      },
      elabora: async () => {
        if (inserite >= 3) return "fermati";
        inserite += 1;
        return "fatta";
      },
    });

    expect(esito.fermataPer).toBe("tetto");
    expect(esito.fatte).toBe(3);
    expect(esito.restanti).toBe(0);
    expect(serveAncora(esito)).toBe(false);
  });

  it("il tempo finito a meta' fila lascia le altre da fare, e vale la pena richiamare", async () => {
    const tempo = orologio(5);
    const esito = await percorriFila({
      voci: voci("grande.it", 100),
      scaduto: tempo.scaduto,
      leggi: async (voce) => {
        tempo.avanza(1);
        return pagina(voce);
      },
      elabora: async () => "fatta",
    });

    expect(esito.interrotta).toBe(true);
    expect(esito.fatte).toBe(5);
    expect(esito.restanti).toBe(95);
    expect(serveAncora(esito)).toBe(true);
  });

  it("un sito che non ha nemmeno iniziato merita un'altra chiamata", () => {
    expect(serveAncora({ restanti: 40, fatte: 0, esaminate: 0 })).toBe(true);
  });
});

describe("i turni ruotano", () => {
  const siti = [
    { dealer_id: "dl", import_source: "delorenziauto.it" },
    { dealer_id: "ag", import_source: "autogepy.it" },
    { dealer_id: "po", import_source: "ponginibbigroup.it" },
  ];

  it("il primo turno passa al sito successivo a ogni chiamata", () => {
    const primaChiamata = ordinaARotazione(siti, chiaveSorgente, null);
    expect(primaChiamata.map((s) => s.import_source)).toEqual(["delorenziauto.it", "autogepy.it", "ponginibbigroup.it"]);

    const seconda = ordinaARotazione(siti, chiaveSorgente, chiaveSorgente(primaChiamata[0]));
    expect(seconda.map((s) => s.import_source)).toEqual(["autogepy.it", "ponginibbigroup.it", "delorenziauto.it"]);

    const terza = ordinaARotazione(siti, chiaveSorgente, chiaveSorgente(seconda[0]));
    expect(terza.map((s) => s.import_source)).toEqual(["ponginibbigroup.it", "delorenziauto.it", "autogepy.it"]);

    const quarta = ordinaARotazione(siti, chiaveSorgente, chiaveSorgente(terza[0]));
    expect(quarta.map((s) => s.import_source)).toEqual(["delorenziauto.it", "autogepy.it", "ponginibbigroup.it"]);
  });

  it("se il sito di partenza non c'e' piu', si riparte dall'inizio", () => {
    expect(ordinaARotazione(siti, chiaveSorgente, "xx|scollegato.it").map((s) => s.import_source)).toEqual([
      "delorenziauto.it",
      "autogepy.it",
      "ponginibbigroup.it",
    ]);
  });
});

describe("il cursore fra una chiamata e l'altra", () => {
  it("ricorda cosa e' fallito, senza fidarsi della forma in cui arriva", () => {
    expect(leggiCursore(null)).toEqual({ dopo: null, saltate: {} });
    expect(leggiCursore("spazzatura")).toEqual({ dopo: null, saltate: {} });
    expect(leggiCursore({ dopo: 42, saltate: { "ag|autogepy.it": ["a", 7, "", "b"] } })).toEqual({
      dopo: null,
      saltate: { "ag|autogepy.it": ["a", "b"] },
    });
    expect(leggiCursore({ dopo: " dl|delorenziauto.it ", saltate: "no" })).toEqual({
      dopo: "dl|delorenziauto.it",
      saltate: {},
    });
  });

  it("accumula le fallite senza doppioni e senza crescere all'infinito", () => {
    let cursore = leggiCursore(null);
    cursore = aggiungiSaltate(cursore, "ag|autogepy.it", ["a", "b"]);
    cursore = aggiungiSaltate(cursore, "ag|autogepy.it", ["b", "c"]);
    expect(cursore.saltate["ag|autogepy.it"]).toEqual(["a", "b", "c"]);

    const tante = Array.from({ length: 500 }, (_, i) => `id-${i}`);
    cursore = aggiungiSaltate(cursore, "ag|autogepy.it", tante);
    expect(cursore.saltate["ag|autogepy.it"].length).toBe(200);
    expect(cursore.saltate["ag|autogepy.it"].at(-1)).toBe("id-499");
  });
});

describe("chi e' fermo, e quando lo si grida", () => {
  const adesso = new Date("2026-09-10T14:08:00Z");
  const stato = (sito: string, ultima: string | null, schede: number, fresche: number) => ({
    sito,
    dealerId: sito.slice(0, 2),
    ultimaSincronizzazione: ultima,
    schede,
    schedeFresche: fresche,
  });

  /**
   * Il difetto che questi test impediscono, misurato il 10/09/2026: guardando
   * la scheda piu' recente, un sito che lascia passare una lettura su venti
   * risulta "sincronizzato un minuto fa". E' esattamente quello che faceva il
   * sito di Autogepy, e il controllo nato per accorgersene non se ne
   * accorgeva.
   */
  it("un sito che rilegge una scheda su venti risulta fermo lo stesso", () => {
    const esito = sitiInRitardo(
      [
        // Autogepy: 153 schede, otto rilette in un giorno, ma l'ultima e' di un minuto fa.
        stato("autogepy.it", "2026-09-10T14:07:00Z", 153, 8),
        // De Lorenzi: il giro si chiude, tutto a posto.
        stato("delorenziauto.it", "2026-09-10T12:20:00Z", 97, 97),
      ],
      adesso,
    );

    expect(esito.map((s) => s.sito)).toEqual(["autogepy.it"]);
    expect(esito[0].schedeFresche).toBe(8);
    expect(esito[0].schede).toBe(153);
  });

  it("una scheda sola che non si lascia leggere non fa gridare al lupo", () => {
    expect(sitiInRitardo([stato("x.it", "2026-09-10T13:00:00Z", 100, 99)], adesso)).toEqual([]);
  });

  it("un terzo dello stock e' il confine", () => {
    expect(sitiInRitardo([stato("x.it", "2026-09-10T13:00:00Z", 90, 30)], adesso)).toEqual([]);
    expect(sitiInRitardo([stato("x.it", "2026-09-10T13:00:00Z", 90, 29)], adesso)).toHaveLength(1);
  });

  it("un sito senza schede non e' in ritardo: non c'e' niente da tenere fresco", () => {
    expect(sitiInRitardo([stato("nuovo.it", null, 0, 0)], adesso)).toEqual([]);
  });

  it("un sito mai sincronizzato e' in ritardo, senza inventare un numero di ore", () => {
    const esito = sitiInRitardo([stato("nuovo.it", null, 20, 0)], adesso);
    expect(esito).toHaveLength(1);
    expect(esito[0].oreDiRitardo).toBeNull();
  });

  it("dice da quante ore risale la scheda piu' recente", () => {
    const esito = sitiInRitardo([stato("autogepy.it", "2026-09-07T18:18:00Z", 153, 0)], adesso);
    expect(esito[0].oreDiRitardo).toBe(67);
  });
});

/**
 * Il lavoro gira ogni tre ore. Senza freno, un sito bloccato manda otto avvisi
 * al giorno: e' il modo di far smettere di leggerli.
 */
describe("un avviso al giorno, non otto", () => {
  const fermo = [{ sito: "autogepy.it", dealerId: "ag", ultimaSincronizzazione: "2026-09-07T18:18:00Z", schede: 153, schedeFresche: 0, oreDiRitardo: 67 }];

  it("si grida al giro di mezzanotte, e a nessun altro", () => {
    const giri = [0, 3, 6, 9, 12, 15, 18, 21];
    const gridati = giri.filter((ora) => daSegnalareOggi(fermo, new Date(`2026-09-10T${String(ora).padStart(2, "0")}:00:00Z`)).length > 0);
    expect(gridati).toEqual([0]);
  });

  it("il giro di mezzanotte resta tale anche se parte in ritardo", () => {
    // GitHub fa partire i lavori programmati in ritardo: mezzanotte puo'
    // diventare l'una passata. Quello delle tre invece non deve gridare.
    expect(daSegnalareOggi(fermo, new Date("2026-09-10T00:47:00Z"))).toHaveLength(1);
    expect(daSegnalareOggi(fermo, new Date("2026-09-10T01:20:00Z"))).toHaveLength(1);
    expect(daSegnalareOggi(fermo, new Date("2026-09-10T03:40:00Z"))).toHaveLength(0);
  });

  it("un giro lanciato a mano dice sempre come stanno le cose", () => {
    expect(daSegnalareOggi(fermo, new Date("2026-09-10T15:00:00Z"), { aMano: true })).toHaveLength(1);
  });

  it("in una settimana intera arriva un avviso al giorno, sette in tutto", () => {
    let quanti = 0;
    for (let giorno = 1; giorno <= 7; giorno += 1)
      for (const ora of [0, 3, 6, 9, 12, 15, 18, 21]) {
        const quando = new Date(`2026-09-0${giorno}T${String(ora).padStart(2, "0")}:00:00Z`);
        quanti += daSegnalareOggi(fermo, quando).length;
      }
    expect(quanti).toBe(7);
  });

  it("se non c'e' nessuno in ritardo non si grida, nemmeno a mezzanotte", () => {
    expect(daSegnalareOggi([], new Date("2026-09-10T00:00:00Z"))).toEqual([]);
  });
});
