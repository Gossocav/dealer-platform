import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  leggiDatiTecnici,
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

  it("tiene usate, km 0 e nuove in pronta consegna", () => {
    expect(voci.map((v) => v.condition).sort()).toEqual(["Km/0", "Nuovo", "Usato"]);
  });

  // Le pagine sotto /auto/nuove/ sono configurazioni di modello a catalogo:
  // niente identificativo, spesso niente prezzo, mai i chilometri.
  //
  // Il taglio finale nell'indirizzo non e' un dettaglio: cercando la sola
  // "/auto/nuove" si scartava anche "/auto/nuove-pronta-consegna/", che sono
  // automobili vere. Erano 20 fra i due siti, il 7% del loro stock.
  it("scarta le nuove a catalogo, non quelle in pronta consegna", () => {
    expect(voci.some((v) => v.url.includes("/auto/nuove/"))).toBe(false);
    expect(voci.some((v) => v.url.includes("/auto/nuove-pronta-consegna/"))).toBe(true);
    expect(voci.find((v) => v.url.includes("pronta-consegna"))?.condition).toBe("Nuovo");
  });

  it("scarta le pagine di categoria, che non hanno un identificativo", () => {
    expect(voci.some((v) => v.url.endsWith("/auto/usate/"))).toBe(false);
  });

  it("prende l'identificativo dall'indirizzo", () => {
    expect(voci.find((v) => v.condition === "Usato")?.sourceId).toBe("7474578");
    expect(voci.find((v) => v.condition === "Km/0")?.sourceId).toBe("7699913");
  });

  it("non elenca due volte lo stesso veicolo", () => {
    expect(voci).toHaveLength(3);
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

  // Il difetto che questo impedisce non era ancora accaduto, e sarebbe
  // accaduto presto: dal 28/08/2026 il titolare ha cominciato a chiedere ai
  // concessionari di scrivere descrizioni vere. Un "disponibile anche a
  // noleggio" dentro la descrizione di un'auto in vendita la faceva sparire
  // dall'importazione senza dirlo a nessuno.
  it("la descrizione non decide se un'auto entra", () => {
    expect(
      looksLikeRental({
        name: "Hyundai Tucson 1.6 CRDi",
        description: "Vettura in vendita. Disponibile anche a noleggio lungo termine su richiesta.",
        price: 24900,
      })
    ).toBe(false);
  });
});

/**
 * Una "nuova in pronta consegna" e' una vettura in piazzale, gia' comprata dal
 * concessionario e pronta da consegnare. Non ha niente a che vedere con le
 * pagine /auto/nuove/, che sono configurazioni di modello a catalogo -- ma il
 * filtro le confondeva, e ne buttava via venti fra i due siti: il 7% del loro
 * stock. Il campione qui sotto e' una di quelle pagine, scaricata il
 * 28/08/2026.
 */
describe("una nuova in pronta consegna e' un'automobile vera", () => {
  const esito = parseDealerStockVehicle(fixture("dealer-site-pronta-consegna.html"), {
    url: "https://www.autogepy.it/auto/nuove-pronta-consegna/reggio-emilia/hyundai/tucson/ibrido/1-6-phev-4wd-aut-exellence/7496248/",
    sourceId: "7496248",
    condition: "Nuovo",
  });

  it("non viene scartata", () => {
    expect(esito.ok, esito.ok ? "" : `scartata per ${esito.reason}`).toBe(true);
  });

  it("porta con se' tutto quello che serve a pubblicarla", () => {
    if (!esito.ok) throw new Error("scartata");
    expect(esito.vehicle.brand).toBe("Hyundai");
    expect(esito.vehicle.price).toBe(49900);
    expect(esito.vehicle.fuel).toBe("Ibrida");
    expect(esito.vehicle.transmission).toBe("Automatico");
    expect(esito.vehicle.images.length).toBeGreaterThan(0);
  });

  it("ha zero chilometri, non chilometri sconosciuti", () => {
    // La pagina dichiara `false`, come fanno le km 0. Su una vettura mai
    // immatricolata zero non e' un'invenzione: e' la lettura di cio' che e'.
    // Lasciandolo sconosciuto sparirebbe dal filtro dei chilometri.
    if (!esito.ok) throw new Error("scartata");
    expect(esito.vehicle.mileage).toBe(0);
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

/**
 * Su delorenziauto.it le miniature delle altre automobili sono larghe 400
 * come le foto vere: la sola regola della larghezza le lasciava passare, e
 * ogni vettura importata si portava dentro fino a sei fotografie altrui.
 * Misurato sulla scheda vera dell'Opel Corsa 6751886: ventuno fotografie
 * sulla pagina, quindici sue.
 */
describe("nella galleria non finiscono le foto delle vetture simili", () => {
  const VOCE_ALTRO_SITO: DealerSiteEntry = {
    url: "https://www.delorenziauto.it/auto/usate/cremona/opel/corsa/benzina/blitz-edition/6751886/",
    sourceId: "6751886",
    condition: "Usato",
  };

  const CDN = "https://cdn.dealerk.it/dealer/datafiles/vehicle/images";

  function scheda(corpo: string) {
    return `
      <script type="application/ld+json">${JSON.stringify({ "@type": "Car", name: "Opel Corsa", brand: "Opel" })}</script>
      <div data-config='{"vehicleId":"6751886","price":20000}'></div>
      ${corpo}`;
  }

  it("tiene le fotografie che il sito offre in piu' misure", () => {
    const esito = parseDealerStockVehicle(
      scheda(`
        <img src="${CDN}/400/2396/sua-uno.jpg"><img src="${CDN}/800/2396/sua-uno.jpg"><img src="${CDN}/200/2396/sua-uno.jpg">
        <img src="${CDN}/400/2396/sua-due.jpg"><img src="${CDN}/800/2396/sua-due.jpg">`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.images).toHaveLength(2);
  });

  it("scarta quella che compare in una misura sola, anche se e' larga uguale", () => {
    const esito = parseDealerStockVehicle(
      scheda(`
        <img src="${CDN}/400/2396/sua.jpg"><img src="${CDN}/800/2396/sua.jpg">
        <div class="vetture-simili"><img src="${CDN}/400/2396/di-un-altra.jpg"></div>`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.images).toHaveLength(1);
    expect(esito.vehicle.images[0]).toContain("sua.jpg");
  });

  // Se nessuna fotografia comparisse in piu' misure il criterio non saprebbe
  // distinguere niente: meglio una galleria con qualche intrusa che una scheda
  // senza foto, che verrebbe scartata del tutto.
  it("se nessuna compare in piu' misure, non lascia la scheda senza foto", () => {
    const esito = parseDealerStockVehicle(
      scheda(`<img src="${CDN}/800/2396/unica.jpg"><img src="${CDN}/800/2396/altra.jpg">`),
      VOCE_ALTRO_SITO
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.images).toHaveLength(2);
  });

  // Su autogepy le miniature altrui sono 0x250: la regola della larghezza le
  // teneva gia' fuori, e questa non deve toglierne altre.
  it("non cambia nulla dove la larghezza bastava gia'", () => {
    const esito = parseDealerStockVehicle(fixture("dealer-site-usato.html"), VOCE);

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.vehicle.images.length).toBeGreaterThan(1);
  });
});

/**
 * Senza carrozzeria un veicolo importato non compare ne' in "Esplora per
 * categoria" ne' nel filtro della ricerca avanzata: era il caso di dodici dei
 * quattordici veicoli pubblicati.
 */
describe("la carrozzeria si legge dalla pagina", () => {
  const VOCE_ALTRO_SITO: DealerSiteEntry = {
    url: "https://www.delorenziauto.it/auto/usate/cremona/opel/corsa/benzina/blitz/6751886/",
    sourceId: "6751886",
    condition: "Usato",
  };

  const CDN = "https://cdn.dealerk.it/dealer/datafiles/vehicle/images";

  function scheda(corpo: string) {
    return `
      <script type="application/ld+json">${JSON.stringify({ "@type": "Car", name: "Opel Corsa", brand: "Opel" })}</script>
      <div data-config='{"vehicleId":"6751886","price":20000}'></div>
      <img src="${CDN}/400/2396/una.jpg"><img src="${CDN}/800/2396/una.jpg">
      ${corpo}`;
  }

  function carrozzeriaDi(corpo: string) {
    const esito = parseDealerStockVehicle(scheda(corpo), VOCE_ALTRO_SITO);
    if (!esito.ok) throw new Error(`scheda scartata: ${esito.reason}`);
    return esito.vehicle.bodyType;
  }

  it("la prende dal campo che compare una volta sola", () => {
    expect(carrozzeriaDi(`<script>var d = {"body_style":"Berlina due volumi"};</script>`)).toBe("Berlina due volumi");
  });

  // Fra le occorrenze di "bodyType" c'e' anche l'etichetta del filtro di
  // ricerca: la stessa trappola del prezzo.
  it("non scambia l'etichetta del filtro per una carrozzeria", () => {
    expect(carrozzeriaDi(`<script>var etichette = {"bodyType":"Qualsiasi carrozzeria"};</script>`)).toBeNull();
  });

  it("usa bodyType quando body_style non c'e', saltando l'etichetta", () => {
    expect(
      carrozzeriaDi(`<script>var e = {"bodyType":"Qualsiasi carrozzeria"}; var v = {"bodyType":"SUV"};</script>`)
    ).toBe("SUV");
  });

  it("ripulisce la barra protetta dei siti che scrivono JSON dentro l'HTML", () => {
    expect(carrozzeriaDi(`<script>var d = {"body_style":"Furgoni\\/Van"};</script>`)).toBe("Furgoni/Van");
  });

  it("una scheda che non la dichiara resta senza, non inventa", () => {
    expect(carrozzeriaDi("")).toBeNull();
  });
});

/**
 * I dati tecnici stanno nella pagina, non nei dati strutturati -- e per mesi
 * non li abbiamo letti. Misurato in produzione il 28/08/2026, su 235 automobili
 * pubblicate: potenza compilata su **2**, cilindrata su 3, classe Euro su 1,
 * trazione su 2. Sulla scheda pubblica il cliente leggeva nove trattini, fra
 * cui "Potenza -" in cima all'annuncio.
 *
 * Passato il lettore su sedici schede vere dei due siti: potenza 16 su 16,
 * cilindrata 14, classe Euro 8, trazione 8.
 */
describe("i dati tecnici si leggono dalla pagina", () => {
  const dati = leggiDatiTecnici(fixture("dealer-site-caratteristiche.html"));

  it("potenza in kW e in CV", () => {
    expect(dati.powerKw).toBe(194);
    expect(dati.powerCv).toBe(265);
  });

  it("la cilindrata diventa un numero, come la salva il modulo a mano", () => {
    // Sulla pagina e' "1.598 cc": il punto e' il separatore delle migliaia.
    // Nel database i veicoli inseriti a mano hanno 2000 e 1500, non "2.000 cc":
    // scriverci dentro il testo del sito farebbe dire alla stessa colonna due
    // cose diverse a seconda di chi l'ha riempita.
    expect(dati.engineSize).toBe(1598);
  });

  it("della classe Euro resta la sola cifra", () => {
    // "EURO6" sul sito, "6" nel modulo a mano. Vince il modulo.
    expect(dati.emissionClass).toBe("6");
  });

  it("la trazione passa dal normalizzatore che usa gia' il gestionale", () => {
    // "Integrale permanente" non e' una voce del nostro elenco: diventa
    // "Integrale 4x4", altrimenti il filtro della ricerca non la troverebbe.
    expect(dati.traction).toBe("Integrale 4x4");
  });

  it("non confonde la potenza fiscale con quella del motore", () => {
    // "Potenza fiscale 17 CV" sta sulla stessa pagina, due righe sotto. Il
    // modello di ricerca pretende la forma "N KW (M CV)", che solo la potenza
    // vera ha.
    expect(dati.powerCv).not.toBe(17);
  });
});

describe("un dato si prende solo se la pagina lo dice sempre allo stesso modo", () => {
  it("due valori diversi per la stessa etichetta valgono come nessun valore", () => {
    // In fondo a ogni scheda c'e' il carosello delle "vetture simili". Se una
    // di quelle portasse con se' la propria cilindrata, prenderla sarebbe
    // scrivere sul nostro annuncio il dato di un'altra automobile.
    const pagina = "<p>Cilindrata 1.598 cc</p><p>Vetture simili</p><p>Cilindrata 999 cc</p>";
    expect(leggiDatiTecnici(pagina).engineSize).toBeNull();
  });

  it("lo stesso valore ripetuto va bene", () => {
    // E' il caso normale: i due siti scrivono la potenza due volte, nel
    // riquadro in alto e nella tabella tecnica.
    const pagina = "<p>Potenza 73 KW (100 CV)</p><p>Potenza 73 KW (100 CV)</p>";
    expect(leggiDatiTecnici(pagina).powerKw).toBe(73);
  });

  it("regge la spaziatura dell'altro sito", () => {
    // delorenziauto.it scrive "Potenza 100 KW ( 136 CV )", con gli spazi
    // dentro le parentesi.
    expect(leggiDatiTecnici("<p>Potenza 100 KW ( 136 CV )</p>").powerCv).toBe(136);
  });

  it("un trattino non e' un dato", () => {
    // "Cilindrata -" e "Classe emissioni --" compaiono davvero sulle pagine.
    const pagina = "<p>Cilindrata - Classe emissioni -- Trazione -</p>";
    const dati = leggiDatiTecnici(pagina);
    expect(dati.engineSize).toBeNull();
    expect(dati.emissionClass).toBeNull();
    expect(dati.traction).toBeNull();
  });
});
