import { describe, expect, it } from "vitest";
import {
  inPerdita,
  meseCorrente,
  meseDi,
  mesiConVendite,
  migliori,
  nomeDelMese,
  peggiori,
  riepilogoDelMese,
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

  it("ma si dice quante sono", () => {
    // Un numero accanto al quale c'e' scritto "di cui una senza prezzo" e' un
    // numero di cui ci si puo' fidare. Senza quella nota, il concessionario
    // crederebbe di aver venduto due auto con quel margine.
    const r = riepilogoDelMese(conti, "2026-08");
    expect(r.venduti).toBe(2);
    expect(r.conMargine).toBe(1);
    expect(r.senzaPrezzo).toBe(1);
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
