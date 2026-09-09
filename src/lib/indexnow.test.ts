import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHIAVE_INDEXNOW, MAX_INDIRIZZI_PER_SEGNALAZIONE, costruisciSegnalazione, segnalaAIndexNow } from "@/lib/indexnow";

/**
 * Cosa impedisce questo file.
 *
 * **Perche' IndexNow esiste qui.** Su Bing il sito era a zero pagine,
 * verificato il 05/09/2026 con la stessa ricerca che su autoscout24.it ne
 * restituisce 23. La sitemap la si lascia li' e si spera che qualcuno passi;
 * IndexNow e' l'unico modo per dire "guarda qui adesso".
 *
 * **Il difetto che questo blocco impedisce e' silenzioso.** Se la segnalazione
 * partisse male -- un indirizzo di un altro dominio, la chiave scollegata dal
 * file pubblicato -- il motore la rifiuterebbe **in blocco**, e noi non ce ne
 * accorgeremmo mai: la sincronizzazione continuerebbe a dirsi riuscita, e le
 * auto nuove resterebbero invisibili come prima.
 */

const BASE = "https://www.keyauto.it";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("il messaggio da spedire", () => {
  it("dichiara sito, chiave e dove trovarla", () => {
    const segnalazione = costruisciSegnalazione(BASE, [`${BASE}/auto/aaa`]);

    expect(segnalazione).toEqual({
      host: "www.keyauto.it",
      key: CHIAVE_INDEXNOW,
      keyLocation: `${BASE}/${CHIAVE_INDEXNOW}.txt`,
      urlList: [`${BASE}/auto/aaa`],
    });
  });

  it("scarta gli indirizzi di un altro sito, che farebbero rifiutare tutto", () => {
    // Il protocollo rifiuta l'intera richiesta se anche un solo indirizzo non
    // appartiene al dominio dichiarato: uno sbagliato farebbe perdere anche
    // tutti gli altri.
    const segnalazione = costruisciSegnalazione(BASE, [
      `${BASE}/auto/aaa`,
      "https://www.autogepy.it/auto/usate/qualcosa/",
      `${BASE}/auto/bbb`,
    ]);

    expect(segnalazione?.urlList).toEqual([`${BASE}/auto/aaa`, `${BASE}/auto/bbb`]);
  });

  it("non ripete due volte lo stesso indirizzo", () => {
    const segnalazione = costruisciSegnalazione(BASE, [`${BASE}/auto/aaa`, `${BASE}/auto/aaa`]);

    expect(segnalazione?.urlList).toHaveLength(1);
  });

  it("scarta quello che non e' nemmeno un indirizzo", () => {
    expect(costruisciSegnalazione(BASE, ["   ", "non-un-indirizzo", "/auto/aaa"])).toBeNull();
  });

  it("senza niente da dire non costruisce nessun messaggio", () => {
    expect(costruisciSegnalazione(BASE, [])).toBeNull();
  });

  it("si ferma al tetto dichiarato dal protocollo", () => {
    const tanti = Array.from({ length: MAX_INDIRIZZI_PER_SEGNALAZIONE + 500 }, (_, i) => `${BASE}/auto/${i}`);

    expect(costruisciSegnalazione(BASE, tanti)?.urlList).toHaveLength(MAX_INDIRIZZI_PER_SEGNALAZIONE);
  });
});

describe("la spedizione non fa mai fallire chi la chiama", () => {
  // In prova `getAppBaseUrl()` vale localhost: un indirizzo di keyauto.it
  // verrebbe scartato come esterno, e la spedizione non partirebbe nemmeno.
  // Che il filtro faccia proprio questo lo prova il blocco qui sopra.
  const LOCALE = "http://localhost:3000";

  it("se la rete non risponde, lo dice e basta", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rete irraggiungibile"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(segnalaAIndexNow([`${LOCALE}/auto/aaa`])).resolves.toEqual({ inviati: 0, esito: "non-riuscita" });
  });

  it("se il motore rifiuta, lo dice e basta", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 422 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(segnalaAIndexNow([`${LOCALE}/auto/aaa`])).resolves.toEqual({ inviati: 0, esito: "rifiutata-422" });
  });

  it("senza niente da segnalare non chiama nessuno", async () => {
    const chiamata = vi.spyOn(globalThis, "fetch");

    await expect(segnalaAIndexNow([])).resolves.toEqual({ inviati: 0, esito: "niente-da-segnalare" });
    expect(chiamata).not.toHaveBeenCalled();
  });
});

describe("la chiave pubblicata e quella nel codice", () => {
  /**
   * Il difetto che questo test impedisce, ed e' invisibile senza.
   *
   * Il motore verifica che chi segnala controlli davvero il sito: chiede il
   * file `/<chiave>.txt` e si aspetta di trovarci dentro la stessa chiave.
   * Cambiandola nel codice e dimenticando il file -- o viceversa -- **ogni
   * segnalazione verrebbe rifiutata in silenzio**, e la sincronizzazione
   * continuerebbe a dichiararsi riuscita.
   */
  const cartellaPubblica = resolve(process.cwd(), "public");

  it("il file con la chiave esiste ed e' uno solo", () => {
    const chiavi = readdirSync(cartellaPubblica).filter((nome) => /^[0-9a-f]{8,128}\.txt$/i.test(nome));

    expect(chiavi).toEqual([`${CHIAVE_INDEXNOW}.txt`]);
  });

  it("il file contiene esattamente la chiave, senza niente attorno", () => {
    const contenuto = readFileSync(resolve(cartellaPubblica, `${CHIAVE_INDEXNOW}.txt`), "utf8");

    expect(contenuto).toBe(CHIAVE_INDEXNOW);
  });

  it("la chiave ha la forma che il protocollo accetta", () => {
    expect(CHIAVE_INDEXNOW).toMatch(/^[0-9a-f]{8,128}$/);
  });
});

describe("una spedizione riuscita", () => {
  it("dice quanti indirizzi ha segnalato, e li manda al posto giusto", async () => {
    const chiamata = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    const esito = await segnalaAIndexNow(["http://localhost:3000/auto/aaa", "http://localhost:3000/auto/bbb"]);

    expect(esito).toEqual({ inviati: 2, esito: "inviata" });
    expect(chiamata).toHaveBeenCalledTimes(1);
    expect(String(chiamata.mock.calls[0][0])).toBe("https://api.indexnow.org/indexnow");

    const corpo = JSON.parse(String((chiamata.mock.calls[0][1] as RequestInit).body));
    expect(corpo.key).toBe(CHIAVE_INDEXNOW);
    expect(corpo.urlList).toHaveLength(2);
  });
});

describe("l'indirizzo della scheda da segnalare", () => {
  it("e' quello pubblico del marketplace, non quello del sito della concessionaria", async () => {
    const { indirizzoDellaScheda } = await import("@/lib/indexnow");

    expect(indirizzoDellaScheda("abc-123")).toBe("http://localhost:3000/auto/abc-123");
  });
});
