import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookupMock,
}));

import {
  assertHostPubblico,
  fetchWithSsrfProtection,
  indirizzoVietatoIPv4,
  indirizzoVietatoIPv6,
  IndirizzoNonAmmesso,
  parseAndValidateExternalHttpUrl,
} from "./ssrf-protection";

/**
 * La protezione contro le richieste dirette verso l'interno.
 *
 * **Quale difetto impediscono.** Fino al 05/09/2026 il progetto aveva due
 * protezioni diverse per lo stesso pericolo. Quella che copriva le
 * importazioni guardava soltanto **com'era scritto** l'indirizzo, non dove
 * portava. Misurato riproducendo quella funzione e passandole cio' che
 * riceveva davvero (`URL.hostname`), le passavano:
 *
 *   - `http://[::1]/` e ogni altro IPv6, perche' `URL.hostname` li
 *     restituisce fra parentesi quadre e `isIP("[::1]")` risponde "non e' un
 *     indirizzo": il ramo IPv6 era codice morto che sembrava una protezione;
 *   - `http://100.64.0.1/` e `http://192.0.0.1/`, intervalli interni che
 *     nell'elenco non c'erano;
 *   - `http://interno.esempio.it/`, cioe' un nome regolarissimo che *punta*
 *     a un indirizzo interno. Questo e' il buco vero, ed e' quello che nessun
 *     controllo sulla forma potra' mai vedere.
 *
 * Fermava invece `http://2130706433/`, che verrebbe da elencare fra gli
 * aggiramenti: `new URL()` normalizza da se' le forme decimale, ottale ed
 * esadecimale, quindi quella funzione riceveva gia' `127.0.0.1`. Annotato
 * perche' e' la conclusione che verrebbe data per buona senza misurarla.
 *
 * Il terzo punto che esce verso l'esterno -- la lettura dei siti delle
 * concessionarie -- non aveva nessuna protezione e seguiva i rimbalzi da
 * solo.
 */

function risolveSu(...indirizzi: Array<{ address: string; family: number }>) {
  mocks.lookupMock.mockResolvedValue(indirizzi);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Salvo diversa indicazione, i nomi risolvono su un indirizzo pubblico.
  risolveSu({ address: "93.184.216.34", family: 4 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gli intervalli che non si raggiungono", () => {
  it("ferma la rete locale, il ritorno su se stessi e i servizi di configurazione cloud", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      // Il servizio di configurazione delle piattaforme cloud: da li' si
      // leggono le credenziali della macchina.
      "169.254.169.254",
      // Rete condivisa degli operatori: e' interna anche se non sembra.
      "100.64.0.1",
      "0.0.0.0",
      "240.0.0.1",
      "224.0.0.1",
    ]) {
      expect(indirizzoVietatoIPv4(ip), `${ip} doveva essere vietato`).toBe(true);
    }
  });

  it("lascia passare gli indirizzi pubblici", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.255.255"]) {
      expect(indirizzoVietatoIPv4(ip), `${ip} doveva essere ammesso`).toBe(false);
    }
  });

  it("davanti a un indirizzo illeggibile si chiude, non si apre", () => {
    // Un controllo che in caso di dubbio lascia passare non e' un controllo.
    expect(indirizzoVietatoIPv4("999.1.1.1")).toBe(true);
    expect(indirizzoVietatoIPv4("non-un-indirizzo")).toBe(true);
    expect(indirizzoVietatoIPv6("::gggg")).toBe(true);
  });

  it("ferma anche gli IPv6 interni, compreso l'IPv4 travestito", () => {
    expect(indirizzoVietatoIPv6("::1")).toBe(true);
    expect(indirizzoVietatoIPv6("fe80::1")).toBe(true);
    expect(indirizzoVietatoIPv6("fd00::1")).toBe(true);
    // ::ffff:127.0.0.1 e' 127.0.0.1 scritto come IPv6.
    expect(indirizzoVietatoIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(indirizzoVietatoIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(indirizzoVietatoIPv6("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });
});

describe("dove porta davvero questo nome", () => {
  it("ferma un nome pubblico che risolve su un indirizzo interno", async () => {
    // E' l'aggiramento che la vecchia protezione non vedeva: il nome e'
    // regolare, e' la risposta del server dei nomi a portare dentro.
    risolveSu({ address: "10.0.0.5", family: 4 });

    await expect(assertHostPubblico("interno.esempio.it")).rejects.toMatchObject({
      motivo: "host-non-consentito",
    });
  });

  it("basta un solo indirizzo vietato fra quelli restituiti", async () => {
    // Un nome puo' rispondere con piu' indirizzi e farne uscire uno diverso a
    // ogni richiesta: accettarne uno solo pubblico sarebbe una lotteria.
    risolveSu({ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 });

    await expect(assertHostPubblico("misto.esempio.it")).rejects.toMatchObject({
      motivo: "host-non-consentito",
    });
  });

  it("un nome che non risolve e' una richiesta sbagliata, non un divieto", async () => {
    mocks.lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(assertHostPubblico("non-esiste.esempio.it")).rejects.toMatchObject({
      motivo: "host-non-risolvibile",
    });
  });

  it("lascia passare un nome che risolve su un indirizzo pubblico", async () => {
    await expect(assertHostPubblico("www.keyauto.it")).resolves.toBeUndefined();
  });

  it("toglie le parentesi quadre agli IPv6 prima di guardarli", async () => {
    // URL.hostname restituisce "[::1]": senza togliere le parentesi il
    // controllo non riconoscerebbe l'indirizzo e lo manderebbe a risolvere.
    await expect(assertHostPubblico("[::1]")).rejects.toMatchObject({ motivo: "host-non-consentito" });
    expect(mocks.lookupMock).not.toHaveBeenCalled();
  });
});

describe("la forma dell'indirizzo", () => {
  it("ammette solo http e https", () => {
    expect(() => parseAndValidateExternalHttpUrl("file:///etc/passwd")).toThrow(IndirizzoNonAmmesso);
    expect(() => parseAndValidateExternalHttpUrl("gopher://esempio.it/")).toThrow(IndirizzoNonAmmesso);
    expect(parseAndValidateExternalHttpUrl("https://esempio.it/x").protocol).toBe("https:");
  });

  it("rifiuta le credenziali scritte dentro l'indirizzo", () => {
    // "https://sito-vero.it@interno/" fa credere a chi legge di andare su
    // sito-vero.it mentre va su "interno".
    expect(() => parseAndValidateExternalHttpUrl("https://utente:segreto@esempio.it/")).toThrow(IndirizzoNonAmmesso);
  });

  it("resta sincrona: quattro punti del codice la chiamano cosi'", () => {
    // Se diventasse asincrona, quelle chiamate riceverebbero una promessa e
    // la userebbero come indirizzo, senza che nessuno se ne accorga.
    const esito = parseAndValidateExternalHttpUrl("https://esempio.it/feed.xml");
    expect(esito).toBeInstanceOf(URL);
  });
});

describe("la richiesta vera", () => {
  it("ferma un IPv6 interno scritto per esteso", async () => {
    // E' l'aggiramento piu' banale e quello che passava: la vecchia
    // protezione riceveva "[::1]" con le parentesi quadre e non lo
    // riconosceva come indirizzo, quindi lo lasciava passare.
    const fetchSpia = vi.fn();
    vi.stubGlobal("fetch", fetchSpia);

    await expect(fetchWithSsrfProtection("http://[::1]/")).rejects.toMatchObject({
      motivo: "host-non-consentito",
    });
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("ferma gli intervalli interni che l'elenco precedente non aveva", async () => {
    const fetchSpia = vi.fn();
    vi.stubGlobal("fetch", fetchSpia);

    for (const indirizzo of ["http://100.64.0.1/", "http://192.0.0.1/", "http://[fd00::1]/"]) {
      risolveSu({ address: new URL(indirizzo).hostname.replace(/^\[|\]$/g, ""), family: indirizzo.includes("[") ? 6 : 4 });
      await expect(fetchWithSsrfProtection(indirizzo), indirizzo).rejects.toMatchObject({
        motivo: "host-non-consentito",
      });
    }

    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("le scritture numeriche le normalizza gia' l'analizzatore di indirizzi", async () => {
    // Non e' merito nostro ed e' bene saperlo: new URL("http://2130706433/")
    // vale gia' 127.0.0.1. Se un giorno qualcuno togliesse il controllo sui
    // nomi vietati pensando che a questi ci pensi lui, questo test lo ferma.
    expect(new URL("http://2130706433/").hostname).toBe("127.0.0.1");
    expect(new URL("http://0x7f.0.0.1/").hostname).toBe("127.0.0.1");

    const fetchSpia = vi.fn();
    vi.stubGlobal("fetch", fetchSpia);

    await expect(fetchWithSsrfProtection("http://2130706433/")).rejects.toMatchObject({
      motivo: "host-non-consentito",
    });
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("ricontrolla a ogni rimbalzo, non solo all'inizio", async () => {
    // Un sito pubblico che risponde "vai qui" indicando un indirizzo interno
    // e' il modo piu' semplice di aggirare un controllo fatto una volta sola.
    mocks.lookupMock.mockImplementation(async (host: string) => {
      if (host === "interno.esempio.it") return [{ address: "169.254.169.254", family: 4 }];
      return [{ address: "93.184.216.34", family: 4 }];
    });

    const fetchSpia = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://interno.esempio.it/segreti" } })
    );
    vi.stubGlobal("fetch", fetchSpia);

    await expect(fetchWithSsrfProtection("https://pubblico.esempio.it/")).rejects.toMatchObject({
      motivo: "host-non-consentito",
    });

    // Il primo salto e' partito (era lecito), il secondo no.
    expect(fetchSpia).toHaveBeenCalledOnce();
  });

  it("non segue i rimbalzi all'infinito", async () => {
    const fetchSpia = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://esempio.it/ancora" } })
    );
    vi.stubGlobal("fetch", fetchSpia);

    await expect(fetchWithSsrfProtection("https://esempio.it/", { maxRedirects: 2 })).rejects.toMatchObject({
      motivo: "troppi-rimbalzi",
    });
    expect(fetchSpia).toHaveBeenCalledTimes(3);
  });

  it("consegna la risposta quando l'indirizzo e' lecito", async () => {
    const fetchSpia = vi.fn().mockResolvedValue(new Response("contenuto", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpia);

    const risposta = await fetchWithSsrfProtection("https://esempio.it/feed.xml");

    expect(risposta.status).toBe(200);
    await expect(risposta.text()).resolves.toBe("contenuto");
    // "manual" e' cio' che rende possibile ricontrollare ogni rimbalzo: se
    // tornasse "follow", i salti li farebbe la libreria senza chiedere.
    expect(fetchSpia.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });
});
