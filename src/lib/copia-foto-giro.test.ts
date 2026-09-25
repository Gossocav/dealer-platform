import { describe, expect, it } from "vitest";
import type { FotoInCoda, RisultatoTentativo, Scrittura } from "@/lib/copia-foto";
import { eseguiGiro, type OperazioniDelGiro } from "@/lib/copia-foto-giro";

/**
 * Un giro di copia provato con operazioni finte. Ogni caso nomina il difetto
 * che impedisce: sono quelli che la rilettura del 25/09/2026 ha trovato nel
 * piano scritto, prima che diventasse codice.
 */

const ADESSO = new Date("2026-09-26T12:00:00Z");

const foto = (id: string, server = "cdn.dealerk.it", extra: Partial<FotoInCoda> = {}): FotoInCoda => ({
  id,
  vehicle_id: `auto-${id}`,
  dealer_id: "d",
  image_url: `https://${server}/dealer/datafiles/vehicle/images/1600x0/1/${id}.jpg`,
  origine_url: `https://${server}/dealer/datafiles/vehicle/images/1600x0/1/${id}.jpg`,
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

type Risposta = RisultatoTentativo | { tipo: "archivio"; motivo: string };

function operazioniFinte(risposte: Record<string, Risposta>, opzioni: { sentinelle?: Array<{ ok: boolean; dallaMemoria: boolean }>; scadeDopo?: number; superate?: string[] } = {}) {
  const provate: string[] = [];
  const scritte: Record<string, Scrittura> = {};
  const copiate: string[] = [];
  let chiamate = 0;
  const operazioni: OperazioniDelGiro = {
    copia: async (f) => {
      provate.push(f.id);
      return risposte[f.id] ?? { tipo: "copiata", sha256: "a".repeat(64), byte: 1000, percorso: `d/${f.vehicle_id}/x.jpg` };
    },
    segnaCopiata: async (f) => {
      if (opzioni.superate?.includes(f.id)) return false;
      copiate.push(f.id);
      return true;
    },
    scrivi: async (f, valori) => {
      scritte[f.id] = valori;
    },
    sentinelle: async () => opzioni.sentinelle ?? [],
    morteRecenti: async () => 0,
    scaduto: () => {
      chiamate += 1;
      return opzioni.scadeDopo !== undefined && chiamate > opzioni.scadeDopo;
    },
    pausa: async () => {},
  };
  return { operazioni, provate, scritte, copiate };
}

const sane = Array.from({ length: 10 }, () => ({ ok: true, dallaMemoria: false }));

describe("un giro di copia", () => {
  it("copia nell'ordine concordato e conta le copiate", async () => {
    const f = operazioniFinte({});
    const esito = await eseguiGiro(
      [foto("altra"), foto("copertina", "cdn.dealerk.it", { inVetrina: true, is_cover: true })],
      f.operazioni,
      { adesso: ADESSO, iniziatoIl: null },
    );
    expect(f.provate[0]).toBe("copertina");
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ copiate: 2, tentativi: 2, giroValido: true });
  });

  it("una copia superata dalla sincronizzazione non conta come copiata", async () => {
    const f = operazioniFinte({}, { superate: ["a"] });
    const esito = await eseguiGiro([foto("a")], f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ copiate: 0, superate: 1 });
  });

  // Un 429 e' una richiesta esplicita di smettere: non si insiste fino al
  // decimo fallimento, e non si consuma nessun tentativo.
  it("il primo 429 ferma quel server, gli altri continuano, e nessun tentativo si consuma", async () => {
    const coda = [foto("a1"), foto("a2"), foto("a3"), foto("b1", "altro.server.it")];
    const f = operazioniFinte({ a1: { tipo: "fermati", stato: 429 } });
    const esito = await eseguiGiro(coda, f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"].fermata).toBe("il-server-chiede-di-fermarsi");
    expect(f.copiate).toContain("b1");
    expect(f.scritte.a1).toEqual({ copia_ultimo_tentativo: ADESSO.toISOString() });
    // Con due richieste alla volta al massimo una seconda foto era gia' partita.
    expect(f.provate.filter((id) => id.startsWith("a")).length).toBeLessThanOrEqual(2);
  });

  // Una settimana di guasto non deve far uscire dalla coda le copertine: un
  // giro frenato scrive solo la data, cosi' le foto ruotano.
  it("un giro frenato non consuma tentativi: le foto prendono solo la data", async () => {
    const coda = Array.from({ length: 30 }, (_, i) => foto(`f${i}`));
    const risposte = Object.fromEntries(coda.map((x) => [x.id, { tipo: "non-raggiunta", motivo: "503" } as Risposta]));
    const f = operazioniFinte(risposte);
    const esito = await eseguiGiro(coda, f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ fermata: "freno", giroValido: false });
    for (const valori of Object.values(f.scritte)) {
      expect(valori).toEqual({ copia_ultimo_tentativo: ADESSO.toISOString() });
    }
    expect(f.provate.length).toBeLessThan(30);
  });

  it("sotto il freno i fallimenti consumano un tentativo", async () => {
    const coda = [foto("x"), ...Array.from({ length: 5 }, (_, i) => foto(`ok${i}`))];
    const f = operazioniFinte({ x: { tipo: "non-raggiunta", motivo: "403" } });
    await eseguiGiro(coda, f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(f.scritte.x).toMatchObject({ copia_esito: "non-riuscita", copia_tentativi: 1 });
  });

  it("se le sentinelle dicono che il server non risponde, il giro non vale", async () => {
    const f = operazioniFinte(
      { a: { tipo: "non-esiste", stato: 404 }, b: { tipo: "non-raggiunta", motivo: "503" } },
      { sentinelle: Array.from({ length: 10 }, (_, i) => ({ ok: i < 5, dallaMemoria: false })) },
    );
    const esito = await eseguiGiro([foto("a"), foto("b")], f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ sentinelle: "non-risponde", giroValido: false });
    expect(f.scritte.a).toEqual({ copia_ultimo_tentativo: ADESSO.toISOString() });
    expect(f.scritte.b).toEqual({ copia_ultimo_tentativo: ADESSO.toISOString() });
  });

  // A fine coda trenta foto morte davvero non devono far frenare ogni giro:
  // su un server sano i "non esiste" non contano nel freno.
  it("su un server sano i 'non esiste' non fanno frenare, e si segna il primo", async () => {
    const coda = Array.from({ length: 25 }, (_, i) => foto(`m${i}`));
    const risposte = Object.fromEntries(coda.map((x) => [x.id, { tipo: "non-esiste", stato: 404 } as Risposta]));
    const f = operazioniFinte(risposte, { sentinelle: sane });
    const esito = await eseguiGiro(coda, f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ sentinelle: "sano", fermata: null, giroValido: true });
    expect(Object.values(f.scritte).every((v) => v.copia_primo_non_esiste === ADESSO.toISOString())).toBe(true);
  });

  it("una foto gia' provata in questo lavoro non si riprova nella chiamata dopo", async () => {
    const iniziatoIl = new Date("2026-09-26T11:00:00Z");
    const f = operazioniFinte({});
    await eseguiGiro(
      [foto("gia", "cdn.dealerk.it", { copia_esito: "non-riuscita", copia_tentativi: 1, copia_ultimo_tentativo: "2026-09-26T11:30:00Z" }), foto("nuova")],
      f.operazioni,
      { adesso: ADESSO, iniziatoIl },
    );
    expect(f.provate).toEqual(["nuova"]);
  });

  it("quando il tempo finisce ci si ferma, e l'esito lo dice", async () => {
    const f = operazioniFinte({}, { scadeDopo: 3 });
    const esito = await eseguiGiro(
      Array.from({ length: 10 }, (_, i) => foto(`t${i}`)),
      f.operazioni,
      { adesso: ADESSO, iniziatoIl: null },
    );
    expect(esito.finitoIlTempo).toBe(true);
    expect(esito.provate).toBeLessThan(10);
  });

  // Un guasto del nostro archivio non e' colpa dell'origine: la foto non
  // consuma tentativi, e non conta nel freno.
  it("un guasto del nostro archivio non consuma tentativi", async () => {
    const f = operazioniFinte({ a: { tipo: "archivio", motivo: "upload rifiutato" } });
    const esito = await eseguiGiro([foto("a")], f.operazioni, { adesso: ADESSO, iniziatoIl: null });
    expect(esito.server["cdn.dealerk.it"]).toMatchObject({ archivio: 1, tentativi: 0 });
    expect(f.scritte.a).toEqual({ copia_ultimo_tentativo: ADESSO.toISOString() });
  });
});
