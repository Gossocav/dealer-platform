import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confermato,
  etichettaProvenienza,
  provenienza,
  scriviDalSito,
  scrittoDalDealer,
  segnaComeScrittoDalDealer,
} from "@/lib/provenienza-dati";

/**
 * **La regola: un dato scritto dal concessionario non si sovrascrive mai.**
 *
 * Questi sono i test **comportamentali**: dicono che la funzione fa la cosa
 * giusta. Piu' sotto ce n'e' un secondo gruppo, sul testo dei sorgenti, che
 * dice una cosa diversa e altrettanto necessaria -- che **nessuno possa fare
 * la cosa giusta per conto suo**. Il difetto arrivera' da una porta nuova, non
 * da questa: e' successo con il tetto del piano, che era corretto in un posto
 * e aggirato in dodici.
 */

const OGGI = "2026-09-20";

describe("un dato scritto dal concessionario non si sovrascrive", () => {
  it("il campo protetto non arriva nemmeno fra quelli da scrivere", () => {
    // Il punto di tutto: chi sincronizza non deve **saltarlo**, deve non
    // averlo in mano. Se comparisse qui, basterebbe una riga distratta.
    const esito = scriviDalSito(
      { entered_on: { fonte: "dealer" } },
      { entered_on: "2022-01-01" },
      { entered_on: { valore: "2022-03-01", fonte: "sito" } },
      OGGI,
    );

    expect(Object.keys(esito.daScrivere)).not.toContain("entered_on");
    expect(esito.protetti).toEqual(["entered_on"]);
  });

  it("quello letto dal sito e quello dedotto invece si sovrascrivono", () => {
    const esito = scriviDalSito(
      { entered_on: { fonte: "sito" }, vat_regime: { fonte: "dedotto" } },
      { entered_on: "2022-01-01", vat_regime: "margine" },
      {
        entered_on: { valore: "2022-03-01", fonte: "sito" },
        vat_regime: { valore: "esposta", fonte: "sito" },
      },
      OGGI,
    );

    expect(esito.daScrivere).toEqual({ entered_on: "2022-03-01", vat_regime: "esposta" });
    expect(esito.protetti).toEqual([]);
  });

  it("un campo mai visto prima si scrive", () => {
    const esito = scriviDalSito({}, {}, { vat_regime: { valore: "esposta", fonte: "sito" } }, OGGI);
    expect(esito.daScrivere).toEqual({ vat_regime: "esposta" });
    expect(esito.origineDati.vat_regime).toEqual({ fonte: "sito", confermato_il: null });
  });

  it("un campo che il sito non dichiara non cancella quello che c'e'", () => {
    // "Il sito non lo dice" non vuol dire "il sito dice che non c'e'".
    const esito = scriviDalSito(
      { entered_on: { fonte: "sito" } },
      { entered_on: "2022-01-01" },
      { entered_on: { valore: null, fonte: "sito" } },
      OGGI,
    );
    expect(esito.daScrivere).toEqual({});
    expect(esito.origineDati.entered_on).toEqual({ fonte: "sito" });
  });

  it("un origine_dati malformato non apre la porta", () => {
    // Se qualcuno ci scrivesse dentro una lista o una stringa, il campo
    // risulterebbe "mai visto" -- e un campo mai visto si scrive. Va bene: il
    // caso pericoloso e' l'opposto, cioe' un campo del dealer che risulta
    // sovrascrivibile, e quello non puo' succedere perche' la fonte "dealer"
    // o c'e' scritta o non c'e'.
    for (const rotto of [null, undefined, "dealer", ["dealer"], 42, { entered_on: "dealer" }]) {
      expect(scrittoDalDealer(rotto, "entered_on"), String(rotto)).toBe(false);
      expect(provenienza(rotto, "entered_on")).toBeNull();
    }
  });
});

describe("il disaccordo non si perde in silenzio", () => {
  it("quando il sito dice un'altra cosa, si registra senza toccare il valore", () => {
    // Un dato che il sito dichiara e noi scartiamo senza lasciare traccia e'
    // indistinguibile da un dato che il sito non ha mai detto.
    const esito = scriviDalSito(
      { entered_on: { fonte: "dealer", confermato_il: "2026-09-16" } },
      { entered_on: "2022-01-01" },
      { entered_on: { valore: "2022-03-01", fonte: "sito" } },
      OGGI,
    );

    expect(esito.daScrivere).toEqual({});
    expect(esito.origineDati.entered_on).toEqual({
      fonte: "dealer",
      confermato_il: "2026-09-16",
      il_sito_dice: { valore: "2022-03-01", visto_il: OGGI },
    });
  });

  it("e sparisce da solo quando il sito torna d'accordo", () => {
    const esito = scriviDalSito(
      {
        entered_on: {
          fonte: "dealer",
          il_sito_dice: { valore: "2022-03-01", visto_il: "2026-09-18" },
        },
      },
      { entered_on: "2022-01-01" },
      { entered_on: { valore: "2022-01-01", fonte: "sito" } },
      OGGI,
    );

    expect(esito.origineDati.entered_on).toEqual({ fonte: "dealer" });
  });

  it("si sovrascrive a ogni giro: conta l'ultima cosa che il sito dice", () => {
    // Uno storico dei disaccordi sarebbe una tabella, non un campo.
    const esito = scriviDalSito(
      { entered_on: { fonte: "dealer", il_sito_dice: { valore: "2022-03-01", visto_il: "2026-09-18" } } },
      { entered_on: "2022-01-01" },
      { entered_on: { valore: "2022-05-01", fonte: "sito" } },
      OGGI,
    );

    expect(esito.origineDati.entered_on.il_sito_dice).toEqual({ valore: "2022-05-01", visto_il: OGGI });
  });
});

describe("proposto e confermato", () => {
  it("un dato letto dal sito nasce proposto", () => {
    const esito = scriviDalSito({}, {}, { vat_regime: { valore: "esposta", fonte: "sito" } }, OGGI);
    expect(confermato(esito.origineDati, "vat_regime")).toBe(false);
  });

  it("quello scritto dal concessionario e' confermato per definizione", () => {
    const origine = segnaComeScrittoDalDealer({}, ["entered_on"]);
    expect(confermato(origine, "entered_on")).toBe(true);
  });

  it("una conferma gia' data non si perde se il sito riconferma lo stesso valore", () => {
    // Altrimenti il concessionario si vedrebbe richiedere la stessa conferma a
    // ogni sincronizzazione, e smetterebbe di darla.
    const esito = scriviDalSito(
      { vat_regime: { fonte: "sito", confermato_il: "2026-09-16" } },
      { vat_regime: "esposta" },
      { vat_regime: { valore: "esposta", fonte: "sito" } },
      OGGI,
    );
    expect(confermato(esito.origineDati, "vat_regime")).toBe(true);
  });

  it("ma se il sito cambia valore la conferma decade", () => {
    const esito = scriviDalSito(
      { vat_regime: { fonte: "sito", confermato_il: "2026-09-16" } },
      { vat_regime: "esposta" },
      { vat_regime: { valore: "margine", fonte: "sito" } },
      OGGI,
    );
    expect(confermato(esito.origineDati, "vat_regime")).toBe(false);
  });
});

describe("la dicitura accanto al valore", () => {
  it("dice sempre da dove viene, e se e' ancora una proposta", () => {
    // Un numero non si mostra mai nudo: se la dicitura non si vede, il dato
    // non si mostra.
    expect(etichettaProvenienza({ a: { fonte: "dealer" } }, "a")).toBe("scritto da te");
    expect(etichettaProvenienza({ a: { fonte: "sito" } }, "a")).toBe("dal tuo sito · da confermare");
    expect(etichettaProvenienza({ a: { fonte: "sito", confermato_il: "2026-09-16" } }, "a")).toBe("dal tuo sito");
    expect(etichettaProvenienza({ a: { fonte: "dedotto" } }, "a")).toBe("deciso dal tuo sito · da confermare");
    expect(etichettaProvenienza({}, "a")).toBeNull();
  });
});

/**
 * **Il secondo guardiano, e serve a una cosa diversa dal primo.**
 *
 * I test qui sopra dicono che la funzione fa la cosa giusta. Questo dice che
 * **nessuno puo' farla per conto suo**: nessun file, fuori da
 * `provenienza-dati.ts`, puo' scrivere uno dei campi protetti dentro un
 * aggiornamento di `vehicles` o di `vehicle_acquisitions`.
 *
 * E' la stessa medicina del tetto del piano, che era corretto in un posto e
 * aggirato in dodici, e delle interrogazioni senza `dealer_id`.
 */
describe("nessuno scrive i campi protetti per conto suo", () => {
  const PROTETTI = ["entered_on", "vat_regime", "registration_date"];

  /**
   * **Le quattro schermate dove scrive il concessionario, ancora da collegare.**
   *
   * Questo elenco non e' un'eccezione comoda: e' un difetto **gia' esistente**
   * messo per iscritto, trovato da questo stesso test il 15/09/2026.
   *
   * Quelle pagine scrivono `registration_date` a mano, e **non segnano il
   * campo come scritto dal concessionario**. Finche' non lo fanno, la
   * sincronizzazione lo considera suo e lo riscrive -- perche' oggi riscrive
   * **tutto** il contenuto letto dal sito a ogni ripasso, ogni tre ore
   * (`src/app/api/cron/sincronizza-siti/route.ts:404`). Il difetto e' piu'
   * largo di questi tre campi: riguarda prezzo, chilometri, colore,
   * carrozzeria e descrizione, cioe' tutto cio' che il concessionario puo'
   * correggere su un'auto importata.
   *
   * **L'elenco deve solo accorciarsi.** Il test qui sotto fallisce se qualcuno
   * ne aggiunge una quinta.
   */
  const DA_COLLEGARE = new Set([
    "src/components/perizie/perizia-page.tsx",
    "src/components/vehicles/vehicle-detail-page.tsx",
    "src/components/vehicles/vehicle-editor-page.tsx",
    "src/components/vehicles/vehicles-management-page.tsx",
  ]);

  /** Tutti i file di `src/`, esclusi i test. */
  function sorgenti(cartella: string, raccolti: string[] = []): string[] {
    for (const nome of readdirSync(resolve(process.cwd(), cartella))) {
      const percorso = `${cartella}/${nome}`;
      if (statSync(resolve(process.cwd(), percorso)).isDirectory()) {
        sorgenti(percorso, raccolti);
      } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
        raccolti.push(percorso);
      }
    }
    return raccolti;
  }

  it("chi aggiorna un veicolo con un campo protetto passa da provenienza-dati", () => {
    const colpevoli: string[] = [];

    for (const percorso of sorgenti("src")) {
      if (percorso.endsWith("src/lib/provenienza-dati.ts")) continue;
      const sorgente = readFileSync(resolve(process.cwd(), percorso), "utf8");

      // Solo chi scrive davvero: un `select` che nomina la colonna va bene.
      const scrive = /\.update\(|\.upsert\(|\.insert\(/.test(sorgente);
      if (!scrive) continue;

      const nomina = PROTETTI.filter((campo) => new RegExp(`\\b${campo}\\s*:`).test(sorgente));
      if (nomina.length === 0) continue;

      if (!sorgente.includes("@/lib/provenienza-dati") && !DA_COLLEGARE.has(percorso)) {
        colpevoli.push(`${percorso} (${nomina.join(", ")})`);
      }
    }

    expect(
      colpevoli,
      `Questi file scrivono un campo protetto senza passare da provenienza-dati.ts:\n  ${colpevoli.join("\n  ")}\n` +
        "Un dato scritto dal concessionario non si sovrascrive mai, e la regola non si applica ricordandosene: " +
        "si applica chiedendo a scriviDalSito cosa si puo' scrivere.",
    ).toEqual([]);
  });

  it("l'elenco dei campi protetti non e' vuoto", () => {
    // Un elenco svuotato farebbe passare il test qui sopra su qualunque cosa.
    expect(PROTETTI.length).toBeGreaterThanOrEqual(3);
  });

  it("le schermate da collegare sono quattro, e devono solo diminuire", () => {
    // Un elenco di eccezioni che cresce e' un elenco che non serve piu' a
    // niente: e' il modo in cui un controllo diventa rumore.
    expect(DA_COLLEGARE.size).toBeLessThanOrEqual(4);
    for (const percorso of DA_COLLEGARE) {
      expect(sorgenti("src"), `${percorso} non esiste piu': va tolto dall'elenco`).toContain(percorso);
    }
  });
});
