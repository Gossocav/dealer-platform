import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMUNI_BY_PROVINCE } from "@/lib/italian-geo-data";
import { ITALIAN_CITIES_BY_PROVINCE } from "@/lib/italian-locations";
import { resolveComunePoint } from "@/lib/geo-search";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const searchPage = read("src/app/(marketplace)/ricerca/page.tsx");

// Un comune senza coordinate non da' errore: la concessionaria che ci sta
// dentro sparisce da ogni ricerca per distanza e nessuno se ne accorge. Per
// questo la copertura si conta invece di darla per buona.
describe("copertura delle coordinate", () => {
  it("copre ogni comune selezionabile in fase di registrazione", () => {
    const missing: string[] = [];

    for (const [province, cities] of Object.entries(ITALIAN_CITIES_BY_PROVINCE)) {
      for (const city of cities as readonly string[]) {
        if (!resolveComunePoint(province, city)) missing.push(`${province} ${city}`);
      }
    }

    expect(missing, `comuni senza coordinate: ${missing.slice(0, 10).join(", ")}`).toHaveLength(0);
  });

  it("ha lo stesso numero di comuni dell'elenco da cui si sceglie", () => {
    const selectable = Object.values(ITALIAN_CITIES_BY_PROVINCE).reduce((sum, list) => sum + (list as readonly string[]).length, 0);
    const mapped = Object.values(COMUNI_BY_PROVINCE).reduce((sum, list) => sum + list.length, 0);
    expect(mapped).toBe(selectable);
  });

  it("colloca i comuni dentro i confini d'Italia", () => {
    // Un segno invertito o una coppia scambiata metterebbe dei comuni in mezzo
    // al mare senza che nessun altro controllo se ne accorga.
    for (const [province, comuni] of Object.entries(COMUNI_BY_PROVINCE)) {
      for (const [name, lat, lng] of comuni) {
        expect(lat, `${province} ${name} fuori dalle latitudini italiane`).toBeGreaterThan(35);
        expect(lat, `${province} ${name} fuori dalle latitudini italiane`).toBeLessThan(47.5);
        expect(lng, `${province} ${name} fuori dalle longitudini italiane`).toBeGreaterThan(6);
        expect(lng, `${province} ${name} fuori dalle longitudini italiane`).toBeLessThan(19);
      }
    }
  });
});

describe("il dataset non finisce nel browser", () => {
  it("resta fuori dai componenti client", () => {
    // Pesa parecchio: se un "use client" lo importasse, ogni visitatore se lo
    // scaricherebbe per vedere una pagina di annunci.
    expect(read("src/lib/geo-search.ts")).not.toMatch(/^"use client"/);
    expect(read("src/lib/italian-geo-data.ts")).not.toMatch(/^"use client"/);
    expect(searchPage).not.toMatch(/^"use client"/);
  });

  it("resta di dimensioni ragionevoli", () => {
    // Non e' un limite estetico: e' il peso che ogni richiesta alla ricerca si
    // porta dietro lato server.
    const bytes = statSync(resolve(process.cwd(), "src/lib/italian-geo-data.ts")).size;
    expect(bytes).toBeLessThan(1_200_000);
  });
});

describe("ricerca per distanza nella pagina", () => {
  it("espone i due campi chiesti", () => {
    expect(searchPage).toMatch(/label="Città o CAP" name="near"/);
    expect(searchPage).toMatch(/label="Distanza"\s*\n?\s*name="radius"/);
  });

  it("misura dalla città dell'account della concessionaria", () => {
    // Non dalla città scritta sul singolo veicolo: l'auto sta dove sta la
    // concessionaria, ed e' il dato scelto da un elenco chiuso.
    expect(searchPage).toContain('.from("dealers")');
    expect(searchPage).toContain('.select("id, city, province")');
    expect(searchPage).toContain("resolveComunePoint(row.province, row.city)");
  });

  it("filtra dentro la query e non a valle", () => {
    // Scremare le righe dopo il fetch falserebbe conteggio totale e pagine.
    expect(searchPage).toMatch(/query = query\.in\("dealer_id"/);
  });

  it("rifinisce il riquadro con la distanza esatta", () => {
    // Gli angoli del rettangolo cadono fuori dal cerchio: senza il secondo
    // passaggio un raggio di 50 km restituirebbe concessionarie a 70.
    expect(searchPage).toContain("isWithinBox");
    expect(searchPage).toContain("distanceKm(nearPlace, point) > appliedDistance");
  });

  it("non applica nessun raggio se il visitatore non lo sceglie", () => {
    // Restringere la ricerca a un raggio deciso al posto suo fa sparire
    // risultati che non ha chiesto di escludere, e sembra un difetto.
    expect(searchPage).not.toContain("DEFAULT_DISTANCE_KM");
    expect(searchPage).toContain("const appliedDistance = parseDistanceKm(filters.radius);");
  });

  it("spiega perché una città senza distanza non filtra", () => {
    // Altrimenti sembra che il campo sia stato ignorato.
    expect(searchPage).toContain("distanceMissing");
    expect(searchPage).toMatch(/nessuna distanza/);
  });

  it("avvisa quando il luogo scritto non viene riconosciuto", () => {
    // Ignorarlo in silenzio farebbe credere di guardare i risultati vicino a
    // casa mentre si guardano quelli di tutta Italia.
    expect(searchPage).toContain("nearNotFound");
    expect(searchPage).toMatch(/Non abbiamo riconosciuto/);
  });

  it("conserva i due filtri fra le pagine dei risultati", () => {
    const block = searchPage.slice(searchPage.indexOf("function buildSearchParams"));
    expect(block).toContain('["near", filters.near]');
    expect(block).toContain('["radius", filters.radius]');
  });
});

// L'attivazione demo raccoglieva la provincia nel modulo pubblico e poi la
// buttava via: in produzione l'unica concessionaria aveva city valorizzata e
// province null, e restava fuori da ogni ricerca per distanza senza dare
// segnali. Trovato solo interrogando il sito pubblicato.
describe("la provincia arriva fino alla concessionaria", () => {
  const activation = read("src/app/api/admin/demo-requests/route.ts");

  it("viene copiata sull'account insieme alla citta'", () => {
    const payload = activation.slice(
      activation.indexOf("city: targetRequest.city"),
      activation.indexOf("account_type: \"demo\""),
    );
    expect(payload).toContain("province: targetRequest.province");
  });

  it("resta obbligatoria nel modulo di richiesta", () => {
    // Se smettesse di essere richiesta, i comuni omonimi tornerebbero
    // indistinguibili.
    expect(read("src/app/demo/page.tsx")).toContain("Provincia *");
  });
});
