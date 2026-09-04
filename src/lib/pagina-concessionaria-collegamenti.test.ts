import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(
  resolve(process.cwd(), "src/app/(marketplace)/concessionarie/[slug]/page.tsx"),
  "utf8"
);

/**
 * Il riquadro tolto il 04/09/2026, su richiesta del titolare.
 *
 * Conteneva il nome della concessionaria -- gia' scritto grande subito sopra,
 * quindi due volte sulla stessa schermata -- la sua iniziale dentro un
 * quadrato, e tre pulsanti di natura diversa messi insieme: il noleggio, che
 * e' della concessionaria, e due collegamenti che portano via da lei.
 */
describe("la pagina della concessionaria non ripete il nome", () => {
  it("il nome compare una volta sola come titolo", () => {
    const titoli = pagina.match(/<h1[^>]*>[\s\S]{0,80}?\{dealerName\}/g) ?? [];
    const sottotitoli = pagina.match(/<h2[^>]*>\{dealerName\}<\/h2>/g) ?? [];
    expect(titoli.length, "manca il titolo con il nome").toBe(1);
    expect(sottotitoli.length, "il nome e' ancora ripetuto in un secondo riquadro").toBe(0);
  });

  it("l'iniziale dentro il quadrato non c'e' piu'", () => {
    expect(pagina).not.toContain("dealerName.charAt(0)");
  });
});

/**
 * I tre pulsanti erano insieme ma rispondono a due bisogni opposti: il
 * noleggio e' quello che la concessionaria vende, gli altri due portano
 * altrove. Tenerli insieme dava al secondo gruppo il posto migliore della
 * pagina per mandare via chi era appena arrivato.
 */
describe("ogni collegamento sta dove serve a chi legge", () => {
  const intestazione = pagina.slice(pagina.indexOf("<h1"), pagina.indexOf("<DealerVehicleSearch"));
  const fondo = pagina.slice(pagina.indexOf("</DealerVehicleSearch>"));

  it("i due pulsanti stanno in alto, accanto al nome", () => {
    expect(intestazione).toContain("<PulsanteNoleggio");
    expect(intestazione).toContain("<BottoneSitoConcessionaria");
  });

  // Il noleggio davanti al sito: uguali nell'aspetto perche' cosi' li ha
  // voluti il titolare, e allora l'ordine resta l'unica cosa che dice quale
  // delle due conta di piu' -- quella che la concessionaria vende.
  it("il noleggio viene prima del sito", () => {
    expect(intestazione.indexOf("<PulsanteNoleggio")).toBeLessThan(
      intestazione.indexOf("<BottoneSitoConcessionaria")
    );
  });

  // A destra su schermo largo, incolonnati sotto il testo sul telefono: due
  // pulsanti affiancati su uno schermo stretto diventano illeggibili.
  it("stanno a destra su schermo largo e sotto sul telefono", () => {
    // La disposizione sta sul contenitore, che viene prima del titolo: si
    // guarda il riquadro in cima per intero, non la parte dopo il nome.
    const riquadroInCima = pagina.slice(pagina.indexOf("<section"), pagina.indexOf("<DealerVehicleSearch"));
    expect(riquadroInCima).toContain("lg:flex-row");
    expect(riquadroInCima).toContain("lg:justify-end");
  });

  it("catalogo e elenco concessionarie stanno in fondo, dopo le automobili", () => {
    expect(fondo).toContain('href="/auto"');
    expect(fondo).toContain("Catalogo auto");
    expect(fondo).toContain('href="/concessionarie"');
    expect(fondo).toContain("Tutte le concessionarie");
  });

  // Il difetto che questo impedisce: rimetterli in cima "perche' si vedono
  // meglio". Si vedono meglio, ed e' il problema: sono la via d'uscita.
  it("e non sono tornati in cima", () => {
    expect(intestazione).not.toContain("Catalogo auto");
    expect(intestazione).not.toContain("Tutte le concessionarie");
  });

  it("restano collegamenti veri, non testo", () => {
    expect(fondo).toMatch(/<Link\s+href="\/auto"/);
    expect(fondo).toMatch(/<Link\s+href="\/concessionarie"/);
  });
});
