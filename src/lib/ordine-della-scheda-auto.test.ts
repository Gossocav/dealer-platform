import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { marcaModelloEVersione, resolveVehicleLabel } from "@/lib/public-marketplace";

/**
 * **L'ordine della scheda auto sul telefono: guarda, capisce, contatta.**
 *
 * Il difetto che chiude, deciso dal titolare il 20/09/2026 guardando la
 * pagina: **il modulo "Richiedi informazioni" arrivava prima della
 * descrizione della vettura.** Chiedevamo al cliente di scrivere prima di
 * avergli mostrato cosa compra, e nessuno scrive a una concessionaria senza
 * aver letto la descrizione.
 *
 * Era colpa di come era stato chiesto il lavoro precedente -- "il modulo
 * subito dopo i quattro dati" -- che ragionava sulla **distanza in pixel**
 * invece che sull'**ordine in cui uno decide**. Il numero migliorava e la
 * pagina peggiorava: e' il caso da ricordare quando una misura va nella
 * direzione giusta e la cosa misurata era quella sbagliata.
 *
 * Misurato a 390x844, prima e dopo:
 *
 * | | prima | dopo |
 * |---|---|---|
 * | il blocco del titolo e' alto | 337px | **183px** (207 col titolo piu' lungo) |
 * | il prezzo si vede a | 1.055px | **231px** |
 * | la prima foto comincia a | 106px | **313px** (sopra la piega) |
 * | la descrizione a | 2.612px | **1.299px** |
 * | il modulo a | 1.546px | **1.835px** |
 */
const scheda = readFileSync("src/app/(marketplace)/auto/[id]/page.tsx", "utf8");
const pulsante = readFileSync("src/app/(marketplace)/auto/[id]/bottone-contatta.tsx", "utf8");

const senzaCommenti = (testo: string) =>
  testo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("//"))
    .join("\n");

const soloCodice = senzaCommenti(scheda);

/**
 * La posizione sul telefono: l'ultimo `order-N` dichiarato prima dell'ancora.
 *
 * L'ancora dev'essere **unica**: `formatPrice(vehicle.price)` compare anche
 * nella descrizione per i motori di ricerca e nei dati strutturati, molto
 * prima del titolo, e cercarla cosi' trovava quella e rispondeva `null`.
 */
function posizione(ancora: string): number | null {
  const i = soloCodice.indexOf(ancora);
  expect(i, `non trovo ${ancora}`).toBeGreaterThan(-1);
  const trovati = [...soloCodice.slice(0, i).matchAll(/\border-(\d)\b/g)];
  return trovati.length ? Number(trovati[trovati.length - 1][1]) : null;
}

describe("guarda, capisce, contatta: l'ordine sul telefono", () => {
  it("il modulo viene **dopo** la descrizione e la scheda tecnica", () => {
    // La regola, non i numeri: e' questo il difetto che si sta impedendo.
    const descrizione = posizione("{descrizione ?");
    const tecnica = posizione("Scheda tecnica</h2>");
    const modulo = posizione("<RequestInformationForm");
    expect(descrizione).not.toBeNull();
    expect(tecnica! > descrizione!, "la scheda tecnica deve stare dopo la descrizione").toBe(true);
    expect(modulo! > tecnica!, "il modulo deve stare dopo la scheda tecnica").toBe(true);
  });

  it("e l'ordine intero e' quello deciso", () => {
    expect(posizione("<h1")).toBe(1);
    expect(posizione("<VehicleGallery")).toBe(2);
    expect(posizione("heroSpecs.map")).toBe(3);
    expect(posizione("{descrizione ?")).toBe(4);
    expect(posizione("Scheda tecnica</h2>")).toBe(5);
    expect(posizione("<RequestInformationForm")).toBe(6);
    expect(posizione("Vedi tutti i veicoli di")).toBe(7);
    expect(posizione("Torna al catalogo")).toBe(8);
  });
});

describe("il titolo sta basso e non taglia niente", () => {
  it("marca e modello da una parte, versione dall'altra", () => {
    // Le due parti rimesse insieme devono dare esattamente l'etichetta
    // intera: se divergessero, la pagina direbbe di se' due cose diverse.
    const casi = [
      { brand: "Jeep", model: "compass", version: "1.3 PHEV Limited 4xe" },
      { brand: "Jaguar", model: "f pace", version: "Jaguar F-Pace 2.0 D 180 CV AWD aut.Prestige" },
      { brand: "Dacia", model: "sandero", version: "Stepway 0.9 Sce 67 CV Comfort" },
      { brand: "Fiat", model: "panda", version: null },
    ];
    for (const caso of casi) {
      const { marcaModello, versione } = marcaModelloEVersione(caso);
      expect([marcaModello, versione].filter(Boolean).join(" ")).toBe(resolveVehicleLabel(caso));
      expect(marcaModello).not.toBe("");
    }
  });

  it("la versione non si taglia mai", () => {
    // Il difetto del 19/09: su 174 delle 279 automobili la Versione
    // arrivava monca, ed e' proprio il dato che distingue un allestimento
    // dall'altro. Il titolo si spezza per stare basso, non si accorcia.
    const i = soloCodice.indexOf("<h1");
    const titolo = soloCodice.slice(i, soloCodice.indexOf("</p>", soloCodice.indexOf("{versione ?", i)));
    expect(titolo).not.toContain("line-clamp");
    expect(titolo).not.toContain("truncate");
    expect(titolo).toContain("break-words");
  });

  it("il prezzo sta nello stesso blocco del titolo, non altrove", () => {
    // Prima si vedeva a 1.055px, cioe' una schermata e un quarto sotto il
    // bordo: e' la seconda cosa che uno guarda dopo la foto.
    expect(posizione('text-3xl font-extrabold tracking-tight text-white sm:mt-4')).toBe(1);
  });
});

describe("il pulsante fisso non copre mai il modulo", () => {
  it("compare solo quando il modulo e' fuori dallo schermo", () => {
    // Un pulsante fisso sempre acceso copre proprio la cosa a cui dice di
    // portare -- sul telefono l'ultimo campo o il bottone "Invia" -- e
    // annullerebbe il lavoro fatto sul modulo il 19/09.
    //
    // Verificato con un browser a otto altezze di scorrimento: acceso a 0 e
    // 600, spento da 1.200 a 2.600 (modulo in vista), riacceso a 3.200.
    expect(pulsante).toContain("IntersectionObserver");
    expect(pulsante).toMatch(/setDaMostrare\(!voce\.isIntersecting\)/);
  });

  it("quando e' spento non intercetta i tocchi e non si raggiunge col Tab", () => {
    // Un rettangolo invisibile in fondo allo schermo mangerebbe i tocchi
    // sulla pagina sotto, e il Tab finirebbe su un comando che non si vede.
    expect(pulsante).toContain("pointer-events-none");
    expect(pulsante).toMatch(/tabIndex=\{daMostrare \? undefined : -1\}/);
    expect(pulsante).toMatch(/aria-hidden=\{!daMostrare\}/);
  });

  it("su schermo largo non esiste", () => {
    // Li' il modulo e' nella colonna di destra e si vede senza scorrere.
    expect(pulsante).toContain("lg:hidden");
  });

  it("senza JavaScript la pagina resta intera", () => {
    // Il pulsante non compare e basta: il modulo e' comunque nella pagina,
    // e ci si arriva scorrendo come prima.
    expect(pulsante).toMatch(/useState\(false\)/);
  });
});
