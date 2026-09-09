import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingleMock: vi.fn(), createClientMock: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientMock }));
vi.mock("@/lib/public-marketplace", async () => {
  const vero = await vi.importActual<typeof import("@/lib/public-marketplace")>("@/lib/public-marketplace");
  return {
    ...vero,
    publicSupabase: {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingleMock }) }) }),
    },
    logMarketplaceQueryError: vi.fn(),
  };
});

import { fotoDiUnAnnuncioPubblico } from "./marketplace-foto-firmate";

/**
 * Le fotografie si servono solo se l'annuncio e' pubblico.
 *
 * **Quale difetto impedisce.** Dal 09/09/2026 il proxy firma un percorso
 * invece di ricevere un indirizzo gia' firmato (#292): serviva a dare a
 * Google un indirizzo immutabile. Ma firmava **qualunque cosa** stesse nel
 * secchio, senza guardare di chi fosse.
 *
 * La motivazione scritta allora -- "quel secchio contiene soltanto fotografie
 * di annunci gia' pubblici" -- e' stata verificata sulla produzione il
 * 09/09/2026 e **non era vera**. Dentro c'erano nove file di tre veicoli: uno
 * pubblicato, uno in bozza e uno cancellato. Chiesti al sito pubblico senza
 * credenziali:
 *
 *     veicolo in BOZZA      -> HTTP 200 image/jpeg
 *     veicolo CANCELLATO    -> HTTP 200 image/jpeg
 *
 * E' la stessa forma del difetto trovato il 06/09: una frase nel codice, vera
 * quando e' stata scritta, che smette di esserlo senza che nessuno la rilegga.
 * Qui non c'e' piu' una frase da credere: c'e' un controllo.
 */

const PERCORSO = "299d3fd8-97ac-4838-8958-2e9017052b33/15f08577-04cf-4685-a1d4-709ff8a1d3cb/1788-0-foto.jpg";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-di-prova";
});

describe("una fotografia si serve solo se l'auto e' in vetrina", () => {
  it("auto pubblicata di una concessionaria attiva: si serve", async () => {
    mocks.maybeSingleMock.mockResolvedValue({
      data: { published: true, status: "published", dealers: { status: "approved" } },
      error: null,
    });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).toBe("pubblica");
  });

  it("auto in bozza: si rifiuta", async () => {
    // Il caso trovato in produzione.
    mocks.maybeSingleMock.mockResolvedValue({
      data: { published: false, status: "draft", dealers: { status: "approved" } },
      error: null,
    });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).toBe("non-pubblica");
  });

  it("auto cancellata: si rifiuta", async () => {
    // L'altro caso trovato in produzione: il veicolo non c'e' piu', ma il
    // file e' rimasto nell'archivio.
    mocks.maybeSingleMock.mockResolvedValue({ data: null, error: null });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).toBe("non-pubblica");
  });

  it("auto pubblicata ma concessionaria sospesa: si rifiuta", async () => {
    // Stessa regola della vetrina: sospendere una concessionaria deve
    // togliere anche le sue fotografie, non solo le sue pagine.
    mocks.maybeSingleMock.mockResolvedValue({
      data: { published: true, status: "published", dealers: { status: "suspended" } },
      error: null,
    });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).toBe("non-pubblica");
  });
});

describe("i percorsi che non dicono a chi appartengono", () => {
  it("un percorso senza l'identificativo del veicolo si rifiuta", async () => {
    for (const storto of ["soltanto-un-nome.jpg", "cartella/foto.jpg", "utente/non-un-uuid/foto.jpg"]) {
      expect(await fotoDiUnAnnuncioPubblico(storto), `${storto} e' passato`).toBe("non-pubblica");
    }
    // Non deve nemmeno aver provato a interrogare il database.
    expect(mocks.maybeSingleMock).not.toHaveBeenCalled();
  });
});

describe("se il database non risponde", () => {
  /**
   * Si lascia passare, ed e' una scelta dichiarata. Rifiutare a ogni
   * singhiozzo del database farebbe sparire **tutte** le fotografie del sito
   * e farebbe registrare errori ai motori di ricerca: un danno certo e
   * visibile, in cambio di una protezione che comunque richiede di conoscere
   * gia' un percorso fatto di codici casuali.
   */
  it("non si blocca il sito: si risponde 'non-lo-so'", async () => {
    mocks.maybeSingleMock.mockResolvedValue({ data: null, error: { message: "database irraggiungibile" } });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).toBe("non-lo-so");
  });

  it("e 'non-lo-so' non e' un si'", async () => {
    // Chi chiama deve distinguere i due casi: con "non-lo-so" la risposta si
    // conserva pochi minuti invece di un mese.
    mocks.maybeSingleMock.mockResolvedValue({ data: null, error: { message: "guasto" } });

    expect(await fotoDiUnAnnuncioPubblico(PERCORSO)).not.toBe("pubblica");
  });
});

describe("il proxy usa il controllo, e l'indirizzo non cambia", () => {
  const codice = readFileSync(resolve(process.cwd(), "src/app/api/image-proxy/route.ts"), "utf8");

  it("controlla prima di firmare, non dopo", () => {
    // Firmare e poi controllare vorrebbe dire aver gia' costruito il
    // lasciapassare per una foto che non si deve servire.
    const posizioneControllo = codice.indexOf("fotoDiUnAnnuncioPubblico(rawFoto)");
    const posizioneFirma = codice.indexOf("firmaFotoVeicolo(rawFoto)");

    expect(posizioneControllo).toBeGreaterThan(0);
    expect(posizioneControllo, "si firma prima di controllare").toBeLessThan(posizioneFirma);
  });

  it("un rifiuto non dice se quel percorso esista", () => {
    // 404 e non 403: rispondere "vietato" confermerebbe che la foto c'e'.
    // `controlloIncerto =` compare anche nella dichiarazione piu' in alto:
    // si ritaglia sull'assegnazione vera, altrimenti il pezzo esce vuoto e
    // la prova passerebbe senza guardare niente.
    const blocco = codice.slice(
      codice.indexOf('controllo === "non-pubblica"'),
      codice.indexOf("controlloIncerto = controllo")
    );

    expect(blocco.length, "il pezzo da controllare e' uscito vuoto").toBeGreaterThan(50);
    expect(blocco).toContain("status: 404");
    expect(blocco).not.toContain("status: 403");
  });

  it("una decisione presa alla cieca non resta appesa per un mese", () => {
    expect(codice).toContain("controlloIncerto || esito.startsWith(\"intera:\")");
    expect(codice).toContain("max-age=300, s-maxage=300");
  });

  it("l'indirizzo pubblico delle fotografie non cambia", () => {
    // E' il vincolo posto dal titolare: la correzione non deve peggiorare
    // l'indicizzazione. Google continua a vedere lo stesso indirizzo
    // immutabile di prima -- cambia solo cosa succede dentro.
    expect(codice).toContain('request.nextUrl.searchParams.get("foto")');
    expect(codice).toContain('request.nextUrl.searchParams.get("url")');

    const anteprime = readFileSync(resolve(process.cwd(), "src/lib/marketplace-foto-firmate.ts"), "utf8");
    expect(anteprime, "l'indirizzo pubblico e' cambiato forma").toContain("/api/image-proxy?");
  });
});
