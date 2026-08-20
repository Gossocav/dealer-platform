import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  looksLikeRental,
  parseDealerStockSitemap,
  parseDealerStockVehicle,
  type DealerSiteEntry,
} from "@/lib/dealer-site-import";

function fixture(nome: string) {
  return readFileSync(resolve(process.cwd(), `src/lib/__fixtures__/${nome}`), "utf8");
}

const SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.autogepy.it/auto/usate/reggio-emilia/hyundai/bayon/ibrido/1-0-t-gdi/7474578/</loc></url>
  <url><loc>https://www.autogepy.it/auto/km0/parma/jeep/avenger/benzina/1-2-turbo-altitude/7699913/</loc></url>
  <url><loc>https://www.autogepy.it/auto/nuove-pronta-consegna/reggio-emilia/hyundai/tucson/ibrido/1-6-phev/7496248/</loc></url>
  <url><loc>https://www.autogepy.it/auto/nuove/subaru/outback/benzina/2-5i/2025/1000346428/</loc></url>
  <url><loc>https://www.autogepy.it/auto/usate/</loc></url>
  <url><loc>https://www.autogepy.it/auto/usate/reggio-emilia/hyundai/bayon/ibrido/1-0-t-gdi/7474578/</loc></url>
</urlset>`;

describe("dalla sitemap si prendono solo le automobili vere", () => {
  const voci = parseDealerStockSitemap(SITEMAP);

  it("tiene usate e km 0", () => {
    expect(voci.map((v) => v.condition).sort()).toEqual(["Km/0", "Usato"]);
  });

  // Le pagine sotto /auto/nuove/ sono configurazioni di modello a catalogo:
  // niente identificativo, spesso niente prezzo, mai i chilometri.
  it("scarta le nuove, che non sono automobili in piazzale", () => {
    expect(voci.some((v) => v.url.includes("/auto/nuove"))).toBe(false);
  });

  it("scarta le pagine di categoria, che non hanno un identificativo", () => {
    expect(voci.some((v) => v.url.endsWith("/auto/usate/"))).toBe(false);
  });

  it("prende l'identificativo dall'indirizzo", () => {
    expect(voci.find((v) => v.condition === "Usato")?.sourceId).toBe("7474578");
    expect(voci.find((v) => v.condition === "Km/0")?.sourceId).toBe("7699913");
  });

  it("non elenca due volte lo stesso veicolo", () => {
    expect(voci).toHaveLength(2);
  });
});

const VOCE: DealerSiteEntry = {
  url: "https://www.autogepy.it/auto/usate/reggio-emilia/hyundai/bayon/ibrido/1-0-t-gdi/7474578/",
  sourceId: "7474578",
  condition: "Usato",
};

describe("una scheda vera si legge per intero", () => {
  const esito = parseDealerStockVehicle(fixture("dealer-site-usato.html"), VOCE);

  it("viene letta", () => {
    expect(esito.ok).toBe(true);
  });

  it("porta con se' i campi che servono a pubblicare un annuncio", () => {
    if (!esito.ok) throw new Error("scheda non letta");
    const v = esito.vehicle;

    expect(v.sourceId).toBe("7474578");
    expect(v.condition).toBe("Usato");
    expect(v.brand).toBeTruthy();
    expect(v.model).toBeTruthy();
    expect(v.price).toBeGreaterThan(3000);
    expect(v.mileage).toBeGreaterThan(0);
    expect(v.fuel).toBeTruthy();
    expect(v.transmission).toBeTruthy();
    expect(v.year).toBeGreaterThan(1990);
    expect(v.images.length).toBeGreaterThan(0);
  });

  it("le foto arrivano dalla pagina, dove ce ne sono decine, non dai dati strutturati, dove ce n'e' una", () => {
    if (!esito.ok) throw new Error("scheda non letta");
    expect(esito.vehicle.images.every((u) => u.startsWith("https://"))).toBe(true);
    expect(new Set(esito.vehicle.images).size).toBe(esito.vehicle.images.length);
  });
});

// Trovata provando su dati veri: una Jeep Avenger a 239 euro, elencata fra le
// usate perche' e' un'offerta di noleggio. Importata cosi', sul marketplace
// comparirebbe una Jeep a 239 euro.
describe("i canoni di noleggio non diventano prezzi di vendita", () => {
  it("la scheda vera con il canone viene scartata", () => {
    const esito = parseDealerStockVehicle(fixture("dealer-site-noleggio.html"), {
      ...VOCE,
      sourceId: "10187955",
    });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.reason).toBe("noleggio");
  });

  it("riconosce sia dalla parola sia dalla cifra", () => {
    expect(looksLikeRental({ name: "Jeep Avenger NOLEGGIO", description: null, price: 25000 })).toBe(true);
    expect(looksLikeRental({ name: "Jeep Avenger", description: null, price: 239 })).toBe(true);
    expect(looksLikeRental({ name: "Jeep Avenger", description: null, price: 25000 })).toBe(false);
  });
});

describe("quello che non si puo' pubblicare viene scartato, con il motivo", () => {
  it("una pagina senza dati strutturati", () => {
    const esito = parseDealerStockVehicle("<html><body>niente</body></html>", VOCE);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.reason).toBe("nessun-dato-strutturato");
  });

  it("una scheda senza prezzo", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "Opel Corsa 1.2",
      brand: { name: "Opel" },
    })}</script>`;
    const esito = parseDealerStockVehicle(html, VOCE);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.reason).toBe("senza-prezzo");
  });

  // "false" significa "non lo so", non "zero": un'usata a zero chilometri
  // dichiarati sarebbe un dato inventato.
  it("una km 0 senza chilometri dichiarati vale zero: e' il significato della categoria", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "Jeep Avenger 1.2 Turbo",
      offers: { price: 25000 },
      mileageFromOdometer: { value: false },
    })}</script>`;
    const esito = parseDealerStockVehicle(html, { ...VOCE, condition: "Km/0" });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    // Lasciarli sconosciuti la farebbe sparire dal filtro dei chilometri.
    expect(esito.vehicle.mileage).toBe(0);
  });

  it("i chilometri riportati come 'false' su un'usata restano sconosciuti, non diventano zero", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "Jeep Grand Cherokee",
      offers: { price: 81900 },
      mileageFromOdometer: { value: false },
    })}</script>`;
    const esito = parseDealerStockVehicle(html, VOCE);

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.mileage).toBeNull();
    expect(esito.vehicle.mileage).not.toBe(0);
  });
});
