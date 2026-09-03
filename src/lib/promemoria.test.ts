import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCADENZE_VEICOLO,
  TIPI_PROMEMORIA,
  etichettaTipo,
  oggiIso,
  quantiUrgenti,
  raggruppaPerUrgenza,
  titoloPromemoria,
  urgenza,
} from "@/lib/promemoria";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const migration = leggi("supabase/migrations/20260903130000_promemoria.sql");
const OGGI = new Date(2026, 8, 3); // 3 settembre 2026

/**
 * I promemoria, chiesti dal titolare il 03/09/2026: scadenze dei documenti
 * dell'auto, richiamare una lead, risentire un cliente dopo un preventivo.
 */
describe("i tipi di promemoria", () => {
  it("quelli della tendina sono esattamente quelli che il database accetta", () => {
    const vincolo = migration.slice(
      migration.indexOf("promemoria_tipo_valido"),
      migration.indexOf("))", migration.indexOf("promemoria_tipo_valido"))
    );

    const nelDatabase = [...vincolo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(nelDatabase.length).toBeGreaterThan(5);
    expect(TIPI_PROMEMORIA.map((t) => t.valore).sort()).toEqual(nelDatabase);
  });

  it("le scadenze della vettura sono quelle che si scrivono sulla sua scheda", () => {
    expect(SCADENZE_VEICOLO.map((t) => t.valore)).toEqual(["revisione", "assicurazione", "tagliando", "garanzia"]);
  });

  // Un promemoria vecchio con un tipo che non esiste piu' non deve sparire
  // dall'elenco: si legge "Altro" e si vede lo stesso.
  it("un tipo sconosciuto non fa sparire il promemoria", () => {
    expect(etichettaTipo("tipo_di_tre_anni_fa")).toBe("Altro");
  });

  // Chi si e' preso la briga di scrivere "richiamare Rossi per la Panda" ha
  // detto qualcosa di piu' preciso del tipo.
  it("il titolo scritto a mano vince sul tipo", () => {
    expect(titoloPromemoria({ tipo: "richiamo_lead", titolo: "Richiamare Rossi per la Panda" })).toBe(
      "Richiamare Rossi per la Panda"
    );
    expect(titoloPromemoria({ tipo: "revisione", titolo: "   " })).toBe("Revisione");
  });
});

describe("quanto manca a una scadenza", () => {
  it("una scadenza passata dice anche da quanto", () => {
    const quanto = urgenza("2026-08-31", OGGI);
    expect(quanto?.scaduto).toBe(true);
    expect(quanto?.etichetta).toContain("3 giorni fa");
  });

  /**
   * Il giorno stesso non e' scaduto: una revisione fatta il giorno della
   * scadenza e' in regola, e chiamare un cliente alle sei di sera del giorno in
   * cui ci si era ripromessi di chiamarlo conta ancora.
   */
  it("il giorno stesso non e' scaduto", () => {
    const quanto = urgenza("2026-09-03", OGGI);
    expect(quanto?.scaduto).toBe(false);
    expect(quanto?.oggi).toBe(true);
    expect(quanto?.etichetta).toBe("Oggi");
  });

  it("domani si dice domani, non fra 1 giorni", () => {
    expect(urgenza("2026-09-04", OGGI)?.etichetta).toBe("Domani");
  });

  it("piu' in la' si dice quanti giorni e quando", () => {
    const quanto = urgenza("2026-09-20", OGGI);
    expect(quanto?.etichetta).toContain("Fra 17 giorni");
    expect(quanto?.giorni).toBe(17);
  });

  it("una data che non c'e' non produce niente", () => {
    expect(urgenza(null)).toBeNull();
    expect(urgenza("non e' una data")).toBeNull();
  });
});

/**
 * Il difetto che questi test impediscono: un elenco ordinato solo per data
 * mette il promemoria di tre mesi fa insieme a quello di stamattina, e chi
 * guarda non distingue piu' l'arretrato da quello che deve fare adesso.
 */
describe("l'ordine in cui bruciano", () => {
  const voci = [
    { id: "fra-un-mese", scade_il: "2026-10-03" },
    { id: "scaduto", scade_il: "2026-08-20" },
    { id: "oggi", scade_il: "2026-09-03" },
    { id: "questa-settimana", scade_il: "2026-09-07" },
    { id: "scaduto-ieri", scade_il: "2026-09-02" },
  ];

  it("scaduti, oggi, questa settimana, piu' avanti", () => {
    const gruppi = raggruppaPerUrgenza(voci, OGGI);
    expect(gruppi.scaduti.map((v) => v.id)).toEqual(["scaduto", "scaduto-ieri"]);
    expect(gruppi.oggi.map((v) => v.id)).toEqual(["oggi"]);
    expect(gruppi.settimana.map((v) => v.id)).toEqual(["questa-settimana"]);
    expect(gruppi.piuAvanti.map((v) => v.id)).toEqual(["fra-un-mese"]);
  });

  // Dentro ogni mucchio la data comanda: il piu' vecchio degli scaduti sta in
  // cima, perche' e' quello che aspetta da piu' tempo.
  it("dentro ogni mucchio si ordina per data", () => {
    expect(raggruppaPerUrgenza(voci, OGGI).scaduti[0].id).toBe("scaduto");
  });

  // E' il numero da mettere sul pallino: quello che brucia adesso, non tutto
  // quello che esiste.
  it("il numero che brucia adesso sono gli scaduti piu' quelli di oggi", () => {
    expect(quantiUrgenti(voci, OGGI)).toBe(3);
  });
});

it("la data di oggi si scrive come la scrive il database", () => {
  expect(oggiIso(new Date(2026, 0, 7))).toBe("2026-01-07");
});

/**
 * **Questi leggono il testo del file SQL.** La prova vera e' stata fatta su un
 * Postgres 15 in Docker: dieci casi, fra cui la seconda revisione sulla stessa
 * vettura rifiutata, il promemoria che sparisce quando la vettura viene
 * cancellata, e le due concessionarie che non si vedono.
 */
describe("quello che impone il database", () => {
  it("un promemoria senza data non si scrive", () => {
    expect(migration).toContain("scade_il date not null");
  });

  /**
   * Il contrario dei documenti, e la differenza e' voluta: un contratto si
   * conserva dieci anni anche se l'auto sparisce, mentre "la revisione di
   * quella macchina scade in marzo" non vuol dire piu' niente quando quella
   * macchina non c'e' piu'. Dopo tre avvisi inutili non si guardano piu'
   * nemmeno quelli veri.
   */
  it("il promemoria muore con la vettura, al contrario del documento", () => {
    expect(migration).toContain("vehicle_id uuid references public.vehicles(id) on delete cascade");
    expect(leggi("supabase/migrations/20260903100000_archivio_documenti_veicolo.sql")).toContain(
      "vehicle_id uuid references public.vehicles(id) on delete set null"
    );
  });

  // Due righe aperte per la stessa revisione vorrebbero dire due avvisi per la
  // stessa cosa. Gli appunti liberi restano fuori dal vincolo.
  it("una sola scadenza aperta per tipo su ogni vettura, tranne gli appunti", () => {
    expect(migration).toContain("create unique index if not exists promemoria_una_scadenza_per_tipo");
    expect(migration).toContain("stato = 'aperto' and tipo <> 'altro'");
  });

  it("un promemoria fatto dice anche quando", () => {
    expect(migration).toContain("promemoria_fatto_ha_una_data");
  });

  it("ogni politica poggia su current_dealer_id, senza soglie di piano", () => {
    const politiche = migration.split("create policy").slice(1);
    expect(politiche.length).toBe(4);
    for (const politica of politiche) expect(politica).toContain("dealer_id = public.current_dealer_id()");
    expect(migration).not.toContain("dealer_plan_in_force");
  });

  it("il pubblico del sito non ha nessun permesso", () => {
    expect(migration).toContain("revoke all on public.promemoria from anon");
  });

  // Il lavoro che manda l'email del mattino gira col servizio e deve poter
  // segnare chi ha gia' avvisato.
  it("il lavoro del mattino puo' leggerli e segnarli", () => {
    expect(migration).toContain("to service_role");
    expect(migration).toContain("avvisato_il date");
  });
});

/**
 * Dove si scrivono e dove si leggono.
 */
describe("le due schermate", () => {
  const scheda = leggi("src/components/vehicles/riquadro-scadenze.tsx");
  const elenco = leggi("src/components/promemoria/promemoria-page.tsx");
  const veicolo = leggi("src/components/vehicles/vehicle-detail-page.tsx");

  it("le scadenze si scrivono sulla scheda della vettura", () => {
    expect(veicolo).toContain("<RiquadroScadenze vehicleId={vehicle.id}");
    expect(scheda).toContain("SCADENZE_VEICOLO.map");
  });

  /**
   * Cancellare la data toglie il promemoria: e' il gesto che uno si aspetta, e
   * una revisione gia' fatta che continua ad avvisare e' il rumore che rende
   * inutile anche gli avvisi veri.
   */
  it("cancellare la data toglie il promemoria", () => {
    expect(scheda).toContain("!data");
    expect(scheda).toContain('from("promemoria").delete()');
  });

  // Due posti dove scrivere la stessa scadenza divergerebbero al primo che ne
  // corregge uno solo.
  it("il bollo non si duplica qui: resta nel conto economico", () => {
    expect(scheda).not.toContain('"bollo"');
    expect(TIPI_PROMEMORIA.map((t) => t.valore)).not.toContain("bollo");
    expect(leggi("src/components/vehicles/vehicle-economics-card.tsx")).toContain("bollo_expires_on");
  });

  it("l'elenco mette gli scaduti in cima, separati", () => {
    expect(elenco).toContain("raggruppaPerUrgenza(righe)");
    expect(elenco.indexOf('titolo="Scaduti"')).toBeLessThan(elenco.indexOf('titolo="Oggi"'));
    expect(elenco.indexOf('titolo="Oggi"')).toBeLessThan(elenco.indexOf('titolo="Questa settimana"'));
  });

  // Segnare fatto non cancella: serve a poter tornare indietro e a sapere
  // cosa e' stato fatto e quando.
  it("segnare fatto non cancella la riga", () => {
    expect(elenco).toContain('stato: "fatto"');
    expect(elenco).toContain("fatto_il: new Date().toISOString()");
    expect(elenco).toContain("Vedi quelli fatti");
  });

  it("tutte e due dichiarano la concessionaria", () => {
    expect(scheda).toContain('.eq("dealer_id", dealerId)');
    expect(elenco).toContain('.eq("dealer_id", idConcessionaria)');
  });
});
