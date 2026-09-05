import { describe, expect, it } from "vitest";
import {
  andamentoGiornaliero,
  annunciPiuVisti,
  giornoMenoGiorni,
  visitePerConcessionaria,
  type RigaDiVisita,
} from "@/lib/statistiche-visite";

const OGGI = "2026-09-05";

const CONCESSIONARIE = [
  { id: "d1", nome: "Autogepy" },
  { id: "d2", nome: "De Lorenzi" },
  { id: "d3", nome: "Senza visite" },
];

const RIGHE: RigaDiVisita[] = [
  { dealer_id: "d1", vehicle_id: "v1", view_day: "2026-09-05", views_count: 10 },
  { dealer_id: "d1", vehicle_id: "v2", view_day: "2026-09-05", views_count: 4 },
  { dealer_id: "d1", vehicle_id: null, view_day: "2026-09-05", views_count: 3 },
  { dealer_id: "d1", vehicle_id: "v1", view_day: "2026-09-01", views_count: 7 },
  { dealer_id: "d1", vehicle_id: "v1", view_day: "2026-08-20", views_count: 5 },
  // Fuori dai 30 giorni: non deve entrare da nessuna parte.
  { dealer_id: "d1", vehicle_id: "v1", view_day: "2026-06-01", views_count: 999 },
  { dealer_id: "d2", vehicle_id: "v9", view_day: "2026-09-04", views_count: 2 },
];

describe("giornoMenoGiorni", () => {
  it("torna indietro restando nel formato del database", () => {
    expect(giornoMenoGiorni("2026-09-05", 0)).toBe("2026-09-05");
    expect(giornoMenoGiorni("2026-09-05", 6)).toBe("2026-08-30");
    expect(giornoMenoGiorni("2026-03-01", 1)).toBe("2026-02-28");
  });

  /**
   * Il difetto che il mezzogiorno impedisce: calcolando da mezzanotte, il
   * giorno del cambio di ora legale scivola indietro di uno e la finestra
   * "ultimi 7 giorni" ne comprende otto, una volta l'anno.
   */
  it("non scivola nel giorno del cambio di ora legale", () => {
    expect(giornoMenoGiorni("2026-03-30", 1)).toBe("2026-03-29");
    expect(giornoMenoGiorni("2026-10-26", 1)).toBe("2026-10-25");
  });
});

describe("visitePerConcessionaria", () => {
  const quadri = visitePerConcessionaria({
    righe: RIGHE,
    concessionarie: CONCESSIONARIE,
    contattiPerDealer: { d1: 2 },
    oggi: OGGI,
  });

  const autogepy = quadri.find((q) => q.dealerId === "d1")!;

  it("somma oggi, sette giorni e trenta giorni", () => {
    expect(autogepy.oggi).toBe(17);
    expect(autogepy.ultimi7).toBe(24);
    expect(autogepy.ultimi30).toBe(29);
  });

  it("separa le visite agli annunci da quelle alla pagina della concessionaria", () => {
    expect(autogepy.annunci30).toBe(26);
    expect(autogepy.pagina30).toBe(3);
    expect(autogepy.annunci30 + autogepy.pagina30).toBe(autogepy.ultimi30);
  });

  it("mette in cima chi ha piu' visite", () => {
    expect(quadri.map((q) => q.dealerId)).toEqual(["d1", "d2", "d3"]);
  });

  it("una concessionaria senza visite compare lo stesso, con zero", () => {
    const senzaVisite = quadri.find((q) => q.dealerId === "d3")!;
    expect(senzaVisite.ultimi30).toBe(0);
    expect(senzaVisite.nome).toBe("Senza visite");
  });

  /**
   * La regola di questo progetto: un dato che non c'e' non si finge. Senza
   * richieste ricevute, "visite per contatto" non e' zero -- e' un numero che
   * non esiste, e mostrarlo come zero direbbe che ogni visita porta un
   * contatto, cioe' l'opposto della verita'.
   */
  it("non inventa un rapporto quando non ci sono contatti", () => {
    expect(autogepy.visitePerContatto).toBe(15);
    expect(quadri.find((q) => q.dealerId === "d2")!.visitePerContatto).toBeNull();
    expect(quadri.find((q) => q.dealerId === "d3")!.visitePerContatto).toBeNull();
  });

  it("le righe di una concessionaria che non e' nell'elenco non si contano", () => {
    const quadriRistretti = visitePerConcessionaria({
      righe: RIGHE,
      concessionarie: [{ id: "d2", nome: "De Lorenzi" }],
      contattiPerDealer: {},
      oggi: OGGI,
    });

    expect(quadriRistretti).toHaveLength(1);
    expect(quadriRistretti[0].ultimi30).toBe(2);
  });
});

describe("annunciPiuVisti", () => {
  it("somma le visite di ogni automobile e mette in cima la piu' vista", () => {
    const classifica = annunciPiuVisti({ righe: RIGHE, dealerId: "d1", oggi: OGGI });
    expect(classifica).toEqual([
      { vehicleId: "v1", visite: 22 },
      { vehicleId: "v2", visite: 4 },
    ]);
  });

  it("non conta le visite alla pagina della concessionaria", () => {
    const classifica = annunciPiuVisti({ righe: RIGHE, dealerId: "d1", oggi: OGGI });
    expect(classifica.some((v) => v.vehicleId === null)).toBe(false);
  });
});

describe("andamentoGiornaliero", () => {
  const andamento = andamentoGiornaliero({ righe: RIGHE, oggi: OGGI, giorni: 7 });

  it("copre tutti i giorni chiesti, dal piu' vecchio al piu' recente", () => {
    expect(andamento).toHaveLength(7);
    expect(andamento[0].giorno).toBe("2026-08-30");
    expect(andamento[6].giorno).toBe("2026-09-05");
  });

  /**
   * Un grafico che salta i giorni vuoti fa sembrare continuo un andamento
   * che ha dei buchi: due giorni con visite lontani una settimana
   * sembrerebbero consecutivi.
   */
  it("i giorni senza visite ci sono lo stesso, a zero", () => {
    const giovedi = andamento.find((g) => g.giorno === "2026-09-03")!;
    expect(giovedi.visite).toBe(0);
    expect(andamento.find((g) => g.giorno === "2026-09-05")!.visite).toBe(17);
  });
});
