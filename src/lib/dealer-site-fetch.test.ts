import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Verifica l'indirizzo" quando l'indirizzo e' giusto.
 *
 * Il difetto che questo file impedisce: fino al 23/09/2026 qualunque motivo
 * per cui l'elenco non si leggeva finiva nella stessa frase, e la frase dava
 * la colpa a chi aveva scritto l'indirizzo. Un concessionario con il sito su
 * GestionaleAuto.com -- indirizzo corretto, sito che risponde, sitemap che
 * cerchiamo assente (404) -- leggeva che doveva verificare l'indirizzo, e se
 * ne andava. Misurato quel giorno: robertoferrariauto.it risponde 200 sulla
 * home e 404 text/html sulla sitemap; i tre siti DealerK collegati 200
 * text/xml; un dominio inesistente non risponde affatto.
 *
 * Tre cose diverse, tre frasi diverse, e ognuna dice cosa puo' fare lui.
 */

const mocks = vi.hoisted(() => ({
  fetchWithSsrfProtection: vi.fn(),
}));

vi.mock("@/lib/ssrf-protection", () => ({
  fetchWithSsrfProtection: mocks.fetchWithSsrfProtection,
  IndirizzoNonAmmesso: class IndirizzoNonAmmesso extends Error {},
}));

import { elencoStock, elencoStockConEsito, spiegaElencoNonLetto, type EsitoElenco } from "@/lib/dealer-site-fetch";

const HOST = "robertoferrariauto.it";
const INDIRIZZO = `https://www.${HOST}/auto_usate_0-sitemap.xml`;

const SITEMAP = `<?xml version="1.0"?><urlset>
  <url><loc>https://www.${HOST}/auto/usate/parma/fiat/panda/benzina/1-0-hybrid/7474578/</loc></url>
  <url><loc>https://www.${HOST}/auto/usate/</loc></url>
</urlset>`;

const PAGINA_NON_TROVATO_MA_200 = `<!doctype html><html><body><h1>Pagina non trovata</h1></body></html>`;

function risposta(status: number, body: string, contentType = "text/html") {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

beforeEach(() => {
  mocks.fetchWithSsrfProtection.mockReset();
});

describe("elencoStockConEsito distingue i tre modi in cui l'elenco non si legge", () => {
  it("nessuna risposta: non-raggiunto, senza stato HTTP", async () => {
    mocks.fetchWithSsrfProtection.mockRejectedValue(new TypeError("fetch failed"));
    const esito = await elencoStockConEsito(HOST);
    expect(esito).toEqual({ ok: false, motivo: "non-raggiunto", indirizzo: INDIRIZZO });
  });

  // Il caso di GestionaleAuto: il sito c'e', la sitemap che cerchiamo no.
  it("il sito risponde 404: elenco-non-trovato, con lo stato che ha risposto", async () => {
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(404, PAGINA_NON_TROVATO_MA_200));
    const esito = await elencoStockConEsito(HOST);
    expect(esito).toEqual({ ok: false, motivo: "elenco-non-trovato", indirizzo: INDIRIZZO, stato: 404 });
  });

  it("il sito risponde 429: frenato, non 'non trovato'", async () => {
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(429, ""));
    const esito = await elencoStockConEsito(HOST);
    expect(esito).toEqual({ ok: false, motivo: "frenato", indirizzo: INDIRIZZO, stato: 429 });
  });

  // Il sito che risponde 200 con una pagina HTML "non trovato": prima
  // finiva in parseDealerStockSitemap e usciva come "zero veicoli", cioe'
  // un guasto raccontato come un fatto.
  it("200 ma senza nessun <loc>: elenco-illeggibile", async () => {
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(200, PAGINA_NON_TROVATO_MA_200));
    const esito = await elencoStockConEsito(HOST);
    expect(esito).toEqual({ ok: false, motivo: "elenco-illeggibile", indirizzo: INDIRIZZO, stato: 200 });
  });

  it("una sitemap vera: ok, con le vetture riconosciute", async () => {
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(200, SITEMAP, "text/xml"));
    const esito = await elencoStockConEsito(HOST);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.voci.map((v) => v.sourceId)).toEqual(["7474578"]);
  });

  // La sincronizzazione periodica non spiega niente a nessuno, e davanti a
  // un elenco non letto -- per qualunque motivo -- non deve toccare niente.
  it("elencoStock risponde null per ogni motivo, e mai un elenco vuoto per un guasto", async () => {
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(200, PAGINA_NON_TROVATO_MA_200));
    expect(await elencoStock(HOST)).toBeNull();
    mocks.fetchWithSsrfProtection.mockResolvedValue(risposta(404, ""));
    expect(await elencoStock(HOST)).toBeNull();
  });
});

describe("le parole dicono cosa fare, e non danno la colpa a chi ha scritto l'indirizzo", () => {
  const casi: Array<Extract<EsitoElenco, { ok: false }>> = [
    { ok: false, motivo: "non-raggiunto", indirizzo: INDIRIZZO },
    { ok: false, motivo: "frenato", indirizzo: INDIRIZZO, stato: 429 },
    { ok: false, motivo: "elenco-non-trovato", indirizzo: INDIRIZZO, stato: 404 },
    { ok: false, motivo: "elenco-illeggibile", indirizzo: INDIRIZZO, stato: 200 },
  ];

  it("quattro motivi, quattro frasi diverse", () => {
    const frasi = casi.map((c) => spiegaElencoNonLetto(c, HOST));
    expect(new Set(frasi).size).toBe(casi.length);
  });

  it.each(casi)("$motivo: nomina il sito, l'indirizzo provato, e non dice 'verifica l'indirizzo'", (caso) => {
    const frase = spiegaElencoNonLetto(caso, HOST);
    expect(frase).toContain(HOST);
    // "Frenato" e' l'unico caso in cui aprire l'indirizzo non serve a niente:
    // il sito c'e', ci chiede solo di aspettare.
    if (caso.motivo !== "frenato") expect(frase).toContain(INDIRIZZO);
    // La frase vecchia, alla lettera e in ogni variante di apostrofo: era
    // falsa in due casi su quattro, e la sua sola presenza rimanderebbe via
    // il concessionario che ha scritto l'indirizzo giusto.
    expect(frase.toLowerCase()).not.toMatch(/verifica l.indirizzo/);
  });

  it("nei due casi in cui l'indirizzo e' giusto lo dice, e indica un'altra strada", () => {
    for (const motivo of ["elenco-non-trovato", "elenco-illeggibile"] as const) {
      const frase = spiegaElencoNonLetto({ ok: false, motivo, indirizzo: INDIRIZZO, stato: 404 }, HOST);
      expect(frase).toContain("e' giusto");
      expect(frase).toContain("da un file");
    }
  });

  it("nei due casi passeggeri dice di riprovare", () => {
    for (const motivo of ["non-raggiunto", "frenato"] as const) {
      const frase = spiegaElencoNonLetto({ ok: false, motivo, indirizzo: INDIRIZZO }, HOST);
      expect(frase).toContain("riprova");
    }
  });
});

describe("la rotta dell'importazione passa dalle tre frasi", () => {
  // Un controllo sul testo, perche' il tipo non lo puo' pretendere: la rotta
  // potrebbe tornare a `elencoStock` e a una frase sola senza che nessun test
  // comportamentale se ne accorga.
  it("usa elencoStockConEsito e spiegaElencoNonLetto, e non contiene piu' la frase vecchia", async () => {
    const { readFileSync } = await import("node:fs");
    const sorgente = readFileSync("src/app/api/vehicles/import-site/route.ts", "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    expect(sorgente).toMatch(/await elencoStockConEsito\(host\)/);
    expect(sorgente).toMatch(/spiegaElencoNonLetto\(/);
    expect(sorgente.toLowerCase()).not.toMatch(/verifica l.indirizzo/);
  });
});
