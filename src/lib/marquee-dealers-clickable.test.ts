import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMarketplaceSlug, normalizeVehicleDealerName, type MarketplaceDealer } from "@/lib/public-marketplace";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const marquee = read("src/components/marketplace/marquee-dealers.tsx");
const dealerPage = read("src/app/(marketplace)/concessionarie/[slug]/page.tsx");

function dealer(fields: Partial<MarketplaceDealer>): MarketplaceDealer {
  return fields as MarketplaceDealer;
}

// La striscia mostrava le ragioni sociali come testo morto: si leggevano e non
// portavano da nessuna parte.
describe("i nomi che scorrono portano alla concessionaria", () => {
  it("ogni nome e' un collegamento alla sua pagina", () => {
    expect(marquee).toContain("href={`/concessionarie/${dealer.slug}`}");
  });

  // Il collegamento nasce dal nome che si vede scorrere, e la pagina della
  // concessionaria cerca proprio quello per prima: se i due si separassero, la
  // striscia manderebbe su pagine inesistenti.
  it("lo slug che genera la striscia e' quello che la pagina sa risolvere", () => {
    const casi = [
      dealer({ legal_name: "Autosalone Città Verde S.r.l.", name: "Città Verde" }),
      dealer({ legal_name: null, name: "Rossi & Figli Auto" }),
      dealer({ legal_name: "  Motori dell'Emilia  ", name: "Motori Emilia" }),
      dealer({ legal_name: "AUTO 2000 S.P.A.", name: null }),
    ];

    for (const record of casi) {
      const nomeMostrato = normalizeVehicleDealerName(record);
      const slugStriscia = createMarketplaceSlug(nomeMostrato);

      // La stessa formula che la pagina concessionaria confronta per prima.
      const slugPagina = createMarketplaceSlug(normalizeVehicleDealerName(record));

      expect(slugStriscia, nomeMostrato).toBe(slugPagina);
      expect(slugStriscia, nomeMostrato).not.toContain(" ");
      expect(slugStriscia.length, nomeMostrato).toBeGreaterThan(0);
    }
  });

  it("la pagina concessionaria cerca ancora per quello slug", () => {
    expect(dealerPage).toContain("createMarketplaceSlug(normalizeVehicleDealerName(dealer))");
  });
});

// Un nome che scivola via sotto il dito non si clicca.
describe("lo scorrimento si ferma quando serve", () => {
  it("si ferma col mouse sopra e quando ci si arriva col Tab", () => {
    expect(marquee).toContain("hover:[animation-play-state:paused]");
    expect(marquee).toContain("focus-within:[animation-play-state:paused]");
  });

  it("il collegamento a fuoco si vede", () => {
    expect(marquee).toContain("focus-visible:outline");
  });
});

// La striscia era tutta nascosta ai lettori di schermo, con una lista a parte
// per la voce. Con dentro dei collegamenti quel disegno non regge piu': un
// link nascosto resta raggiungibile col Tab.
describe("chi ascolta la pagina sente i nomi una volta sola", () => {
  it("la copia che serve solo all'animazione e' nascosta e non si raggiunge col Tab", () => {
    expect(marquee).toContain('aria-hidden={duplicate ? "true" : undefined}');
    expect(marquee).toContain("tabIndex={duplicate ? -1 : undefined}");
  });

  it("i collegamenti veri non sono piu' dentro una zona nascosta", () => {
    // Il vecchio disegno nascondeva l'intera pista: se tornasse, i nomi
    // cliccabili sarebbero invisibili alla voce e comunque tabulabili.
    expect(marquee).not.toContain('marketplace-marquee-track" aria-hidden="true"');
    expect(marquee).not.toContain("sr-only");
  });
});

// Con una sola concessionaria si leggeva il suo nome due volte di fila: la
// seconda copia serve all'animazione, ma con pochi nomi non e' un punto di
// ricucitura, e' un doppione -- sembrano due partner dove ce n'e' uno.
describe("con poche concessionarie i nomi non si raddoppiano", () => {
  it("sotto la soglia i nomi stanno fermi e compaiono una volta sola", () => {
    expect(marquee).toContain("MIN_DEALERS_FOR_MARQUEE");
    expect(marquee).toContain("const scorre = dealers.length >= MIN_DEALERS_FOR_MARQUEE");
    // Il ramo fermo disegna una riga sola: nessun "duplicate".
    const ramoFermo = marquee.slice(marquee.indexOf("{!scorre ? ("), marquee.indexOf(") : ("));
    expect(ramoFermo).toContain("<MarqueeRow dealers={dealers} />");
    expect(ramoFermo).not.toContain("duplicate");
  });

  it("sopra la soglia la seconda copia resta, altrimenti lo scorrimento avrebbe uno stacco", () => {
    const ramoScorrevole = marquee.slice(marquee.indexOf(") : ("));
    expect(ramoScorrevole).toContain("marketplace-marquee-track");
    expect(ramoScorrevole).toContain("<MarqueeRow dealers={dealers} duplicate />");
  });

  it("la soglia e' piu' di due: due nomi ripetuti si notano quanto uno", () => {
    const soglia = Number(marquee.match(/MIN_DEALERS_FOR_MARQUEE = (\d+)/)?.[1] ?? 0);
    expect(soglia).toBeGreaterThan(2);
  });
});
