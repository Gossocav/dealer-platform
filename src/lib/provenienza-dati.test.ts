import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { campiDalBloccoRicco, CAMPI_DAL_SITO, valoriInArchivio } from "@/lib/dealer-site-sync";
import {
  campiDavveroCambiati,
  dalSito,
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
      // Dal 18/09/2026 il segno porta anche **chi** non era d'accordo: senza,
      // la scheda avrebbe dovuto scegliere fra "il tuo sito" e "il tuo feed"
      // a caso, e una provenienza sbagliata e' peggio di nessuna.
      il_sito_dice: { valore: "2022-03-01", visto_il: OGGI, fonte: "sito" },
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

    expect(esito.origineDati.entered_on.il_sito_dice).toEqual({ valore: "2022-05-01", visto_il: OGGI, fonte: "sito" });
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
    // Un dato da feed non viene "dal tuo sito": una provenienza sbagliata e'
    // peggio di nessuna provenienza (deciso il 16/09/2026).
    expect(etichettaProvenienza({ a: { fonte: "feed" } }, "a")).toBe("dal tuo feed · da confermare");
    expect(etichettaProvenienza({ a: { fonte: "feed", confermato_il: "2026-09-16" } }, "a")).toBe("dal tuo feed");
    // Dal 18/09/2026 risponde **sempre**: prima taceva, e il silenzio su una
    // scheda senza provenienza registrata lasciava un numero nudo -- la
    // regola applicata a meta' proprio dove il parco e' piu' vecchio.
    expect(etichettaProvenienza({}, "a")).toBe("provenienza non registrata");
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
  // Tutti i campi che arrivano dal sito, non solo i tre del blocco ricco:
  // il prezzo corretto a mano va protetto quanto l'immatricolazione. Il
  // primo guardiano (15/09/2026) ne guardava tre e per questo vedeva le
  // schermate sbagliate.
  const PROTETTI = [...CAMPI_DAL_SITO, "entered_on", "vat_regime", "registration_date"];

  /**
   * **Le porte che scrivono su `vehicles` senza dichiarare chi scrive.**
   *
   * Questo elenco non e' un'eccezione comoda: e' un difetto **gia' esistente**
   * messo per iscritto. Il 15/09/2026 ne elencava tre, ed erano tre falsi
   * allarmi: il primo guardiano guardava se un file *nominava*
   * `registration_date` da qualche parte, non se lo *scriveva* su `vehicles`.
   * La pagina delle perizie scrive su `vehicle_appraisals`; le altre due
   * cambiano solo stato e pubblicazione. Intanto le porte vere -- il feed, il
   * file, la duplicazione -- restavano fuori. "Una regola scritta giusta puo'
   * essere applicata a meta'": rifatto il 16/09/2026 seguendo la catena da
   * `.from("vehicles")` alla scrittura.
   *
   * Le due del feed (`feed/route.ts`, `import-feed/route.ts`) riscrivevano
   * prezzo, chilometri, colore... a ogni passaggio, come la sincronizzazione
   * dal sito: chiuse il 16/09/2026 con la fonte `feed`.
   *
   * La duplicazione (`vehicles-management-page.tsx`) copiava tutte le
   * colonne con `select("*")`, chiavi comprese: chiusa il 16/09/2026 con
   * `copiaDelVeicolo`, che lascia all'originale targa, telaio, cliente,
   * aggancio al sito e provenienza.
   *
   * Le due che restano, e cosa manca a ciascuna:
   *
   * - **`vehicles-import-page.tsx`**: inserisce dal file del concessionario
   *   senza segnare i campi come suoi. Non li sovrascrive nessuno, perche'
   *   quelle righe non hanno un sito che le rilegge; ma la provenienza non
   *   c'e', e la scheda non potra' dire "scritto da te".
   * - **`vehicle-delivery-sheet-page.tsx`**: salva sul veicolo i dati
   *   scritti a mano nel foglio di consegna, senza dichiararli.
   *
   * **L'elenco deve solo accorciarsi.** Il test qui sotto fallisce se qualcuno
   * ne aggiunge una terza.
   */
  const DA_COLLEGARE = new Set([
    "src/components/vehicles/vehicles-import-page.tsx",
    "src/components/vehicles/vehicle-delivery-sheet-page.tsx",
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

  /**
   * Le scritture su `vehicles` di un file, con il testo del loro argomento.
   * Si parte da ogni `.from("vehicles")` e si segue la catena fino alla prima
   * scrittura; se prima si incontra una lettura (`.select`) o un'altra
   * tabella, quella catena non scrive.
   */
  function scrittureSuVeicoli(sorgente: string): string[] {
    const trovate: string[] = [];
    const inizio = /\.from\("vehicles"\)/g;
    for (const partenza of sorgente.matchAll(inizio)) {
      const coda = sorgente.slice((partenza.index ?? 0) + partenza[0].length);
      const prossimo = coda.match(/\.(update|upsert|insert|select|from)\(/);
      if (!prossimo || prossimo.index === undefined) continue;
      if (prossimo[1] === "select" || prossimo[1] === "from") continue;
      // L'argomento: dalla parentesi aperta a quella che la chiude.
      let livello = 0;
      let da = prossimo.index + prossimo[0].length - 1;
      for (let i = da; i < coda.length; i += 1) {
        if (coda[i] === "(") livello += 1;
        if (coda[i] === ")") livello -= 1;
        if (livello === 0) {
          trovate.push(coda.slice(da + 1, i).trim());
          break;
        }
      }
      da = 0;
    }
    return trovate;
  }

  /**
   * Se l'argomento e' `nome(...)`, cio' che quella funzione restituisce: la
   * si cerca nel file stesso o, se e' importata da `@/lib/...`, in quel file.
   */
  function corpoSeFunzioneLocale(sorgente: string, argomento: string): { testo: string; dove: string } | null {
    const chiamata = argomento.match(/^([a-zA-Z_]\w*)\(/);
    if (!chiamata) return null;
    const nome = chiamata[1];
    let dove = sorgente;
    if (!dove.includes(`function ${nome}(`)) {
      const importata = sorgente.match(new RegExp(`import \\{[^}]*\\b${nome}\\b[^}]*\\} from "@/lib/([\\w-]+)"`));
      if (!importata) return null;
      dove = readFileSync(resolve(process.cwd(), `src/lib/${importata[1]}.ts`), "utf8");
    }
    const definizione = dove.indexOf(`function ${nome}(`);
    if (definizione < 0) return null;
    const corpo = dove.slice(definizione, dove.indexOf("\n}", definizione));
    const ritorno = corpo.indexOf("return ");
    return { testo: ritorno < 0 ? corpo : corpo.slice(ritorno + "return ".length).trim(), dove };
  }

  it("chi scrive su vehicles un campo protetto passa da provenienza-dati", () => {
    const colpevoli: string[] = [];

    for (const percorso of sorgenti("src")) {
      if (percorso.endsWith("src/lib/provenienza-dati.ts")) continue;
      const sorgente = readFileSync(resolve(process.cwd(), percorso), "utf8");

      const porte = scrittureSuVeicoli(sorgente).filter((argomento) => {
        // Un oggetto scritto per esteso si legge: e' una porta solo se nomina
        // un campo protetto. Lo stesso vale per la chiamata di una funzione
        // definita nello stesso file (`campiInVetrina(adesso)`) o importata
        // da `@/lib`: si legge cosa restituisce. Una variabile o uno spread
        // non si leggono da qui, e allora si e' prudenti: chi scrive cosi'
        // deve dichiararsi -- lui, o la libreria a cui ha delegato la riga
        // (`copiaDelVeicolo`), che passa dalla provenienza al posto suo.
        const risolto = corpoSeFunzioneLocale(sorgente, argomento);
        const testo = risolto?.testo ?? argomento;
        const perEsteso = testo.startsWith("{") && !testo.includes("...");
        if (perEsteso && !PROTETTI.some((campo) => new RegExp(`\\b${campo}\\s*:`).test(testo))) return false;
        return !risolto?.dove.includes("@/lib/provenienza-dati");
      });
      if (porte.length === 0) continue;

      if (!sorgente.includes("@/lib/provenienza-dati") && !DA_COLLEGARE.has(percorso)) {
        colpevoli.push(`${percorso} (${porte.length} scrittur${porte.length === 1 ? "a" : "e"})`);
      }
    }

    expect(
      colpevoli,
      `Questi file scrivono su vehicles senza passare da provenienza-dati.ts:\n  ${colpevoli.join("\n  ")}\n` +
        "Un dato scritto dal concessionario non si sovrascrive mai, e la regola non si applica ricordandosene: " +
        "si applica chiedendo a scriviDalSito cosa si puo' scrivere, o dichiarando con segnaComeScrittoDalDealer cosa ha scritto lui.",
    ).toEqual([]);
  });

  it("il guardiano vede una porta nuova", () => {
    // Un controllo che non e' mai stato visto rosso non si sa se guardi.
    const finto = 'await supabase.from("vehicles").update({ price: 1 }).eq("id", id);';
    expect(scrittureSuVeicoli(finto)).toEqual(["{ price: 1 }"]);
    expect(scrittureSuVeicoli('supabase.from("vehicles").select("id").eq("id", 1)')).toEqual([]);
    expect(scrittureSuVeicoli('supabase.from("vehicles").update(payload).eq("id", 1)')).toEqual(["payload"]);
    expect(scrittureSuVeicoli('supabase.from("vehicles").insert({ ...payload, status: "draft" })')).toEqual(['{ ...payload, status: "draft" }']);
  });

  it("l'elenco dei campi protetti non e' vuoto", () => {
    // Un elenco svuotato farebbe passare il test qui sopra su qualunque cosa.
    expect(PROTETTI.length).toBeGreaterThanOrEqual(3);
  });

  it("le schermate da collegare devono solo diminuire", () => {
    // Un elenco di eccezioni che cresce e' un elenco che non serve piu' a
    // niente: e' il modo in cui un controllo diventa rumore.
    // Cinque il 16/09/2026, quando il guardiano ha cominciato a seguire le
    // scritture vere invece dei nomi dei campi; tre lo stesso giorno, chiuse
    // le due porte del feed. La scheda in modifica, la sincronizzazione,
    // "Importa dal sito", il feed e la duplicazione sono collegati: due.
    expect(DA_COLLEGARE.size).toBeLessThanOrEqual(2);
    for (const percorso of DA_COLLEGARE) {
      expect(sorgenti("src"), `${percorso} non esiste piu': va tolto dall'elenco`).toContain(percorso);
    }
  });
});

/**
 * **Il caso vero, riprodotto.**
 *
 * Il difetto, trovato il 15/09/2026 leggendo
 * `src/app/api/cron/sincronizza-siti/route.ts`: il ripasso riscriveva
 * **l'intero** contenuto letto dal sito a ogni passaggio, ogni tre ore. Un
 * concessionario che correggeva il prezzo di un'auto importata se lo vedeva
 * tornare come prima entro tre ore, **in silenzio**.
 *
 * E' peggio del difetto corretto il 27/08/2026, quando un'auto importata non
 * si poteva proprio salvare: li' lo capivi subito e chiedevi. Qui credi di
 * aver sbagliato tu, riprovi, e smetti di fidarti del gestionale.
 *
 * Non si e' potuto sapere **quante** correzioni siano andate perse: `updated_at`
 * lo muove la sincronizzazione stessa (misurato: su 370 auto importate, 318
 * ce l'hanno a meno di cinque secondi da `import_synced_at`), e il registro di
 * controllo per i veicoli registra solo i cambi di stato -- tre righe in tutta
 * la storia, tutte `fromStatus`/`toStatus`.
 */
describe("il ripasso non riscrive quello che ha corretto il concessionario", () => {
  /** Quello che il sito dice, come lo costruisce `payloadDatiVeicolo`. */
  const DAL_SITO = {
    brand: "Opel",
    model: "Corsa",
    price: 12000,
    mileage: 45000,
    color: "Grigio",
    description: "Berlina compatta.",
  };

  it("il prezzo corretto a mano resta quello del concessionario", () => {
    // La scheda come sta dopo che il concessionario ha corretto il prezzo:
    // 9.500 invece dei 12.000 che dice il sito.
    const origineDati = segnaComeScrittoDalDealer({ price: { fonte: "sito" } }, ["price"]);
    const inArchivio = { ...DAL_SITO, price: 9500 };

    const esito = scriviDalSito(origineDati, inArchivio, dalSitoTest(DAL_SITO), OGGI);

    // Il prezzo non arriva nemmeno fra quelli da scrivere.
    expect(esito.daScrivere.price).toBeUndefined();
    expect(esito.protetti).toEqual(["price"]);

    // Tutto il resto si aggiorna normalmente: la protezione e' del campo, non
    // della scheda.
    expect(esito.daScrivere.mileage).toBe(45000);
    expect(esito.daScrivere.description).toBe("Berlina compatta.");
  });

  it("e il disaccordo resta scritto, cosi' il concessionario sa cosa dice il suo sito", () => {
    const origineDati = segnaComeScrittoDalDealer({}, ["price"]);
    const esito = scriviDalSito(origineDati, { price: 9500 }, dalSitoTest({ price: 12000 }), OGGI);

    expect(esito.origineDati.price).toEqual({
      fonte: "dealer",
      il_sito_dice: { valore: "12000", visto_il: OGGI, fonte: "sito" },
    });
  });

  it("un'auto che il concessionario non ha mai toccato si aggiorna tutta", () => {
    // La protezione non deve diventare una scusa per non sincronizzare piu'
    // niente: senza un campo segnato "dealer", il ripasso scrive tutto.
    const esito = scriviDalSito({}, {}, dalSitoTest(DAL_SITO), OGGI);
    expect(Object.keys(esito.daScrivere).sort()).toEqual(Object.keys(DAL_SITO).sort());
    expect(esito.protetti).toEqual([]);
  });

  it("il feed si ferma davanti a quello che ha scritto il concessionario, e si firma come feed", () => {
    // Stesso difetto della sincronizzazione, altra porta: il feed riscriveva
    // tutti i campi a ogni "Importa". Zero righe da feed in produzione il
    // 16/09/2026, ma una porta che nessuno usa e' comunque una porta.
    const esito = scriviDalSito(
      { price: { fonte: "dealer" } },
      { price: 9500, mileage: 120000, equipment: ["Clima", "Navigatore"] },
      dalSito({ price: 8900, mileage: 118000, equipment: ["Clima", "Navigatore"] }, "feed"),
      "2026-09-16",
    );
    expect(esito.daScrivere).toEqual({ mileage: 118000, equipment: ["Clima", "Navigatore"] });
    expect(esito.protetti).toEqual(["price"]);
    expect(esito.origineDati.price).toEqual({
      fonte: "dealer",
      il_sito_dice: { valore: "8900", visto_il: "2026-09-16", fonte: "feed" },
    });
    expect(esito.origineDati.mileage).toEqual({ fonte: "feed", confermato_il: null });
  });

  it("tutte le porte automatiche passano davvero da qui, e l'elenco dei campi combacia", () => {
    // Le porte da cui un dato del sito entra in archivio sono **due**: la
    // sincronizzazione notturna e il bottone "Importa dal sito" del
    // gestionale. Il 15/09/2026 riscrivevano tutte e due l'intero payload;
    // proteggerne una sola avrebbe lasciato l'altra a cancellare le
    // correzioni al primo clic.
    const rotta = readFileSync(resolve(process.cwd(), "src/app/api/cron/sincronizza-siti/route.ts"), "utf8");
    const importaDalSito = readFileSync(resolve(process.cwd(), "src/app/api/vehicles/import-site/route.ts"), "utf8");
    const sync = readFileSync(resolve(process.cwd(), "src/lib/dealer-site-sync.ts"), "utf8");

    expect(rotta).toContain("scriviDalSito(");
    expect(rotta, "il ripasso scrive ancora il payload senza filtrarlo").not.toContain(
      "{ ...payloadDatiVeicolo(letto.vehicle), import_synced_at",
    );
    expect(importaDalSito).toContain("scriviDalSito(");
    expect(importaDalSito, "l'importazione a mano scrive ancora il payload intero").not.toContain(".update(payload)");
    expect(importaDalSito, "l'importazione a mano scrive ancora il payload intero").not.toContain(".insert(payload)");
    expect(importaDalSito, "payloadVeicolo non deve portare i dati del sito").not.toMatch(
      /function payloadVeicolo[\s\S]{0,400}\.\.\.payloadDatiVeicolo\(/,
    );

    // Le due porte del feed, chiuse il 16/09/2026: la fonte deve essere
    // `feed`, non `sito`, perche' la dicitura a schermo la legge da li'.
    for (const percorso of ["src/app/api/vehicles/import-feed/route.ts", "src/app/api/vehicles/feed/route.ts"]) {
      const feed = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(feed, `${percorso} non passa da scriviDalSito`).toContain("scriviDalSito(");
      expect(feed, `${percorso} non si firma come feed`).toMatch(/dalSito\([^)]*,\s*"feed"\)/);
      expect(feed, `${percorso} si firma come sito`).not.toMatch(/dalSito\([^)]*,\s*"sito"\)/);
    }
    const importaDalFeed = readFileSync(resolve(process.cwd(), "src/app/api/vehicles/import-feed/route.ts"), "utf8");
    expect(importaDalFeed, "il payload del feed viene ancora scritto intero").not.toContain("...buildVehicleInsertPayload(");
    const feedServizio = readFileSync(resolve(process.cwd(), "src/app/api/vehicles/feed/route.ts"), "utf8");
    expect(feedServizio, "l'aggiornamento scrive ancora i campi a mano").not.toMatch(/\.update\(\{\s*price: vehicleData\.price/);
    expect(feedServizio, "l'inserimento scrive ancora vehicleData intero").not.toContain("...vehicleData,");

    // Due elenchi che devono restare uguali: `payloadDatiVeicolo` scrive i
    // campi, `CAMPI_DAL_SITO` li rilegge per sapere cosa c'e' adesso. Un campo
    // nel primo e non nel secondo verrebbe riscritto senza guardare chi
    // l'aveva messo -- cioe' il difetto tornerebbe, ma solo su quel campo.
    const elenco = sync.slice(sync.indexOf("export const CAMPI_DAL_SITO"), sync.indexOf("] as const"));
    const nelPayload = [
      ...sync.slice(sync.indexOf("export function payloadDatiVeicolo")).matchAll(/^\s{4}([a-z_]+):/gm),
    ].map((m) => m[1]);

    const mancanti = nelPayload.filter((campo) => !elenco.includes(`"${campo}"`));
    expect(mancanti, `campi scritti dal sito e non elencati in CAMPI_DAL_SITO: ${mancanti.join(", ")}`).toEqual([]);
  });
});

describe("un campo non toccato non diventa \"scritto da te\"", () => {
  const inArchivio = {
    brand: "Opel",
    price: "9500.00",
    mileage: 120000,
    equipment: ["Clima", "Navigatore"],
    registration_date: "2022-01-01",
    status: "published",
    published: true,
  };

  it("cambia solo quello che cambia", () => {
    const daSalvare = { ...inArchivio, price: 8900, status: "draft", published: false };
    expect(campiDavveroCambiati(inArchivio, daSalvare, ["dealer_id", "status", "published"])).toEqual(["price"]);
  });

  it("un salvataggio che non cambia niente non segna niente", () => {
    // E' il caso vero: aprire un'auto importata e premere Salva. Prima del
    // 18/09/2026 usciva con venticinque campi "scritto da te".
    const daSalvare = { ...inArchivio, price: 9500 };
    expect(campiDavveroCambiati(inArchivio, daSalvare, ["dealer_id", "status", "published"])).toEqual([]);
  });

  it("il prezzo del database e quello del modulo sono lo stesso prezzo", () => {
    // Il database restituisce "9500.00", il modulo rimanda 9500: due forme
    // della stessa cifra. Confrontate come testo sembrano diverse, e il
    // prezzo risultava cambiato a ogni salvataggio.
    expect(campiDavveroCambiati({ price: "9500.00" }, { price: 9500 })).toEqual([]);
    expect(campiDavveroCambiati({ price: "9500.00" }, { price: 9501 })).toEqual(["price"]);
    // Il testo resta testo: "01" e "1" su una targa non sono lo stesso.
    expect(campiDavveroCambiati({ plate: "GA123BC" }, { plate: "GA123BD" })).toEqual(["plate"]);
  });

  it("vuoto e valore non si confondono, in nessuna delle due direzioni", () => {
    expect(campiDavveroCambiati({ color: null }, { color: "Rosso" })).toEqual(["color"]);
    expect(campiDavveroCambiati({ color: "Rosso" }, { color: null })).toEqual(["color"]);
    expect(campiDavveroCambiati({ color: null }, { color: "" })).toEqual([]);
    // Una scheda nuova non ha archivio: tutto quello che ha un valore e' suo.
    expect(campiDavveroCambiati(null, { brand: "Fiat", color: null })).toEqual(["brand"]);
  });

  it("nemmeno la sincronizzazione vede un disaccordo dove non c'e'", () => {
    // Stessa cifra scritta in due forme: prima usciva
    // "il tuo sito ora dice 9500" su un prezzo identico a quello in archivio.
    const esito = scriviDalSito(
      { price: { fonte: "dealer", confermato_il: "2026-09-01" } },
      { price: "9500.00" },
      dalSito({ price: 9500 }),
      "2026-09-18",
    );
    expect(esito.origineDati.price?.il_sito_dice).toBeUndefined();
  });
});

/**
 * **Il difetto, provato con un caso vero il 18/09/2026.**
 *
 * Il ripasso proponeva tre campi letti dal blocco ricco -- immatricolazione,
 * regime IVA, data d'ingresso -- ma ne rileggeva dall'archivio soltanto i
 * ventidue della pagina. Su una scheda dove il concessionario aveva scritto
 * l'immatricolazione, il confronto avveniva fra il valore del sito e il
 * **vuoto**: sempre diverso, quindi un disaccordo registrato anche quando le
 * due date erano identiche. A schermo sarebbe diventato "il tuo sito ora dice
 * 01/01/2022, tu avevi scritto 01/01/2022".
 *
 * In produzione non aveva ancora toccato niente -- zero campi "scritto da te"
 * su 372 auto -- ma sarebbe scattato al primo salvataggio seguito da un giro
 * notturno.
 */
describe("un disaccordo non si inventa", () => {
  it("chi non sa cosa c'e' in archivio non dichiara un disaccordo", () => {
    const esito = scriviDalSito(
      { registration_date: { fonte: "dealer" } },
      { price: 9500 }, // l'immatricolazione non e' stata riletta
      dalSito({ registration_date: "2022-01-01" }),
      "2026-09-18",
    );
    expect(esito.origineDati.registration_date).toEqual({ fonte: "dealer" });
    expect(esito.daScrivere.registration_date).toBeUndefined();
    expect(esito.protetti).toContain("registration_date");
  });

  it("e non cancella per sbaglio un disaccordo che c'era", () => {
    const prima = { fonte: "dealer" as const, il_sito_dice: { valore: "2021-05-01", visto_il: "2026-09-17" } };
    const esito = scriviDalSito({ registration_date: prima }, {}, dalSito({ registration_date: "2021-05-01" }), "2026-09-18");
    expect(esito.origineDati.registration_date).toEqual(prima);
  });

  it("quando il valore c'e' davvero, il disaccordo si vede e sparisce da solo", () => {
    const diverso = scriviDalSito(
      { registration_date: { fonte: "dealer" } },
      { registration_date: "2022-01-01" },
      dalSito({ registration_date: "2021-05-01" }),
      "2026-09-18",
    );
    expect(diverso.origineDati.registration_date?.il_sito_dice).toEqual({
      valore: "2021-05-01",
      visto_il: "2026-09-18",
      fonte: "sito",
    });

    const uguale = scriviDalSito(
      { registration_date: { fonte: "dealer", il_sito_dice: { valore: "2021-05-01", visto_il: "2026-09-17" } } },
      { registration_date: "2022-01-01" },
      dalSito({ registration_date: "2022-01-01" }),
      "2026-09-18",
    );
    expect(uguale.origineDati.registration_date?.il_sito_dice).toBeUndefined();
  });

  it("ogni campo che il blocco ricco propone viene anche riletto dall'archivio", () => {
    // E' il guardiano vero: la regola non e' "questi tre campi", e' "cio' che
    // si propone si rilegge". Un quarto campo aggiunto al blocco ricco senza
    // rileggerlo rifarebbe lo stesso difetto, su un altro campo.
    const blocco = {
      campi: 341,
      immatricolazione: "2022-01-01",
      regimeIva: "esposta" as const,
      categoria: "USED",
      chilometri: 12000,
      ingresso: { giorno: "2026-01-10", qualita: "sito" as const },
      targa: null,
      telaio: null,
    };
    const proposti = Object.keys(campiDalBloccoRicco(blocco));
    const riletti = Object.keys(valoriInArchivio({ id: "v", import_source_id: "1", origine_dati: {} }));
    const dimenticati = proposti.filter((campo) => !riletti.includes(campo));
    expect(dimenticati, `campi proposti al sito e mai riletti dall'archivio: ${dimenticati.join(", ")}`).toEqual([]);
  });

  it("la data d'ingresso si rilegge comunque il database consegni la riga", () => {
    // Una vettura per riga (vehicle_id e' la chiave primaria): la produzione
    // consegna un oggetto -- verificato il 18/09/2026 -- ma una forma diversa
    // farebbe sparire il valore in silenzio.
    const base = { id: "v", import_source_id: "1", origine_dati: {} };
    expect(valoriInArchivio({ ...base, vehicle_acquisitions: { entered_on: "2026-01-10" } }).entered_on).toBe("2026-01-10");
    expect(valoriInArchivio({ ...base, vehicle_acquisitions: [{ entered_on: "2026-01-10" }] }).entered_on).toBe("2026-01-10");
    expect(valoriInArchivio({ ...base, vehicle_acquisitions: null }).entered_on).toBeNull();
    expect(valoriInArchivio(base).entered_on).toBeNull();
  });

  it("tutte e due le porte dal sito rileggono le stesse colonne", () => {
    // Un campo riletto da una porta e non dall'altra e' lo stesso difetto su
    // una sola delle due strade: si troverebbe al doppio del tempo.
    for (const percorso of ["src/app/api/cron/sincronizza-siti/route.ts", "src/app/api/vehicles/import-site/route.ts"]) {
      const rotta = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(rotta, `${percorso} non usa l'elenco comune`).toContain("COLONNE_DA_RILEGGERE");
      expect(rotta, `${percorso} si e' riscritto l'elenco da solo`).not.toContain('"id, import_source_id, origine_dati, "');
    }
  });
});

/** Come `dalSito`, scritta qui per non dipendere dall'ordine degli import. */
function dalSitoTest(valori: Record<string, string | number | null>) {
  const letti: Record<string, { valore: string | number | null; fonte: "sito" }> = {};
  for (const [campo, valore] of Object.entries(valori)) letti[campo] = { valore, fonte: "sito" };
  return letti;
}

describe("la scheda in modifica segna come suoi i campi che salva", () => {
  const editor = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-editor-page.tsx"), "utf8");

  it("rilegge la provenienza e la riscrive salvando", () => {
    // Senza questo la protezione non si accende mai: il ripasso segna tutto
    // come "letto dal sito", e la correzione del concessionario torna
    // sovrascrivibile al primo giro.
    expect(editor).toContain("origine_dati");
    expect(editor).toContain("segnaComeScrittoDalDealer(");
    expect(editor).toContain("origine_dati: provenienzaAggiornata");
  });

  it("i campi protetti si prendono da quello che il modulo scrive, non da un elenco a parte", () => {
    // Un elenco a parte si dimentica di aggiornare: un campo aggiunto al
    // modulo domani resterebbe sovrascrivibile senza che nessuno se ne accorga.
    // Dal 18/09/2026 l'elenco si ricava lo stesso dal payload, ma passando da
    // `campiDavveroCambiati`, che toglie i campi non toccati: prima era
    // `Object.keys(vehiclePayload).filter(...)` e segnava tutto.
    expect(editor).toContain("campiDavveroCambiati(rigaInArchivio, vehiclePayload,");
    expect(editor, "la scheda non sa piu' com'era prima delle modifiche").toContain("setRigaInArchivio(");
  });

  it("segna solo i campi che il concessionario ha davvero cambiato", () => {
    // Il difetto, visto il 18/09/2026 mentre si disegnava la fetta che mostra
    // la provenienza: aprire un'auto importata e premere Salva senza toccare
    // niente segnava **venticinque** campi come "scritto da te" -- su numeri
    // letti dal sito -- e con loro cancellava disaccordi e conferme.
    expect(editor, "il salvataggio segna ancora tutti i campi del modulo").not.toMatch(
      /segnaComeScrittoDalDealer\(\s*origineDati,\s*Object\.keys\(vehiclePayload\)/,
    );
  });

  it("stato e pubblicazione restano fuori", () => {
    // Non arrivano dal sito, e il tetto del piano li muove da se': segnarli
    // come "del concessionario" impedirebbe alla regola del tetto di lavorare.
    expect(editor).toContain('["dealer_id", "status", "published"]');
  });
});
