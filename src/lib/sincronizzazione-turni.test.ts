import { describe, expect, it } from "vitest";
import {
  aggiungiSaltate,
  chiaveSorgente,
  leggiCursore,
  ordinaARotazione,
  percorriFila,
  serveAncora,
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

describe("il rosso oltre le 24 ore", () => {
  const adesso = new Date("2026-09-10T14:08:00Z");

  it("Autogepy ferma dal 7 settembre viene segnalata, gli altri no", () => {
    const esito = sitiInRitardo(
      [
        { sito: "delorenziauto.it", dealerId: "dl", ultimaSincronizzazione: "2026-09-10T12:20:00Z" },
        { sito: "autogepy.it", dealerId: "ag", ultimaSincronizzazione: "2026-09-07T18:18:00Z" },
        { sito: "ponginibbigroup.it", dealerId: "po", ultimaSincronizzazione: "2026-09-10T12:21:00Z" },
      ],
      adesso,
    );

    expect(esito).toEqual([{ sito: "autogepy.it", dealerId: "ag", ultimaSincronizzazione: "2026-09-07T18:18:00Z", oreDiRitardo: 67 }]);
  });

  it("un sito mai sincronizzato e' in ritardo, senza inventare un numero di ore", () => {
    const esito = sitiInRitardo([{ sito: "nuovo.it", dealerId: "n", ultimaSincronizzazione: null }], adesso);
    expect(esito).toEqual([{ sito: "nuovo.it", dealerId: "n", ultimaSincronizzazione: null, oreDiRitardo: null }]);
  });

  it("ventiquattro ore esatte non sono ancora un ritardo", () => {
    expect(sitiInRitardo([{ sito: "x.it", dealerId: "x", ultimaSincronizzazione: "2026-09-09T14:08:00Z" }], adesso)).toEqual([]);
    expect(sitiInRitardo([{ sito: "x.it", dealerId: "x", ultimaSincronizzazione: "2026-09-09T14:07:59Z" }], adesso)).toHaveLength(1);
  });
});
