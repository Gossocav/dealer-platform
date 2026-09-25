import { describe, expect, it } from "vitest";
import {
  eNuovaPerIlFreno,
  frenoScattato,
  leggiRisposta,
  ordinaCoda,
  promemoriaAppuntamento,
  scritturaDopoIlFallimento,
  serverDellaFoto,
  verdettoSentinelle,
  type FotoInCoda,
} from "@/lib/copia-foto";
import { SOGLIE_COPIA_FOTO } from "@/lib/copia-foto-soglie";

/**
 * Le regole della copia delle foto, una per una. I numeri delle regole sono
 * quelli di `supabase/MIGRAZIONI.md`, "Le foto stanno su un server non
 * nostro": ogni caso qui dice quale difetto impedisce, e il difetto e' quasi
 * sempre uno che la rilettura del 25/09/2026 ha trovato nel piano scritto.
 */

const foto = (id: string, extra: Partial<FotoInCoda> = {}): FotoInCoda => ({
  id,
  vehicle_id: `auto-${id}`,
  dealer_id: "d",
  image_url: `https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/1/${id}.jpg`,
  origine_url: `https://cdn.dealerk.it/dealer/datafiles/vehicle/images/1600x0/1/${id}.jpg`,
  position: 0,
  is_cover: false,
  copia_esito: null,
  copia_tentativi: 0,
  copia_primo_tentativo: null,
  copia_ultimo_tentativo: null,
  copia_primo_non_esiste: null,
  inVetrina: false,
  uscitaDalSito: false,
  ...extra,
});

describe("regola 1: l'ordine della coda", () => {
  it("prima le copertine della vetrina, poi il resto della vetrina, poi le altre", () => {
    const coda = ordinaCoda([
      foto("altra"),
      foto("vetrina", { inVetrina: true, position: 1 }),
      foto("copertina", { inVetrina: true, is_cover: true }),
    ]);
    expect(coda.map((f) => f.id)).toEqual(["copertina", "vetrina", "altra"]);
  });

  // Il difetto di Autogepy dell'11/09/2026, rientrato da un'altra porta:
  // poche foto difettose in testa alla coda, riprovate per prime a ogni giro,
  // fanno scattare il freno e il resto non viene mai copiato.
  it("le gia' provate vanno dopo le mai provate, anche se sono copertine in vetrina", () => {
    const coda = ordinaCoda([
      foto("fallita", { inVetrina: true, is_cover: true, copia_esito: "non-riuscita", copia_tentativi: 3, copia_ultimo_tentativo: "2026-09-25T10:00:00Z" }),
      foto("rinviata", { inVetrina: true, is_cover: true, copia_ultimo_tentativo: "2026-09-25T09:00:00Z" }),
      foto("nuova"),
    ]);
    expect(coda.map((f) => f.id)).toEqual(["nuova", "rinviata", "fallita"]);
  });

  it("fra le gia' provate, prima la meno recente", () => {
    const coda = ordinaCoda([
      foto("recente", { copia_esito: "non-riuscita", copia_tentativi: 1, copia_ultimo_tentativo: "2026-09-25T12:00:00Z" }),
      foto("vecchia", { copia_esito: "non-riuscita", copia_tentativi: 1, copia_ultimo_tentativo: "2026-09-24T12:00:00Z" }),
    ]);
    expect(coda.map((f) => f.id)).toEqual(["vecchia", "recente"]);
  });

  // Le foto delle auto uscite dal sito: DealerK le cancella, e i loro 404
  // veri consumerebbero il tetto delle morte per auto che nessuno vede.
  it("le foto delle auto uscite dal sito escono dalla coda", () => {
    expect(ordinaCoda([foto("uscita", { uscitaDalSito: true }), foto("resta")]).map((f) => f.id)).toEqual(["resta"]);
  });

  // Il caso vero del 25/09/2026: un'auto segnata uscita dal sito ma ancora in
  // vetrina. Le sue foto le vede chiunque: si copiano.
  it("un'auto uscita dal sito ma ancora in vetrina resta in coda", () => {
    expect(ordinaCoda([foto("tonale", { uscitaDalSito: true, inVetrina: true })]).map((f) => f.id)).toEqual(["tonale"]);
  });
});

describe("regola 2: come si legge una risposta", () => {
  it("solo 404 e 410 vogliono dire 'non esiste'", () => {
    expect(leggiRisposta({ stato: 404, retryAfter: false, mitigata: false })).toBe("non-esiste");
    expect(leggiRisposta({ stato: 410, retryAfter: false, mitigata: false })).toBe("non-esiste");
    for (const stato of [403, 500, 502, 503, 521, 522]) {
      expect(leggiRisposta({ stato, retryAfter: false, mitigata: false })).toBe("non-raggiunta");
    }
  });

  // Un 429 e' una richiesta esplicita di smettere, non uno dei dieci
  // fallimenti da contare prima di frenare.
  it("il primo 429, o un 403 con Retry-After, vuol dire fermarsi", () => {
    expect(leggiRisposta({ stato: 429, retryAfter: false, mitigata: false })).toBe("fermati");
    expect(leggiRisposta({ stato: 403, retryAfter: true, mitigata: false })).toBe("fermati");
    expect(leggiRisposta({ stato: 403, retryAfter: false, mitigata: true })).toBe("fermati");
  });
});

describe("regola 3: le sentinelle", () => {
  const ok = (n: number, dallaMemoria = false) => Array.from({ length: n }, () => ({ ok: true, dallaMemoria }));
  const ko = (n: number) => Array.from({ length: n }, () => ({ ok: false, dallaMemoria: false }));

  it("sano se ce ne sono almeno 10 e ne rispondono almeno 9", () => {
    expect(verdettoSentinelle([...ok(9), ...ko(1)])).toBe("sano");
  });

  // Il terzo esito ha un nome: senza, il server che non risponde non cambiava
  // niente, e a fine coda una settimana di guasto esauriva le copertine.
  it("'non risponde' se ce ne sono abbastanza e ne rispondono meno di 9", () => {
    expect(verdettoSentinelle([...ok(8), ...ko(2)])).toBe("non-risponde");
  });

  it("'sconosciuto' se non ce ne sono abbastanza", () => {
    expect(verdettoSentinelle(ok(9))).toBe("sconosciuto");
  });

  // Una sentinella interrogata dalla memoria di Cloudflare dice "sano" anche
  // con l'archivio di DealerK svuotato: non conta.
  it("una risposta dalla memoria di Cloudflare non conta", () => {
    expect(verdettoSentinelle(ok(10, true))).toBe("sconosciuto");
  });
});

describe("regola 4: il freno misura le novita'", () => {
  it("scatta oltre il 5% e almeno 10 fallite, dopo almeno 20 tentativi", () => {
    expect(frenoScattato({ tentativi: 19, fallimentiNuovi: 19 })).toBe(false);
    expect(frenoScattato({ tentativi: 20, fallimentiNuovi: 9 })).toBe(false);
    expect(frenoScattato({ tentativi: 20, fallimentiNuovi: 10 })).toBe(true);
    expect(frenoScattato({ tentativi: 400, fallimentiNuovi: 20 })).toBe(false);
    expect(frenoScattato({ tentativi: 400, fallimentiNuovi: 21 })).toBe(true);
  });

  it("una foto gia' fallita prima non e' una novita'", () => {
    expect(eNuovaPerIlFreno({ copia_tentativi: 0, copia_primo_non_esiste: null })).toBe(true);
    expect(eNuovaPerIlFreno({ copia_tentativi: 2, copia_primo_non_esiste: null })).toBe(false);
    expect(eNuovaPerIlFreno({ copia_tentativi: 0, copia_primo_non_esiste: "2026-09-25T00:00:00Z" })).toBe(false);
  });
});

describe("cosa si scrive su una foto non copiata", () => {
  const adesso = new Date("2026-09-26T12:00:00Z");
  const base = { giroValido: true, sentinelle: "sano" as const, adesso, morteAbilitate: true, postiMorteRestanti: 20 };
  const nuova = { copia_tentativi: 0, copia_primo_tentativo: null, copia_primo_non_esiste: null };

  // Una settimana di guasto non deve far uscire dalla coda le copertine.
  it("in un giro non valido si scrive solo la data: nessun tentativo consumato", () => {
    const { valori } = scritturaDopoIlFallimento(nuova, { tipo: "non-raggiunta", motivo: "503" }, { ...base, giroValido: false });
    expect(valori).toEqual({ copia_ultimo_tentativo: adesso.toISOString() });
  });

  it("chi ci chiede di fermarci non consuma tentativi", () => {
    const { valori } = scritturaDopoIlFallimento(nuova, { tipo: "fermati", stato: 429 }, base);
    expect(valori).toEqual({ copia_ultimo_tentativo: adesso.toISOString() });
  });

  it("il primo 'non esiste' su server sano si segna, senza consumare tentativi", () => {
    const { valori, mortaQui } = scritturaDopoIlFallimento(nuova, { tipo: "non-esiste", stato: 404 }, base);
    expect(mortaQui).toBe(false);
    expect(valori).toMatchObject({ copia_primo_non_esiste: adesso.toISOString() });
    expect("copia_tentativi" in valori).toBe(false);
    expect("copia_esito" in valori).toBe(false);
  });

  it("il secondo 'non esiste' dopo 24 ore la fa morta", () => {
    const giaVista = { ...nuova, copia_primo_non_esiste: "2026-09-25T11:00:00Z" };
    const { valori, mortaQui } = scritturaDopoIlFallimento(giaVista, { tipo: "non-esiste", stato: 404 }, base);
    expect(mortaQui).toBe(true);
    expect(valori).toMatchObject({ copia_esito: "sorgente-morta", copia_tentativi: 1 });
  });

  it("prima delle 24 ore aspetta", () => {
    const giaVista = { ...nuova, copia_primo_non_esiste: "2026-09-26T01:00:00Z" };
    expect(scritturaDopoIlFallimento(giaVista, { tipo: "non-esiste", stato: 404 }, base).mortaQui).toBe(false);
  });

  // "Lo so, ma ho finito i posti" non e' "non lo so": la foto aspetta il
  // tetto, non avanza verso l'esaurimento.
  it("trattenuta dal tetto delle morte, aspetta senza consumare tentativi", () => {
    const giaVista = { ...nuova, copia_primo_non_esiste: "2026-09-25T11:00:00Z" };
    const { valori, mortaQui } = scritturaDopoIlFallimento(giaVista, { tipo: "non-esiste", stato: 404 }, { ...base, postiMorteRestanti: 0 });
    expect(mortaQui).toBe(false);
    expect("copia_tentativi" in valori).toBe(false);
  });

  it("con le morte spente, nessuna foto muore", () => {
    const giaVista = { ...nuova, copia_primo_non_esiste: "2026-09-25T11:00:00Z" };
    expect(scritturaDopoIlFallimento(giaVista, { tipo: "non-esiste", stato: 404 }, { ...base, morteAbilitate: false }).mortaQui).toBe(false);
  });

  // Solo un server confermato dalle sentinelle puo' dire che una foto non
  // esiste: su un server sconosciuto un 404 e' un fallimento come un altro.
  it("un 'non esiste' su server sconosciuto e' un fallimento come un altro, e non fa partire l'orologio", () => {
    const { valori } = scritturaDopoIlFallimento(nuova, { tipo: "non-esiste", stato: 404 }, { ...base, sentinelle: "sconosciuto" });
    expect(valori).toMatchObject({ copia_esito: "non-riuscita", copia_tentativi: 1, copia_primo_non_esiste: null });
  });

  // Due "non esiste" divisi da un'altra risposta non sono lo stesso
  // "non esiste" che dura.
  it("qualunque altra risposta azzera l'orologio dei 'non esiste'", () => {
    const giaVista = { ...nuova, copia_tentativi: 1, copia_primo_tentativo: "2026-09-25T00:00:00Z", copia_primo_non_esiste: "2026-09-25T11:00:00Z" };
    const { valori } = scritturaDopoIlFallimento(giaVista, { tipo: "non-raggiunta", motivo: "403" }, base);
    expect(valori).toMatchObject({ copia_primo_non_esiste: null, copia_tentativi: 2 });
  });

  it("dopo 16 tentativi e 7 giorni e' esaurita: 'non lo so', e il ciclo finisce", () => {
    const vecchia = { copia_tentativi: 15, copia_primo_tentativo: "2026-09-18T12:00:00Z", copia_primo_non_esiste: null };
    const { valori } = scritturaDopoIlFallimento(vecchia, { tipo: "non-raggiunta", motivo: "403" }, base);
    expect(valori).toMatchObject({ copia_esito: "tentativi-esauriti", copia_tentativi: 16 });
  });

  it("16 tentativi in meno di 7 giorni non bastano", () => {
    const giovane = { copia_tentativi: 15, copia_primo_tentativo: "2026-09-24T12:00:00Z", copia_primo_non_esiste: null };
    expect(scritturaDopoIlFallimento(giovane, { tipo: "non-raggiunta", motivo: "403" }, base).valori).toMatchObject({ copia_esito: "non-riuscita" });
  });

  it("ogni esito di fallimento soddisfa i vincoli del database: tentativi, primo e ultimo tentativo", () => {
    for (const r of [
      { tipo: "non-raggiunta", motivo: "timeout" },
      { tipo: "non-era-la-foto", motivo: "segnaposto" },
    ] as const) {
      const { valori } = scritturaDopoIlFallimento(nuova, r, base);
      expect(Number(valori.copia_tentativi)).toBeGreaterThan(0);
      expect(valori.copia_primo_tentativo).toBeTruthy();
      expect(new Date(String(valori.copia_ultimo_tentativo)) >= new Date(String(valori.copia_primo_tentativo))).toBe(true);
    }
  });
});

describe("il server delle foto e l'appuntamento", () => {
  it("il server e' il dominio dell'origine", () => {
    expect(serverDellaFoto("https://CDN.dealerk.it/dealer/x.jpg")).toBe("cdn.dealerk.it");
  });

  it("l'appuntamento si ricorda da quel giorno in poi, non un giorno solo", () => {
    expect(promemoriaAppuntamento(new Date("2026-10-01T00:00:00Z"), "2026-10-02")).toBeNull();
    expect(promemoriaAppuntamento(new Date("2026-10-02T08:00:00Z"), "2026-10-02")).toContain("2026-10-02");
    expect(promemoriaAppuntamento(new Date("2026-10-20T08:00:00Z"), "2026-10-02")).toContain("MIGRAZIONI.md");
    expect(promemoriaAppuntamento(new Date("2026-10-20T08:00:00Z"), null)).toBeNull();
  });

  it("le morte restano spente finche' il pubblico non le nasconde", () => {
    expect(SOGLIE_COPIA_FOTO.morteAbilitate).toBe(false);
  });
});
