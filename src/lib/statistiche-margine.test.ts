import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anniConVendite,
  annoCorrente,
  inPerdita,
  meseCorrente,
  meseDi,
  mesiConVendite,
  migliori,
  nomeDelMese,
  peggiori,
  nomeBreveDelMese,
  riepilogoAnnuale,
  riepilogoDelMese,
  senzaDataDiVendita,
  type ContoVenduto,
} from "@/lib/statistiche-margine";

function conto(campi: Partial<ContoVenduto> = {}): ContoVenduto {
  return {
    vehicleId: "v1",
    etichetta: "Audi A3",
    saleDate: "2026-08-12",
    salePrice: 24900,
    totalCost: 21200,
    margin: 3700,
    ...campi,
  };
}

describe("il conto del mese", () => {
  const conti = [
    conto({ vehicleId: "a", salePrice: 24900, totalCost: 21200, margin: 3700 }),
    conto({ vehicleId: "b", salePrice: 15000, totalCost: 13500, margin: 1500 }),
    conto({ vehicleId: "c", saleDate: "2026-07-30", margin: 9999 }),
  ];

  it("somma ricavo, costo e margine del solo mese chiesto", () => {
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.venduti).toBe(2);
    expect(r.ricavo).toBe(39900);
    expect(r.costo).toBe(34700);
    expect(r.margine).toBe(5200);
  });

  it("la marginalita' e' sul venduto, non sul costo", () => {
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.marginePercentuale).toBeCloseTo(13.03, 2);
    expect(r.marginePerVettura).toBe(2600);
  });

  it("un mese senza vendite non e' un errore", () => {
    const r = riepilogoDelMese(conti, "2026-01");
    expect(r.venduti).toBe(0);
    expect(r.margine).toBe(0);
    expect(r.marginePercentuale).toBeNull();
    expect(r.marginePerVettura).toBeNull();
  });
});

/**
 * Il principio che governa tutto il modulo, ed e' lo stesso della scheda del
 * singolo veicolo: **un dato che manca non vale zero**.
 *
 * Il titolare ha deciso il 31/08/2026 che i conti economici sono facoltativi:
 * una vettura si chiude con la sola targa. Quindi ci saranno sempre vendute
 * senza prezzo, e trattarle come margine zero abbasserebbe la media di tutte
 * le altre dicendo una cifra falsa.
 */
describe("una vendita senza prezzo non vale margine zero", () => {
  const conti = [
    conto({ vehicleId: "a", margin: 3000, salePrice: 20000, totalCost: 17000 }),
    conto({ vehicleId: "b", margin: null, salePrice: null, totalCost: null }),
  ];

  it("resta fuori dal calcolo", () => {
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.margine).toBe(3000);
    expect(r.marginePerVettura).toBe(3000);
  });

  it("ma si dice quante sono, e perche'", () => {
    // Un numero accanto al quale c'e' scritto "di cui una senza prezzo" e' un
    // numero di cui ci si puo' fidare. Senza quella nota, il concessionario
    // crederebbe di aver venduto due auto con quel margine.
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.venduti).toBe(2);
    expect(r.conMargine).toBe(1);
    expect(r.senzaConto).toBe(1);
  });

  it("non entra nelle classifiche", () => {
    // Non sono "le peggiori": sono quelle di cui non sappiamo niente, e
    // metterle in fondo a una classifica sarebbe un giudizio inventato.
    expect(migliori(conti).map((c) => c.vehicleId)).toEqual(["a"]);
    expect(peggiori(conti).map((c) => c.vehicleId)).toEqual(["a"]);
  });
});

describe("una vendita senza data non appartiene a nessun mese", () => {
  it("non finisce in nessun riepilogo", () => {
    // Attribuirla d'ufficio al mese corrente sposterebbe soldi da un mese
    // all'altro.
    const conti = [conto({ saleDate: null })];
    expect(riepilogoDelMese(conti, meseCorrente()).venduti).toBe(0);
    expect(riepilogoDelMese(conti, "2026-08").venduti).toBe(0);
    expect(mesiConVendite(conti)).toEqual([]);
  });
});

describe("le classifiche", () => {
  const conti = [
    conto({ vehicleId: "a", etichetta: "Audi", margin: 3700 }),
    conto({ vehicleId: "b", etichetta: "Fiat", margin: -800 }),
    conto({ vehicleId: "c", etichetta: "Jeep", margin: 5200 }),
  ];

  it("le migliori sono in testa, le peggiori in coda", () => {
    expect(migliori(conti, 2).map((c) => c.etichetta)).toEqual(["Jeep", "Audi"]);
    expect(peggiori(conti, 2).map((c) => c.etichetta)).toEqual(["Fiat", "Audi"]);
  });

  it("le vendite in perdita si contano a parte", () => {
    // Sono quelle su cui serve guardare, e in una classifica delle peggiori
    // si confonderebbero con quelle che hanno solo reso poco.
    expect(inPerdita(conti).map((c) => c.etichetta)).toEqual(["Fiat"]);
  });
});

describe("i mesi", () => {
  it("si ricavano dalla data di vendita, dal piu' recente", () => {
    const conti = [conto({ saleDate: "2026-06-01" }), conto({ saleDate: "2026-08-31" }), conto({ saleDate: "2026-07-15" })];
    expect(mesiConVendite(conti)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("si scrivono come li legge un italiano", () => {
    expect(nomeDelMese("2026-08")).toBe("agosto 2026");
    expect(nomeDelMese("2026-01")).toBe("gennaio 2026");
  });

  it("il mese corrente ha due cifre anche a gennaio", () => {
    expect(meseCorrente(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01");
    expect(meseDi("2026-01-05")).toBe("2026-01");
    expect(meseDi(null)).toBeNull();
  });
});

/**
 * Il nome "senzaPrezzo" e' invecchiato male nel giro di un'ora: quando l'ho
 * scritto il margine dipendeva dal solo prezzo di vendita, e poco dopo ha
 * cominciato a esigere anche quello di acquisto.
 *
 * In produzione c'era gia' il caso: una vettura venduta a 11.500 con
 * l'acquisto mai inserito. Il messaggio le avrebbe detto di scrivere il
 * prezzo di vendita -- che c'era gia' -- mandandola a cercare un dato
 * inesistente.
 */
describe("il conto del mese dice cosa manca davvero", () => {
  const carta = readFileSync(resolve(process.cwd(), "src/components/dashboard/margin-summary.tsx"), "utf8");

  it("non attribuisce la colpa al solo prezzo di vendita", () => {
    expect(carta).not.toContain("non hanno il prezzo di vendita");
    expect(carta).toContain("manca il prezzo di acquisto o quello");
  });

  it("una venduta con il solo prezzo di vendita resta fuori e viene contata", () => {
    const conti = [
      { vehicleId: "a", etichetta: "Audi", saleDate: "2026-08-27", salePrice: 11500, totalCost: 0, margin: null },
      { vehicleId: "b", etichetta: "Jeep", saleDate: "2026-08-29", salePrice: 50000, totalCost: 49000, margin: 1000 },
    ];
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.venduti).toBe(2);
    expect(r.senzaConto).toBe(1);
    expect(r.margine).toBe(1000);
  });
});

/**
 * Il conto dell'anno, mese per mese: chiesto dal titolare il 31/08/2026.
 * Le statistiche danno il conto di **un** mese; qui si vede l'andamento.
 */
describe("il conto dell'anno", () => {
  const conti = [
    conto({ vehicleId: "a", saleDate: "2026-08-12", salePrice: 24900, totalCost: 21200, margin: 3700 }),
    conto({ vehicleId: "b", saleDate: "2026-08-29", salePrice: 15000, totalCost: 13500, margin: 1500 }),
    conto({ vehicleId: "c", saleDate: "2026-06-03", salePrice: 10000, totalCost: 9000, margin: 1000 }),
    conto({ vehicleId: "d", saleDate: "2025-12-20", salePrice: 99000, totalCost: 1, margin: 98999 }),
  ];

  it("una riga per mese, in ordine di calendario", () => {
    const { mesi } = riepilogoAnnuale(conti, "2026");
    expect(mesi.map((r) => r.mese)).toEqual(["2026-06", "2026-08"]);
    expect(mesi[1].venduti).toBe(2);
    expect(mesi[1].margine).toBe(5200);
  });

  it("compaiono solo i mesi in cui si e' venduto", () => {
    // Dodici righe di zeri non raccontano niente e nascondono le poche che
    // contano.
    expect(riepilogoAnnuale(conti, "2026").mesi).toHaveLength(2);
  });

  it("il totale e' dell'anno, non di tutta la storia", () => {
    const { totale } = riepilogoAnnuale(conti, "2026");
    expect(totale.venduti).toBe(3);
    expect(totale.margine).toBe(6200);
    expect(totale.ricavo).toBe(49900);
    // Il 2025 resta fuori: quei 98.999 non devono comparire nel 2026.
    expect(totale.margine).not.toBe(105199);
  });

  it("un anno senza vendite non e' un errore", () => {
    const { mesi, totale } = riepilogoAnnuale(conti, "2024");
    expect(mesi).toEqual([]);
    expect(totale.venduti).toBe(0);
    expect(totale.marginePercentuale).toBeNull();
  });

  it("gli anni si ricavano dalle vendite, dal piu' recente", () => {
    expect(anniConVendite(conti)).toEqual(["2026", "2025"]);
    expect(annoCorrente(new Date("2026-08-31T10:00:00Z"))).toBe("2026");
  });

  it("i mesi si scrivono per esteso, senza l'anno che e' gia' in cima", () => {
    expect(nomeBreveDelMese("2026-08")).toBe("agosto");
    expect(nomeBreveDelMese("2026-01")).toBe("gennaio");
  });
});

/**
 * Le vendute senza data non appartengono a nessun mese e non comparirebbero
 * mai in nessun riepilogo. Sono vendite vere: vanno trovate per essere
 * completate, non nascoste.
 */
describe("le vendute senza data si trovano lo stesso", () => {
  it("si raccolgono a parte", () => {
    const conti = [conto({ vehicleId: "a" }), conto({ vehicleId: "b", saleDate: null })];
    expect(senzaDataDiVendita(conti).map((c) => c.vehicleId)).toEqual(["b"]);
  });

  it("e non finiscono in nessun anno", () => {
    const conti = [conto({ saleDate: null })];
    expect(riepilogoAnnuale(conti, annoCorrente()).totale.venduti).toBe(0);
    expect(anniConVendite(conti)).toEqual([]);
  });
});

/**
 * La pagina parte dai **veicoli venduti**, non dai conti economici.
 *
 * Un'auto venduta senza conto compilato e' comunque venduta: partendo dai
 * conti sparirebbe dall'elenco, e la pagina direbbe di aver venduto meno di
 * quanto si e' venduto. Il titolare ha chiesto "un quadro completo", e un
 * quadro a cui mancano delle auto non lo e'.
 */
describe("l'elenco delle vendite e' completo", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/components/dashboard/sales-report-page.tsx"), "utf8");
  // La lettura si e' spostata in un aggancio condiviso quando e' nato il
  // foglio da stampare: la pagina a schermo e la carta devono partire dagli
  // stessi numeri. La regola che questo test difende non e' cambiata, e' solo
  // scritta in un file diverso.
  const lettura = readFileSync(
    resolve(process.cwd(), "src/components/dashboard/vendite-della-concessionaria.tsx"),
    "utf8"
  );

  it("legge i veicoli venduti e vi aggancia il conto, non il contrario", () => {
    expect(lettura).toContain('.from("vehicles")');
    expect(lettura).toContain('.in("status", ["sold", "delivered"])');
    expect(lettura).toContain("vehicle_economics(sale_date, sale_price, total_cost, margin)");
  });

  it("le vetture senza conto restano nell'elenco, segnate", () => {
    expect(pagina).toContain("da completare");
  });

  it("resta dentro la concessionaria", () => {
    expect(lettura).toContain('.eq("dealer_id", dealerId)');
  });
});
