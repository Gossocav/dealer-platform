import { describe, expect, it } from "vitest";
import { identificativoVideo, indirizzoDaSalvare, indirizzoDelRiquadro } from "@/lib/video-annuncio";

/**
 * Il concessionario incolla quello che ha sotto mano, e le forme sono tante:
 * l'indirizzo della barra del browser, quello che produce "Condividi"
 * sull'app, il collegamento di uno Short. Rifiutarne una vorrebbe dire dirgli
 * che il suo video "non e' valido" mentre lo e'.
 */
describe("l'identificativo si riconosce in tutte le forme che si incollano", () => {
  const ID = "dQw4w9WgXcQ";

  const FORME = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
    `https://www.youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?list=PL123&v=${ID}`,
  ];

  for (const forma of FORME) {
    it(`riconosce ${forma.trim()}`, () => {
      expect(identificativoVideo(forma)).toBe(ID);
    });
  }
});

/**
 * Il difetto che questi test impediscono: salvare un indirizzo qualunque.
 * Il sito blocca ogni contenuto esterno e apre il permesso al solo dominio di
 * YouTube: un indirizzo diverso darebbe un riquadro bianco senza nessuna
 * spiegazione, e il concessionario crederebbe che la piattaforma sia rotta.
 */
describe("quello che non e' un video YouTube non si salva", () => {
  const RIFIUTATI = [
    "",
    "   ",
    null,
    undefined,
    "non un indirizzo",
    "https://vimeo.com/123456789",
    "https://www.dailymotion.com/video/x8abcde",
    "https://www.youtube.com/",
    "https://www.youtube.com/results?search_query=auto",
    "https://www.youtube.com/@unconcessionario",
    "https://esempio.it/watch?v=dQw4w9WgXcQ",
    // Un dominio che *contiene* youtube.com ma non e' YouTube.
    "https://youtube.com.esempio.it/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    // Identificativo della lunghezza sbagliata: gli undici caratteri di
    // YouTube non sono un dettaglio, un valore piu' corto non e' un video.
    "https://youtu.be/abc123",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQextra",
  ];

  for (const valore of RIFIUTATI) {
    it(`rifiuta ${JSON.stringify(valore)}`, () => {
      expect(identificativoVideo(valore)).toBeNull();
      expect(indirizzoDelRiquadro(valore)).toBeNull();
      expect(indirizzoDaSalvare(valore)).toBeNull();
    });
  }
});

describe("il riquadro punta dove la sicurezza del sito permette", () => {
  it("usa il dominio senza cookie", () => {
    expect(indirizzoDelRiquadro("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    );
  });

  // Senza, a fine video comparirebbero le automobili di un concorrente
  // dentro la nostra pagina.
  it("limita i video suggeriti", () => {
    expect(indirizzoDelRiquadro("https://youtu.be/dQw4w9WgXcQ")).toContain("rel=0");
  });
});

describe("si salva sempre nella stessa forma", () => {
  // Due concessionari incollano due forme diverse dello stesso video: nel
  // database deve finirci la stessa riga, altrimenti non sono confrontabili.
  it("qualunque forma diventa l'indirizzo canonico", () => {
    for (const forma of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    ]) {
      expect(indirizzoDaSalvare(forma)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    }
  });
});
