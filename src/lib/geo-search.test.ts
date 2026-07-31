import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISTANCE_KM,
  DISTANCE_OPTIONS,
  boundingBox,
  distanceKm,
  isWithinBox,
  parseDistanceKm,
  resolveComunePoint,
  resolvePlaceQuery,
} from "@/lib/geo-search";

describe("distanze", () => {
  it("misura distanze note fra citta' italiane", () => {
    const milano = resolvePlaceQuery("Milano")!;
    const roma = resolvePlaceQuery("Roma")!;
    const napoli = resolvePlaceQuery("Napoli")!;

    // In linea d'aria: Milano-Roma ~477 km, Roma-Napoli ~188 km. Tolleranza
    // ampia perche' il punto e' il centro del comune, non la piazza principale.
    expect(distanceKm(milano, roma)).toBeGreaterThan(450);
    expect(distanceKm(milano, roma)).toBeLessThan(500);
    expect(distanceKm(roma, napoli)).toBeGreaterThan(170);
    expect(distanceKm(roma, napoli)).toBeLessThan(210);
  });

  it("e' simmetrica e nulla su se stessa", () => {
    const a = resolvePlaceQuery("Torino")!;
    const b = resolvePlaceQuery("Genova")!;
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
    expect(distanceKm(a, a)).toBeCloseTo(0, 6);
  });

  it("colloca le citta' vicine dentro un raggio piccolo", () => {
    const milano = resolvePlaceQuery("Milano")!;
    expect(distanceKm(milano, resolvePlaceQuery("Monza")!)).toBeLessThan(25);
    expect(distanceKm(milano, resolvePlaceQuery("Bergamo")!)).toBeLessThan(60);
    expect(distanceKm(milano, resolvePlaceQuery("Palermo")!)).toBeGreaterThan(800);
  });
});

describe("riquadro di ricerca", () => {
  it("contiene il cerchio che deve delimitare", () => {
    const milano = resolvePlaceQuery("Milano")!;
    const box = boundingBox(milano, 50);

    // Ogni comune entro 50 km deve stare nel riquadro, altrimenti la ricerca
    // lo scarterebbe prima ancora di misurarne la distanza.
    for (const name of ["Monza", "Bergamo", "Pavia", "Lodi", "Como"]) {
      const place = resolvePlaceQuery(name)!;
      if (distanceKm(milano, place) <= 50) {
        expect(isWithinBox(place, box), `${name} e' entro 50 km ma fuori dal riquadro`).toBe(true);
      }
    }
  });

  it("tiene conto che i meridiani si stringono salendo di latitudine", () => {
    // A parita' di chilometri il riquadro deve essere piu' largo in gradi al
    // nord che al sud: un grado di longitudine a Bolzano vale meno che a Ragusa.
    const nord = boundingBox(resolvePlaceQuery("Bolzano")!, 50);
    const sud = boundingBox(resolvePlaceQuery("Ragusa")!, 50);
    expect(nord.maxLng - nord.minLng).toBeGreaterThan(sud.maxLng - sud.minLng);
  });
});

describe("interpretazione di citta' o CAP", () => {
  it("riconosce un nome di citta'", () => {
    expect(resolvePlaceQuery("Milano")?.province).toBe("MI");
    expect(resolvePlaceQuery("  bologna  ")?.province).toBe("BO");
    expect(resolvePlaceQuery("REGGIO NELL'EMILIA")?.province).toBe("RE");
  });

  it("riconosce un CAP", () => {
    // Un CAP e' piu' preciso di un nome, quindi viene provato per primo.
    expect(resolvePlaceQuery("20121")?.province).toBe("MI");
    expect(resolvePlaceQuery("00184")?.province).toBe("RM");
  });

  it("accetta la provincia scritta accanto alla citta'", () => {
    expect(resolvePlaceQuery("Milano (MI)")?.province).toBe("MI");
    expect(resolvePlaceQuery("Milano, MI")?.province).toBe("MI");
  });

  it("scioglie le omonimie preferendo il capoluogo", () => {
    // Esistono comuni omonimi in province diverse: chi scrive il nome di un
    // capoluogo intende quello, non la frazione omonima dall'altra parte
    // d'Italia.
    const firenze = resolvePlaceQuery("Firenze")!;
    expect(firenze.province).toBe("FI");
  });

  it("usa la provincia indicata per scegliere fra omonimi", () => {
    const peglioPu = resolvePlaceQuery("Peglio (PU)");
    const peglioCo = resolvePlaceQuery("Peglio (CO)");
    expect(peglioPu?.province).toBe("PU");
    expect(peglioCo?.province).toBe("CO");
    expect(distanceKm(peglioPu!, peglioCo!)).toBeGreaterThan(200);
  });

  it("accetta i nomi come li scrive la gente, non come sono all'anagrafe", () => {
    // I comuni si chiamano "Reggio nell'Emilia" e "Reggio di Calabria": nessuno
    // li scrive cosi', e pretenderlo faceva comparire "non riconosciuto" a chi
    // cercava casa propria.
    expect(resolvePlaceQuery("reggio emilia")?.province).toBe("RE");
    expect(resolvePlaceQuery("Reggio Emilia")?.province).toBe("RE");
    expect(resolvePlaceQuery("reggio calabria")?.province).toBe("RC");
    expect(resolvePlaceQuery("bagnolo piano")?.name).toBe("Bagnolo in Piano");
  });

  it("non sceglie al posto di chi scrive troppo poco", () => {
    // "Reggio" da solo puo' essere Emilia o Calabria, 900 km di differenza:
    // meglio dire che non si e' capito.
    expect(resolvePlaceQuery("reggio")).toBeNull();
    expect(resolvePlaceQuery("san giovanni")).toBeNull();
  });

  it("restituisce null su un testo che non e' un luogo", () => {
    // Meglio dirlo al visitatore che applicare un filtro a caso.
    expect(resolvePlaceQuery("asdfgh")).toBeNull();
    expect(resolvePlaceQuery("")).toBeNull();
    expect(resolvePlaceQuery(null)).toBeNull();
  });
});

describe("coordinate della concessionaria", () => {
  it("risolve citta' e provincia come sono salvate sull'account", () => {
    expect(resolveComunePoint("MI", "Milano")).not.toBeNull();
    expect(resolveComunePoint("mi", "  milano ")).not.toBeNull();
  });

  it("non inventa un punto quando il dato non torna", () => {
    // Una concessionaria con la citta' scritta a mano sparisce dalla ricerca
    // per distanza: e' voluto, meglio assente che collocata altrove.
    expect(resolveComunePoint("MI", "Milanoo")).toBeNull();
    expect(resolveComunePoint("MI", "")).toBeNull();
    expect(resolveComunePoint(null, "")).toBeNull();
  });

  it("funziona anche senza provincia, se il nome e' unico", () => {
    // L'attivazione demo non copiava la provincia: le concessionarie create
    // prima hanno solo la citta'. Pretenderla le avrebbe fatte sparire in
    // silenzio da ogni ricerca per distanza -- e' successo davvero, con
    // l'unica concessionaria in produzione.
    const senzaProvincia = resolveComunePoint(null, "Bagnolo in Piano");
    expect(senzaProvincia).not.toBeNull();

    const conProvincia = resolveComunePoint("RE", "Bagnolo in Piano");
    expect(senzaProvincia).toEqual(conProvincia);

    expect(resolveComunePoint("", "Milano")).not.toBeNull();
  });

  it("resta senza punto se il nome e' ambiguo e manca la provincia", () => {
    // "Peglio" esiste in due province a 200 km di distanza: tirare a indovinare
    // metterebbe la concessionaria dall'altra parte d'Italia.
    expect(resolveComunePoint(null, "Peglio")).toBeNull();
    expect(resolveComunePoint("PU", "Peglio")).not.toBeNull();
  });
});

describe("scelta della distanza", () => {
  it("va da 10 a 500 km", () => {
    expect(DISTANCE_OPTIONS[0]).toBe(10);
    expect(DISTANCE_OPTIONS[DISTANCE_OPTIONS.length - 1]).toBe(500);
    expect(DISTANCE_OPTIONS.includes(DEFAULT_DISTANCE_KM as never)).toBe(true);
  });

  it("accetta solo i valori del menu", () => {
    // Il raggio arriva dall'indirizzo della pagina e chiunque puo' scriverci
    // dentro quello che vuole.
    expect(parseDistanceKm("50")).toBe(50);
    expect(parseDistanceKm("37")).toBeNull();
    expect(parseDistanceKm("99999")).toBeNull();
    expect(parseDistanceKm("abc")).toBeNull();
    expect(parseDistanceKm(null)).toBeNull();
  });
});
