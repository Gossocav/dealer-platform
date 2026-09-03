import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { costruisciEmailPromemoria, type VoceEmail } from "@/lib/email-promemoria";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const OGGI = new Date(2026, 8, 3); // 3 settembre 2026
const SITO = "https://www.keyauto.it";

const voce = (p: Partial<VoceEmail>): VoceEmail => ({
  titolo: "Revisione",
  tipo: "Revisione",
  scade_il: "2026-09-03",
  ...p,
});

/**
 * L'email del mattino, chiesta dal titolare il 03/09/2026: **una sola al
 * giorno** con le scadenze e le cose da fare, non una per promemoria.
 */
describe("l'email del mattino", () => {
  /**
   * Il difetto che questo test impedisce: mandare ogni giorno una email che
   * dice "oggi nulla". E' la strada piu' rapida perche' venga ignorata anche
   * il giorno in cui invece qualcosa c'e'.
   */
  it("se non c'e' niente da ricordare, non si manda niente", () => {
    expect(
      costruisciEmailPromemoria({
        nomeConcessionaria: "Autogepy",
        scaduti: [],
        oggi: [],
        inArrivo: 4,
        indirizzoPiattaforma: SITO,
        adesso: OGGI,
      })
    ).toBeNull();
  });

  // L'oggetto si legge dalla notifica del telefono, senza aprire: deve dire il
  // numero e la cosa piu' urgente.
  it("l'oggetto dice quanti sono in ritardo e quanti per oggi", () => {
    const email = costruisciEmailPromemoria({
      nomeConcessionaria: "Autogepy",
      scaduti: [voce({ scade_il: "2026-08-20" }), voce({ scade_il: "2026-09-01" })],
      oggi: [voce({})],
      inArrivo: 0,
      indirizzoPiattaforma: SITO,
      adesso: OGGI,
    });

    expect(email?.oggetto).toBe("KeyAuto: 2 in ritardo e 1 per oggi");
  });

  it("senza ritardi l'oggetto parla solo di oggi", () => {
    const email = costruisciEmailPromemoria({
      nomeConcessionaria: "Autogepy",
      scaduti: [],
      oggi: [voce({})],
      inArrivo: 0,
      indirizzoPiattaforma: SITO,
      adesso: OGGI,
    });

    expect(email?.oggetto).toBe("KeyAuto: 1 cosa da fare oggi");
  });

  it("dentro ci sono le due sezioni, con quanto manca scritto per esteso", () => {
    const email = costruisciEmailPromemoria({
      nomeConcessionaria: "Autogepy",
      scaduti: [voce({ titolo: "Assicurazione", scade_il: "2026-08-31", riferimento: "AB123CD Fiat Panda" })],
      oggi: [voce({ titolo: "Richiamare Rossi", tipo: "Richiamare la lead" })],
      inArrivo: 3,
      indirizzoPiattaforma: SITO,
      adesso: OGGI,
    });

    expect(email?.html).toContain("In ritardo");
    expect(email?.html).toContain("Assicurazione");
    expect(email?.html).toContain("AB123CD Fiat Panda");
    expect(email?.html).toContain("3 giorni fa");
    expect(email?.html).toContain("Richiamare Rossi");
    // I prossimi sette giorni sono una riga, non un elenco: altrimenti l'email
    // diventa lunga e non si distingue piu' cosa brucia adesso.
    expect(email?.html).toContain("Nei prossimi sette giorni ce ne sono altri 3");
    expect(email?.html).toContain(`${SITO}/promemoria`);
  });

  it("senza niente in arrivo quella riga non compare", () => {
    const email = costruisciEmailPromemoria({
      nomeConcessionaria: "",
      scaduti: [],
      oggi: [voce({})],
      inArrivo: 0,
      indirizzoPiattaforma: SITO,
      adesso: OGGI,
    });

    expect(email?.html).not.toContain("Nei prossimi sette giorni");
  });

  /**
   * I titoli e le note li scrive il concessionario: un apostrofo o una
   * parentesi angolare non devono sfondare l'impaginazione dell'email.
   */
  it("quello che ha scritto il concessionario viene ripulito", () => {
    const email = costruisciEmailPromemoria({
      nomeConcessionaria: "Auto & Co",
      scaduti: [],
      oggi: [voce({ titolo: "<b>Richiamare</b>", note: "prima delle 10 & poi" })],
      inArrivo: 0,
      indirizzoPiattaforma: SITO,
      adesso: OGGI,
    });

    expect(email?.html).toContain("&lt;b&gt;Richiamare&lt;/b&gt;");
    expect(email?.html).toContain("Auto &amp; Co");
    expect(email?.html).not.toContain("<b>Richiamare</b>");
  });
});

/**
 * **Questi leggono il testo del sorgente**: il lavoro del mattino non si puo'
 * provare senza un database e senza mandare email vere, e le decisioni che
 * contano vanno comunque fissate.
 */
describe("il lavoro che manda l'email", () => {
  const lavoro = leggi("src/app/api/cron/promemoria/route.ts");
  const workflow = leggi(".github/workflows/promemoria-mattina.yml");

  it("si apre solo col segreto, come la sincronizzazione notturna", () => {
    expect(lavoro).toContain("process.env.CRON_SECRET");
    expect(lavoro).toContain('{ error: "Non autorizzato." }, { status: 401 }');
  });

  // Un promemoria in ritardo torna ogni mattina finche' non lo si segna
  // fatto; ma due giri nello stesso giorno non devono mandare due email.
  it("non manda due volte lo stesso giorno", () => {
    expect(lavoro).toContain("avvisato_il.is.null,avvisato_il.lt.");
    expect(lavoro).toContain('.update({ avvisato_il: oggi })');
  });

  /**
   * Il difetto che questo test impedisce: segnare come avvisato un promemoria
   * la cui email non e' partita. Domani non tornerebbe piu', e quella scadenza
   * sarebbe persa per sempre.
   */
  it("segna come avvisati solo quelli la cui email e' partita davvero", () => {
    const dopoInvio = lavoro.slice(lavoro.indexOf("const esito = await sendPlatformEmail"));
    expect(dopoInvio).toContain("if (!esito.ok)");
    expect(dopoInvio.slice(0, dopoInvio.indexOf("avvisati.push"))).toContain("continue;");
  });

  // Senza indirizzo non si manda e non si timbra: il giorno che l'indirizzo
  // ci sara', quei promemoria devono ancora partire.
  it("una concessionaria senza email non perde i suoi promemoria", () => {
    expect(lavoro).toContain("senzaEmail += 1");
    expect(lavoro).toContain("continue;");
  });

  /**
   * Il servizio scavalca le politiche del database: il piano va controllato a
   * mano, altrimenti il bollo -- che sta nel conto economico, funzione del
   * Piano Pro -- finirebbe nell'email anche di chi ha il Base.
   */
  it("il bollo entra nell'email solo per chi ha il conto economico", () => {
    expect(lavoro).toContain('admin.rpc("dealer_plan_in_force"');
    expect(lavoro).toContain('codice === "pro" || codice === "elite"');
  });

  it("il lavoro gira la mattina presto, prima che il concessionario apra", () => {
    expect(workflow).toContain('cron: "0 5 * * *"');
    expect(workflow).toContain("/api/cron/promemoria");
  });

  // Un lavoro verde che non ha fatto niente e' peggio di uno rosso, perche' lo
  // si crede fatto.
  it("senza il segreto il lavoro fallisce invece di fingere", () => {
    expect(workflow).toContain("Manca il segreto CRON_SECRET");
    expect(workflow).toContain("exit 1");
  });
});

/**
 * Il richiamo di una lead: sta sulla sua scheda per lo stesso motivo per cui
 * le scadenze stanno sulla scheda della vettura -- qui si sa gia' chi si deve
 * richiamare.
 */
describe("il richiamo sulla scheda della lead", () => {
  const riquadro = leggi("src/components/promemoria/richiamo-lead.tsx");
  const scheda = leggi("src/app/lead/[id]/page.tsx");

  it("sta sulla scheda della lead, in cima", () => {
    expect(scheda).toContain("<RichiamoLead leadId={lead.id} dealerId={dealerId} />");
    expect(scheda.indexOf("<RichiamoLead")).toBeLessThan(scheda.indexOf('<Card title="Dati Cliente">'));
  });

  it("crea un promemoria come tutti gli altri, gia' agganciato alla lead", () => {
    expect(riquadro).toContain('tipo: "richiamo_lead"');
    expect(riquadro).toContain("lead_id: leadId");
  });

  it("si puo' segnare fatto senza cancellarlo", () => {
    expect(riquadro).toContain('stato: "fatto"');
    expect(riquadro).toContain("fatto_il: new Date().toISOString()");
  });

  it("dichiara la concessionaria in ogni interrogazione", () => {
    const chiamate = riquadro.split("supabase").slice(1);
    const conDealer = chiamate.filter((c) => c.slice(0, 400).includes("dealer_id"));
    expect(conDealer.length).toBeGreaterThanOrEqual(3);
  });
});
