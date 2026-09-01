import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_AREA_PREFIXES, isPrivateAreaPath } from "@/lib/private-areas";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const proxy = read("src/proxy.ts");
const robots = read("src/app/robots.ts");
const rootLayout = read("src/app/layout.tsx");

// Il gestionale risponde 200 a chiunque, anche senza login: i dati sono al
// sicuro, ma per Google sarebbero decine di pagine vuote e identiche.
describe("le aree private restano fuori dai motori di ricerca", () => {
  it("riconosce le sezioni del gestionale e non il marketplace", () => {
    for (const privata of ["/dashboard", "/veicoli", "/admin/dealers", "/impostazioni", "/api/marketplace/lead", "/lead/123"]) {
      expect(isPrivateAreaPath(privata), privata).toBe(true);
    }

    for (const pubblica of ["/", "/auto", "/auto/abc-123", "/ricerca", "/concessionarie", "/concessionarie/rossi-auto", "/faq", "/registrazione"]) {
      expect(isPrivateAreaPath(pubblica), pubblica).toBe(false);
    }
  });

  // Il nome di una sezione privata non deve poter catturare un indirizzo
  // pubblico che comincia con le stesse lettere.
  it("non scambia per privata una pagina che inizia allo stesso modo", () => {
    expect(isPrivateAreaPath("/veicoli-usati")).toBe(false);
    expect(isPrivateAreaPath("/loginformazioni")).toBe(false);
    expect(isPrivateAreaPath("/accountanti")).toBe(false);
  });

  it("il proxy manda l'intestazione che vale anche per chi arriva da un link esterno", () => {
    expect(proxy).toContain("isPrivateAreaPath(request.nextUrl.pathname)");
    expect(proxy).toContain('response.headers.set("X-Robots-Tag", "noindex, nofollow")');
  });

  it("robots.txt e l'intestazione dicono la stessa cosa", () => {
    // Due elenchi scritti a mano finirebbero per divergere: quello vero e'
    // uno solo, e robots.txt lo rilegge.
    expect(robots).toContain("PRIVATE_AREA_PREFIXES");
    expect(PRIVATE_AREA_PREFIXES).toContain("/dashboard");
    expect(PRIVATE_AREA_PREFIXES).toContain("/admin");
    expect(PRIVATE_AREA_PREFIXES).toContain("/api");
  });

  /**
   * Il difetto che questo test impedisce, con il caso che l'ha prodotto: la
   * pagina Vendite e' nata il 31/08/2026 e nessuno si e' ricordato di
   * aggiungerla all'elenco. Per un giorno `/vendite` e' stata l'unica pagina
   * del gestionale che i motori di ricerca potevano indicizzare -- non i
   * dati, che senza login non si vedono, ma una pagina vuota a nome della
   * concessionaria.
   *
   * L'elenco delle sezioni si legge da `src/app` invece di essere scritto a
   * mano qui, perche' un elenco scritto a mano dimentica esattamente la
   * pagina aggiunta domani, che e' quella che tornerebbe a sfuggire.
   */
  it("ogni sezione del gestionale e' nell'elenco, comprese quelle aggiunte dopo", () => {
    // Le pagine pubbliche vivono tutte dentro il gruppo (marketplace).
    // Fuori resta solo /og, che disegna le immagini delle anteprime dei link:
    // deve restare raggiungibile, ed e' fatta apposta per essere letta da
    // fuori.
    const PUBBLICHE_DI_PROPOSITO = ["og"];

    const sezioni = readdirSync(resolve(process.cwd(), "src/app"), { withFileTypes: true })
      .filter((voce) => voce.isDirectory())
      // I gruppi fra parentesi non compaiono nell'indirizzo.
      .filter((voce) => !voce.name.startsWith("("))
      .map((voce) => voce.name)
      .filter((nome) => !PUBBLICHE_DI_PROPOSITO.includes(nome));

    expect(sezioni.length, "nessuna sezione trovata sotto src/app").toBeGreaterThan(10);

    for (const sezione of sezioni) {
      expect(
        isPrivateAreaPath(`/${sezione}`),
        `/${sezione} non e' nell'elenco delle aree private: i motori di ricerca la indicizzerebbero`
      ).toBe(true);
    }
  });

  it("robots.txt dichiara dove sta la sitemap", () => {
    expect(robots).toContain("sitemap: `${baseUrl}/sitemap.xml`");
  });
});

// Ogni pagina senza titolo proprio si prendeva "KeyAuto | Registrazione":
// lo mostravano l'elenco concessionarie, la richiesta demo e il gestionale.
describe("il titolo di ripiego non parla piu' di registrazione", () => {
  it("il ripiego descrive il sito, non una sua pagina", () => {
    // Solo il valore, non il commento che racconta com'era prima.
    const ripiego = rootLayout.match(/default: "([^"]+)"/)?.[1] ?? "";
    expect(ripiego).not.toBe("KeyAuto | Registrazione");
    expect(ripiego).toContain("KeyAuto");
    expect(rootLayout).toContain('template: "%s | KeyAuto"');
  });

  it("dichiara l'indirizzo di base, senza cui un'anteprima relativa fa fallire la build", () => {
    expect(rootLayout).toContain("metadataBase: new URL(getAppBaseUrl())");
  });

  it("nessuna pagina ripete il suffisso che ora aggiunge il template", () => {
    const pagine = [
      "src/app/(marketplace)/faq/page.tsx",
      "src/app/(marketplace)/privacy/page.tsx",
      "src/app/(marketplace)/termini/page.tsx",
      "src/app/(marketplace)/termini-concessionari/page.tsx",
      "src/app/(marketplace)/come-funziona/page.tsx",
      "src/app/(marketplace)/consenso-marketing/page.tsx",
    ];

    for (const percorso of pagine) {
      const sorgente = read(percorso);
      const titolo = sorgente.match(/^ {2}title: "([^"]+)"/m)?.[1] ?? "";
      expect(titolo, percorso).not.toBe("");
      expect(titolo, `${percorso} raddoppierebbe il suffisso`).not.toContain("| KeyAuto");
    }
  });

  it("le pagine pubbliche che non avevano un titolo ora ce l'hanno", () => {
    for (const percorso of [
      "src/app/(marketplace)/concessionarie/page.tsx",
      "src/app/(marketplace)/registrazione/page.tsx",
      "src/app/(marketplace)/registrazione/base/page.tsx",
      "src/app/(marketplace)/registrazione/pro/page.tsx",
      "src/app/(marketplace)/registrazione/elite/page.tsx",
      // La pagina demo e' un componente client: il titolo sta nel suo layout.
      "src/app/(marketplace)/demo/layout.tsx",
    ]) {
      const sorgente = read(percorso);
      expect(sorgente, percorso).toContain("export const metadata");
      expect(sorgente, percorso).toContain("canonical");
    }
  });
});

// Un annuncio venduto rispondeva "200 va tutto bene" mostrando "non
// disponibile": per Google restava una pagina viva e vuota.
describe("le pagine che non esistono non chiedono di essere indicizzate", () => {
  const veicolo = read("src/app/(marketplace)/auto/[id]/page.tsx");
  const concessionaria = read("src/app/(marketplace)/concessionarie/[slug]/page.tsx");

  it("la scheda veicolo dichiara notFound invece di disegnare una finta pagina", () => {
    expect(veicolo).toContain("notFound()");
    expect(veicolo).toContain('from "next/navigation"');
  });

  it("nessuna delle due dichiara un indirizzo canonico quando il contenuto non c'e'", () => {
    for (const [nome, sorgente] of [["veicolo", veicolo], ["concessionaria", concessionaria]] as const) {
      const ramo = sorgente.slice(sorgente.indexOf("if (!data)") >= 0 ? sorgente.indexOf("if (!data)") : sorgente.indexOf("if (!matchedDealer)"));
      const primoRitorno = ramo.slice(0, ramo.indexOf("}\n"));
      expect(primoRitorno, nome).toContain("robots: { index: false, follow: true }");
      expect(primoRitorno, nome).not.toContain("canonical");
    }
  });

  // Il guasto del database e' un'altra cosa: dichiarare sparito un veicolo che
  // esiste lo farebbe togliere dall'indice per un'interruzione momentanea.
  it("un errore del database non viene scambiato per un veicolo inesistente", () => {
    expect(veicolo).toContain("if (error) {");
    expect(veicolo).toContain("Impossibile caricare la scheda veicolo");
  });
});
