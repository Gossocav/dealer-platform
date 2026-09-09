import { describe, expect, it } from "vitest";
import {
  analizzaRobots,
  analizzaSitemap,
  estraiCanonico,
  estraiTitolo,
  gruppiDiTitoliUguali,
  idDelleSchede,
  primaFoto,
  problemiDellIndirizzoFoto,
  problemiDellaScheda,
} from "../../scripts/controllo-indicizzazione.mjs";

/**
 * Cosa impedisce questo file.
 *
 * Il guardiano notturno guarda il sito vero, e va bene. Ma il *giudizio* --
 * "questo indirizzo e' rotto", "questi due titoli sono uguali" -- e' codice
 * come un altro, e se sbaglia il guardiano diventa peggio di niente: verde
 * mentre il sito e' rotto, oppure rosso mentre sta bene, e in tre giorni
 * nessuno lo guarda piu'.
 *
 * Un caso e' capitato davvero, mentre scrivevo lo script: la mia prima sonda
 * cercava solo le fotografie nella forma "?foto=", e su una scheda con foto
 * importate dal sito di una concessionaria -- che usano "?url=" -- non trovava
 * niente e finiva per chiedere la home, ottenendo `text/html`. Sembrava che le
 * fotografie fossero rotte. Non lo erano: era sbagliata la sonda. Da qui il
 * test su tutte e due le forme.
 */

describe("robots.txt", () => {
  it("riconosce il permesso sulle fotografie e il divieto sul gestionale", () => {
    const testo = ["User-Agent: *", "Allow: /", "Allow: /api/image-proxy", "Disallow: /dashboard/", "", "Sitemap: https://esempio/sitemap.xml"].join("\n");

    expect(analizzaRobots(testo)).toEqual({
      permetteLeFoto: true,
      vietaIlGestionale: true,
      dichiaraLaSitemap: true,
    });
  });

  it("si accorge se il permesso sulle fotografie sparisce", () => {
    const senzaPermesso = ["User-Agent: *", "Allow: /", "Disallow: /api/", "Disallow: /dashboard/"].join("\n");

    expect(analizzaRobots(senzaPermesso).permetteLeFoto).toBe(false);
  });
});

describe("sitemap", () => {
  const xml = `
    <urlset>
      <url><loc>https://k.it</loc></url>
      <url><loc>https://k.it/privacy</loc></url>
      <url><loc>https://k.it/auto/aaa</loc><lastmod>2026-09-01T00:00:00.000Z</lastmod></url>
      <url><loc>https://k.it/concessionarie/rossi</loc><lastmod>2026-09-02T00:00:00.000Z</lastmod></url>
    </urlset>`;

  it("divide gli indirizzi per tipo", () => {
    const letta = analizzaSitemap(xml);

    expect(letta.veicoli).toHaveLength(1);
    expect(letta.concessionarie).toHaveLength(1);
    expect(letta.fisse).toHaveLength(2);
  });

  it("vede quando una pagina fissa dichiara una data, che sarebbe inventata", () => {
    const conDataFinta = xml.replace(
      "<loc>https://k.it/privacy</loc>",
      "<loc>https://k.it/privacy</loc><lastmod>2026-09-09T10:00:00.000Z</lastmod>"
    );

    expect(analizzaSitemap(xml).fisse.every((v) => !v.data)).toBe(true);
    expect(analizzaSitemap(conDataFinta).fisse.every((v) => !v.data)).toBe(false);
  });
});

describe("una scheda veicolo", () => {
  const sana = {
    url: "https://k.it/auto/aaa",
    stato: 200,
    titolo: "Peugeot 2008 · Grigio | KeyAuto",
    canonico: "https://k.it/auto/aaa",
    xRobotsTag: null,
  };

  it("sana non ha problemi", () => {
    expect(problemiDellaScheda(sana)).toEqual([]);
  });

  it("che risponde male viene segnalata", () => {
    expect(problemiDellaScheda({ ...sana, stato: 500 })).toContain("risponde 500");
  });

  it("senza titolo viene segnalata", () => {
    expect(problemiDellaScheda({ ...sana, titolo: "   " })).toContain("senza titolo");
  });

  it("che dichiara un'altra pagina come originale viene segnalata", () => {
    // E' il modo silenzioso di dire a Google "non tenere questa".
    const problemi = problemiDellaScheda({ ...sana, canonico: "https://k.it/auto/bbb" });

    expect(problemi.join(" ")).toContain("indirizzo canonico diverso");
  });

  it("che chiede di non essere indicizzata viene segnalata", () => {
    expect(problemiDellaScheda({ ...sana, xRobotsTag: "noindex, nofollow" }).join(" ")).toContain("noindex");
  });
});

describe("l'indirizzo di una fotografia", () => {
  it("va bene con il percorso di una foto nostra", () => {
    expect(problemiDellIndirizzoFoto("/api/image-proxy?foto=cartella%2Ffoto.jpg&w=1200&q=75")).toEqual([]);
  });

  it("va bene anche con l'indirizzo di una foto importata da un sito esterno", () => {
    // La forma che la mia prima sonda non riconosceva, facendo sembrare rotte
    // fotografie che stavano benissimo.
    expect(problemiDellIndirizzoFoto("/api/image-proxy?url=https%3A%2F%2Fcdn.esempio.it%2Ffoto.jpg&w=3840&q=75")).toEqual([]);
  });

  it("e' rotto se contiene un lasciapassare che scade", () => {
    // Il difetto corretto con la PR #292: durava sessanta minuti, poi 404.
    const conFirma = "/api/image-proxy?url=https%3A%2F%2Fx.supabase.co%2Fobject%2Fsign%2Ff.jpg%3Ftoken%3DeyJhbGci&w=1200";

    expect(problemiDellIndirizzoFoto(conFirma)).toContain("contiene un lasciapassare che scade");
  });

  it("e' rotto se non passa dal proxy", () => {
    expect(problemiDellIndirizzoFoto("https://x.supabase.co/storage/foto.jpg")).toContain("non passa dal proxy delle immagini");
  });
});

describe("lettura di una pagina", () => {
  it("trova la prima fotografia in tutte e due le forme", () => {
    const nostra = '<img src="/api/image-proxy?foto=a%2Fb.jpg&amp;w=640&amp;q=75">';
    const esterna = '<img src="/api/image-proxy?url=https%3A%2F%2Fcdn.it%2Fx.jpg&amp;w=640&amp;q=75">';

    expect(primaFoto(nostra)).toBe("/api/image-proxy?foto=a%2Fb.jpg&w=640&q=75");
    expect(primaFoto(esterna)).toContain("url=https%3A%2F%2Fcdn.it%2Fx.jpg");
  });

  it("non inventa una fotografia dove non ce n'e' nessuna", () => {
    expect(primaFoto("<p>nessuna immagine</p>")).toBeNull();
  });

  it("legge titolo e indirizzo canonico", () => {
    const html = '<title>Peugeot 2008 | KeyAuto</title><link rel="canonical" href="https://k.it/auto/aaa"/>';

    expect(estraiTitolo(html)).toBe("Peugeot 2008 | KeyAuto");
    expect(estraiCanonico(html)).toBe("https://k.it/auto/aaa");
  });

  it("raccoglie le schede linkate da una pagina di catalogo, senza doppioni", () => {
    const html = [
      '<a href="/auto/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">',
      '<a href="/auto/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">',
      '<a href="/auto/11111111-2222-3333-4444-555555555555">',
    ].join("");

    expect(idDelleSchede(html)).toHaveLength(2);
  });
});

describe("titoli che si ripetono", () => {
  it("trova i gruppi, dal piu' grosso", () => {
    const titoli = ["Peugeot 2008", "Peugeot 2008", "Peugeot 2008", "Jeep Avenger", "Jeep Avenger", "Fiat Panda"];

    expect(gruppiDiTitoliUguali(titoli)).toEqual([
      ["Peugeot 2008", 3],
      ["Jeep Avenger", 2],
    ]);
  });

  it("non conta come doppione un titolo mancante", () => {
    // Due schede senza titolo sono un problema, ma un altro: lo segnala
    // problemiDellaScheda. Contarle qui direbbe "due schede si chiamano
    // uguale" indicando il nulla.
    expect(gruppiDiTitoliUguali(["", "", "   "])).toEqual([]);
  });

  it("a catalogo sano non trova niente", () => {
    expect(gruppiDiTitoliUguali(["Peugeot 2008", "Jeep Avenger"])).toEqual([]);
  });
});
