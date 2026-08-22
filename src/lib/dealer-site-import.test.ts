import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  looksLikeRental,
  normalizzaMisuraFoto,
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

// Segnalato dopo le prime venti vetture importate: ogni annuncio si portava
// dentro due loghi Jeep, due Hyundai, due Subaru e due Alfa Romeo. Erano i
// marchi trattati dalla concessionaria, presi dall'intestazione del sito.
describe("nella galleria finiscono solo le foto dell'auto", () => {
  const PAGINA = `
    <img src="https://cdn.dealerk.it/cars/make/brand/60/jeep.png">
    <img src="https://cdn.dealerk.it/cars/make/brand/48/hyundai.png">
    <img src="https://cdn.dealerk.it/cars/make/brand/64/white/subaru.png">
    <img src="https://cdn.dealerk.it/cars/placeholder/nessuna-foto.png">
    <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/primo.jpeg">
    <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/480x0/33890/secondo.jpeg">
    <script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "Hyundai Bayon",
      offers: { price: 19500 },
    })}</script>`;

  const esito = parseDealerStockVehicle(PAGINA, VOCE);

  it("i loghi delle marche restano fuori", () => {
    if (!esito.ok) throw new Error("scheda non letta");
    expect(esito.vehicle.images.some((u) => u.includes("/cars/make/brand/"))).toBe(false);
    expect(esito.vehicle.images.some((u) => u.includes("/cars/placeholder/"))).toBe(false);
    expect(esito.vehicle.images).toHaveLength(2);
  });

  // La pagina cita lo stesso scatto in misure diverse a seconda di dove lo
  // usa: 47 indirizzi per 16 fotografie, su una scheda vera.
  it("lo stesso scatto in misure diverse conta una volta sola", () => {
    const conDoppioni = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/uno.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/600x0/33890/uno.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/480x0/33890/uno.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/400/33890/uno.jpeg">
      <script type="application/ld+json">${JSON.stringify({ "@type": "Vehicle", name: "x", offers: { price: 19500 } })}</script>`;
    const solo = parseDealerStockVehicle(conDoppioni, VOCE);
    if (!solo.ok) throw new Error("scheda non letta");
    expect(solo.vehicle.images).toHaveLength(1);
  });

  // Era 800, e a schermo intero si vedeva: una foto da 801x451 dentro un'area
  // da 1440x716 o resta piccola o si sgrana. A 1600 l'archivio ne serve 1281x721.
  it("ogni foto viene chiesta nella misura buona, qualunque fosse in pagina", () => {
    if (!esito.ok) throw new Error("scheda non letta");
    for (const url of esito.vehicle.images) {
      expect(url).toContain("/vehicle/images/1600x0/");
    }
  });

  // Le fotografie importate quando la misura era 800 hanno quell'indirizzo
  // salvato nel database: la stessa regola si applica al momento di mostrarle,
  // cosi' migliorano tutte senza reimportare niente.
  it("riscrive la misura anche a una foto gia' importata", () => {
    const gia = "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/uno.jpeg";
    expect(normalizzaMisuraFoto(gia)).toBe("https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/33890/uno.jpeg");
  });

  it("lascia intatto un indirizzo che non e' una foto della concessionaria", () => {
    const nostra = "https://progetto.supabase.co/storage/v1/object/sign/vehicle-images/foto.jpg";
    expect(normalizzaMisuraFoto(nostra)).toBe(nostra);
    expect(normalizzaMisuraFoto("299d3fd8/26c72aed/1785238272963-0.jpg")).toBe("299d3fd8/26c72aed/1785238272963-0.jpg");
  });

  // Segnalato su una Jeep CJ-7: fra le sue foto ne comparivano di altre
  // automobili. In fondo a ogni scheda c'e' un carosello di vetture simili, e
  // le sue miniature stanno nello stesso archivio delle foto vere.
  //
  // Il confine e' la misura, misurato su tre schede: le foto della vettura
  // compaiono in piu' misure, le miniature altrui solo come 0x250.
  it("le miniature delle vetture simili restano fuori", () => {
    const conCarosello = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/mia.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/600x0/33890/mia.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/0x250/33890/altra-vettura.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/0x250/33890/altra-ancora.jpeg">
      <script type="application/ld+json">${JSON.stringify({ "@type": "Vehicle", name: "Jeep CJ-7", offers: { price: 37400 } })}</script>`;

    const solo = parseDealerStockVehicle(conCarosello, VOCE);
    if (!solo.ok) throw new Error("scheda non letta");

    expect(solo.vehicle.images).toHaveLength(1);
    expect(solo.vehicle.images[0]).toContain("mia.jpeg");
    expect(solo.vehicle.images.some((u) => u.includes("altra"))).toBe(false);
  });

  // Una vettura le cui uniche immagini sono miniature di altre auto non ha
  // foto proprie: non deve entrare spacciandosi per fotografata.
  it("una scheda con solo miniature altrui conta come senza foto", () => {
    const soloAltrui = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/0x250/33890/altra-uno.jpeg">
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/0x250/33890/altra-due.jpeg">
      <script type="application/ld+json">${JSON.stringify({ "@type": "Vehicle", name: "Fiat Panda", offers: { price: 8500 } })}</script>`;

    const esitoAltrui = parseDealerStockVehicle(soloAltrui, VOCE);
    expect(esitoAltrui.ok).toBe(false);
    if (!esitoAltrui.ok) expect(esitoAltrui.reason).toBe("senza-foto");
  });

  it("l'ordine della pagina e' l'ordine della galleria: la prima e' la copertina", () => {
    if (!esito.ok) throw new Error("scheda non letta");
    expect(esito.vehicle.images[0]).toContain("primo.jpeg");
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

  // Su un marketplace di automobili la foto e' la prima cosa che si guarda:
  // una scheda senza immagini occupa un posto in griglia, abbassa la fiducia
  // in tutte le altre e non porta contatti.
  it("una scheda senza fotografie", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "Fiat Panda 1.2",
      offers: { price: 8500 },
      mileageFromOdometer: { value: 60000 },
    })}</script>`;
    const esito = parseDealerStockVehicle(html, VOCE);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.reason).toBe("senza-foto");
  });

  it("i loghi di marca non bastano a far passare una scheda per fotografata", () => {
    const html = `
      <img src="https://cdn.dealerk.it/cars/make/brand/60/jeep.png">
      <img src="https://cdn.dealerk.it/cars/placeholder/nessuna-foto.png">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        name: "Fiat Panda 1.2",
        offers: { price: 8500 },
      })}</script>`;
    const esito = parseDealerStockVehicle(html, VOCE);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.reason).toBe("senza-foto");
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
    const html = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/una.jpeg">
      <script type="application/ld+json">${JSON.stringify({
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
    const html = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/una.jpeg">
      <script type="application/ld+json">${JSON.stringify({
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

/**
 * Non tutti i siti DealerK mettono il prezzo nella scheda leggibile dalle
 * macchine. Su delorenziauto.it il campo "offers" non c'e' proprio: senza
 * questa lettura le sue 105 vetture verrebbero scartate tutte per "prezzo
 * mancante", che e' falso -- il prezzo sulla pagina c'e', scritto accanto
 * all'identificativo della vettura.
 */
describe("il prezzo quando la scheda leggibile non lo dichiara", () => {
  const VOCE_ALTRO_SITO: DealerSiteEntry = {
    url: "https://www.delorenziauto.it/auto/usate/cremona/opel/corsa/benzina/blitz-edition/6751886/",
    sourceId: "6751886",
    condition: "Usato",
  };

  function scheda(corpo: string) {
    return `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/2396/una.jpeg">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Car",
        name: "Opel Corsa Blitz Edition",
        brand: "Opel",
        model: "Corsa",
      })}</script>
      ${corpo}`;
  }

  it("lo prende dal numero scritto accanto all'identificativo della vettura", () => {
    const esito = parseDealerStockVehicle(
      scheda(`<div data-config='{"vehicleId":"6751886","companyId":"2396","price":20000,"make":"opel"}'></div>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.price).toBe(20000);
  });

  it("legge anche la forma scritta per le persone, con il punto delle migliaia", () => {
    const esito = parseDealerStockVehicle(
      scheda(`<script>var d = {"price":"\\u20ac 20.000","km":"10 Km","year":"2023","vehicleId":"6751886"};</script>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.price).toBe(20000);
  });

  it("i centesimi non diventano migliaia", () => {
    const esito = parseDealerStockVehicle(
      scheda(`<script>var d = {"vehicleId":"6751886","price":"20000.00"};</script>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.price).toBe(20000);
  });

  // In fondo a ogni scheda il sito propone altre vetture, coi loro prezzi. E'
  // la stessa trappola che aveva messo in galleria le foto di altre auto.
  it("non prende il prezzo di un'altra vettura proposta in fondo alla pagina", () => {
    const esito = parseDealerStockVehicle(
      scheda(`
        <div data-config='{"vehicleId":"6751886","price":20000}'></div>
        <div class="simili" data-config='{"vehicleId":"9999999","price":7500}'></div>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.price).toBe(20000);
  });

  // "price" e' anche il nome dell'etichetta del filtro di ricerca, che vale
  // "Qualsiasi prezzo": non e' agganciata a nessuna vettura, e va ignorata.
  it("l'etichetta del filtro non e' un prezzo", () => {
    const esito = parseDealerStockVehicle(
      scheda(`<script>var etichette = {"bodyType":"Qualsiasi carrozzeria","price":"Qualsiasi prezzo"};</script>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.reason).toBe("senza-prezzo");
  });

  it("quando la scheda dichiara il prezzo, quello vince", () => {
    const html = `
      <img src="https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/una.jpeg">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        name: "Hyundai Bayon",
        offers: { price: 19500 },
      })}</script>
      <div data-config='{"vehicleId":"7474578","price":99999}'></div>`;
    const esito = parseDealerStockVehicle(html, VOCE);

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.price).toBe(19500);
  });
});
