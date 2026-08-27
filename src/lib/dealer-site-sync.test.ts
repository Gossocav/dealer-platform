import { describe, expect, it } from "vitest";
import {
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaImportata,
} from "@/lib/dealer-site-sync";
import type { DealerSiteVehicle } from "@/lib/dealer-site-import";

/**
 * Il difetto che questi test impediscono: un'automobile venduta restava in
 * vetrina su KeyAuto. Il 27 agosto 2026, sulle 147 auto importate dai siti di
 * De Lorenzi e Autogepy, sette non erano piu' sui rispettivi siti ed erano
 * ancora pubblicate: un cliente poteva chiedere informazioni per un'auto che
 * non esiste piu'.
 */

const riga = (over: Partial<RigaImportata> & { id: string; import_source_id: string }): RigaImportata => ({
  status: "published",
  published: true,
  import_missing_since: null,
  ...over,
});

const archivio = (quante: number, primoId = 1) =>
  Array.from({ length: quante }, (_, i) => riga({ id: `v${primoId + i}`, import_source_id: `${primoId + i}` }));

describe("cosa si toglie dalla vetrina", () => {
  it("toglie l'auto che il sito non dichiara piu'", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: ["1", "2"],
      righe: [riga({ id: "v1", import_source_id: "1" }), riga({ id: "v3", import_source_id: "3" })],
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daNascondere).toEqual(["v3"]);
  });

  // Le auto gia' fuori vetrina non hanno niente da correggere, e lasciandole
  // stare il ripristino sa che una ritrovata va rimessa pubblicata.
  it("non tocca le auto che non erano in vetrina", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: ["1"],
      righe: [
        riga({ id: "bozza", import_source_id: "9", status: "draft", published: false }),
        riga({ id: "venduta", import_source_id: "8", status: "sold", published: false }),
      ],
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daNascondere).toEqual([]);
  });

  it("non la toglie due volte: chi porta gia' la data non si ritocca", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: ["1"],
      righe: [riga({ id: "v3", import_source_id: "3", import_missing_since: "2026-08-27T00:00:00.000Z" })],
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daNascondere).toEqual([]);
  });
});

describe("cosa torna in vetrina", () => {
  // Capita: una scheda che il sito ripubblica dopo qualche giorno, o una
  // lettura andata storta la volta prima.
  it("rimette l'auto che il sito dichiara di nuovo", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: ["3"],
      righe: [
        riga({
          id: "v3",
          import_source_id: "3",
          status: "in_review",
          published: false,
          import_missing_since: "2026-08-20T00:00:00.000Z",
        }),
      ],
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daRipristinare).toEqual(["v3"]);
    expect(esito.piano.daNascondere).toEqual([]);
  });

  it("non ripristina chi non avevamo mai tolto", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: ["1"],
      righe: [riga({ id: "v1", import_source_id: "1" })],
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daRipristinare).toEqual([]);
  });
});

/**
 * Le due reti di sicurezza. Senza, una lettura andata male di notte
 * svuoterebbe il marketplace di una concessionaria senza che nessuno abbia
 * chiesto niente -- ed e' esattamente la distinzione che l'importazione gia'
 * fa fra "il veicolo non c'e'" e "la lettura non e' riuscita".
 */
describe("quando NON si tocca niente", () => {
  it("se il sito non dichiara nessuna auto: non ha venduto tutto, non si e' fatto leggere", () => {
    const esito = pianoRiconciliazione({ idsSulSito: [], righe: archivio(30) });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toBe("elenco-vuoto");
    expect(esito.assenti).toBe(30);
  });

  it("se piu' della meta' dello stock sparisce insieme: e' un sito che ha rifatto gli indirizzi", () => {
    // 30 in archivio, il sito ne dichiara 14: sedici sparite in un colpo.
    const esito = pianoRiconciliazione({
      idsSulSito: Array.from({ length: 14 }, (_, i) => `${i + 1}`),
      righe: archivio(30),
    });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toBe("sparizione-sospetta");
    expect(esito.assenti).toBe(16);
    expect(esito.totale).toBe(30);
  });

  it("esattamente la meta' passa: e' il limite, non il superamento", () => {
    const esito = pianoRiconciliazione({
      idsSulSito: Array.from({ length: 15 }, (_, i) => `${i + 1}`),
      righe: archivio(30),
    });

    expect(esito.ok).toBe(true);
  });

  // Con quattro auto in archivio, tre vendute sono una settimana buona, non
  // un guasto: il freno della sparizione in massa qui non deve scattare.
  it("su un archivio piccolo il freno non scatta", () => {
    const esito = pianoRiconciliazione({ idsSulSito: ["1"], righe: archivio(4) });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.piano.daNascondere).toEqual(["v2", "v3", "v4"]);
  });
});

describe("come si scrive il cambiamento", () => {
  const adesso = new Date("2026-08-27T09:00:00.000Z");

  // Venduta e' probabile, non certo: dichiararla venduta la farebbe entrare
  // nei conti delle vendite come se fosse successo davvero. Archiviata
  // nemmeno: da li' non si torna indietro.
  it("l'auto sparita va in revisione, non venduta ne' archiviata", () => {
    const campi = campiVeicoloSparito(adesso);

    expect(campi.status).toBe("in_review");
    expect(campi.published).toBe(false);
    expect(campi.import_missing_since).toBe("2026-08-27T09:00:00.000Z");
  });

  it("l'auto ritrovata torna pubblicata e perde la data di sparizione", () => {
    const campi = campiVeicoloRitrovato(adesso);

    expect(campi.status).toBe("published");
    expect(campi.published).toBe(true);
    expect(campi.import_missing_since).toBeNull();
  });
});

/**
 * La sincronizzazione notturna gira da sola: se potesse toccare la
 * pubblicazione, un suo errore toglierebbe dal marketplace lo stock di una
 * concessionaria senza che nessuno abbia chiesto niente. Non puo' toccarla
 * perche' quei campi non esistono in quello che scrive.
 */
describe("cosa la sincronizzazione puo' scrivere", () => {
  const veicolo = {
    sourceId: "7699913",
    url: "https://www.autogepy.it/auto/km0/parma/jeep/avenger/benzina/1-2-turbo-altitude/7699913/",
    condition: "Km/0",
    name: "Jeep Avenger 1.2 Turbo Altitude",
    brand: "Jeep",
    model: "Avenger",
    price: 24900,
    mileage: 0,
    fuel: "Benzina",
    transmission: "Manuale",
    doors: 5,
    seats: 5,
    color: "Bianco",
    bodyType: "SUV",
    year: 2025,
    registrationMonth: "03",
    description: "Vettura km 0",
    images: [],
  } as unknown as DealerSiteVehicle;

  it("i dati si', la pubblicazione no", () => {
    const payload = payloadDatiVeicolo(veicolo);

    expect(payload.price).toBe(24900);
    expect(payload.registration_month).toBe("03");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("published");
    expect(payload).not.toHaveProperty("dealer_id");
  });

  it("la versione non ripete marca e modello", () => {
    expect(payloadDatiVeicolo(veicolo).version).toBe("1.2 Turbo Altitude");
  });
});
