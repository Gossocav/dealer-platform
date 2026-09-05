import { describe, expect, it } from "vitest";
import { leggiRichiestaDiVisita, sembraUnRobot } from "@/lib/visite-annunci";

const UN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("leggiRichiestaDiVisita", () => {
  it("accetta le due forme buone", () => {
    expect(leggiRichiestaDiVisita({ tipo: "annuncio", id: UN_ID })).toEqual({ tipo: "annuncio", id: UN_ID });
    expect(leggiRichiestaDiVisita({ tipo: "concessionaria", id: UN_ID })).toEqual({
      tipo: "concessionaria",
      id: UN_ID,
    });
  });

  /**
   * Il difetto che questo impedisce: un identificativo che non e' un
   * identificativo arriverebbe fino al database, che lo rifiuterebbe con un
   * errore di tipo. Meglio dire di no qui, dove costa nulla.
   */
  it("rifiuta tutto quello che non e' un identificativo", () => {
    for (const cattivo of ["", "123", "non-un-uuid", "' or 1=1 --", null, undefined, 42]) {
      expect(leggiRichiestaDiVisita({ tipo: "annuncio", id: cattivo })).toBeNull();
    }
  });

  it("rifiuta un tipo che non conosciamo", () => {
    expect(leggiRichiestaDiVisita({ tipo: "pagina", id: UN_ID })).toBeNull();
    expect(leggiRichiestaDiVisita({ id: UN_ID })).toBeNull();
  });

  it("rifiuta un corpo che non e' un oggetto", () => {
    for (const cattivo of [null, undefined, "annuncio", 7, []]) {
      expect(leggiRichiestaDiVisita(cattivo)).toBeNull();
    }
  });

  /**
   * La concessionaria non si accetta mai da fuori quando si conta un
   * annuncio: la ricava il database dalla vettura. Se passasse di qui,
   * chiunque potrebbe attribuire visite alla concessionaria che preferisce.
   */
  it("non porta con se' nessuna concessionaria dichiarata dal browser", () => {
    const letta = leggiRichiestaDiVisita({ tipo: "annuncio", id: UN_ID, dealerId: "un-altro" });
    expect(letta).toEqual({ tipo: "annuncio", id: UN_ID });
    expect(letta).not.toHaveProperty("dealerId");
  });
});

describe("sembraUnRobot", () => {
  it("riconosce i robot che si dichiarano", () => {
    const robot = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120",
    ];

    for (const ua of robot) {
      expect(sembraUnRobot(ua), ua).toBe(true);
    }
  });

  it("lascia passare i browser veri", () => {
    const persone = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
      "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
    ];

    for (const ua of persone) {
      expect(sembraUnRobot(ua), ua).toBe(false);
    }
  });

  /**
   * Una richiesta senza presentazione non viene da una persona che sta
   * guardando una pagina: e' il modo piu' semplice di chiamare l'indirizzo
   * da uno script.
   */
  it("una richiesta senza presentazione non conta", () => {
    expect(sembraUnRobot(null)).toBe(true);
    expect(sembraUnRobot("")).toBe(true);
    expect(sembraUnRobot("   ")).toBe(true);
  });
});
