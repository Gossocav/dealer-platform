import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MILLIMETRI_MINIMI_BATTISTRADA,
  RUOTE,
  SEZIONI_PERIZIA,
  leggiRilievo,
  normalizzaFiltriPerizia,
  perRicercaParziale,
  ricercaInCorso,
  riepilogoPerizia,
  titoloPerizia,
} from "@/lib/scheda-perizia";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * La perizia di una vettura, chiesta dal titolare il 02/09/2026. Serve prima
 * di comprare: l'auto in permuta, o quella che si va a vedere dal privato.
 */
describe("l'elenco delle voci da guardare", () => {
  it("copre tutte le parti dell'auto, non solo la carrozzeria", () => {
    const sezioni = SEZIONI_PERIZIA.map((s) => s.chiave);
    for (const attesa of ["documenti", "carrozzeria", "cristalli", "interni", "meccanica", "elettronica"]) {
      expect(sezioni, `manca la sezione ${attesa}`).toContain(attesa);
    }
  });

  // Una chiave ripetuta farebbe scrivere due voci nello stesso posto, e la
  // seconda cancellerebbe la prima senza che nessuno se ne accorga.
  it("nessuna voce ha la stessa chiave di un'altra, dentro la sua sezione", () => {
    for (const sezione of SEZIONI_PERIZIA) {
      const chiavi = sezione.voci.map((v) => v.chiave);
      expect(new Set(chiavi).size, `chiavi ripetute in ${sezione.chiave}`).toBe(chiavi.length);
    }
  });

  // Ogni sezione deve avere almeno uno stato che segnala un problema:
  // altrimenti non potrebbe mai finire nell'elenco delle cose da sistemare, e
  // il preventivo di rimessa a nuovo nascerebbe dal nulla.
  it("ogni sezione sa dire che qualcosa non va", () => {
    for (const sezione of SEZIONI_PERIZIA) {
      expect(sezione.stati.some((stato) => stato.daSistemare), `${sezione.chiave} non ha stati problematici`).toBe(true);
    }
  });

  it("le quattro ruote ci sono tutte", () => {
    expect(RUOTE.map((r) => r.chiave)).toEqual(["ant_sx", "ant_dx", "post_sx", "post_dx"]);
  });
});

/**
 * Il difetto che questi test impediscono: far sembrare finita una perizia
 * lasciata a meta'. Una voce non compilata **non e' "a posto"** -- e' una voce
 * che il perito non ha guardato, e la differenza e' tutto il senso della
 * scheda.
 */
describe("cosa e' stato guardato e cosa no", () => {
  it("una perizia vuota non ha nessuna voce compilata", () => {
    const riepilogo = riepilogoPerizia({});
    expect(riepilogo.vociCompilate).toBe(0);
    expect(riepilogo.daSistemare).toEqual([]);
    expect(riepilogo.vociTotali).toBeGreaterThan(40);
  });

  it("conta solo le voci a cui e' stato dato uno stato", () => {
    const riepilogo = riepilogoPerizia({
      sezioni: {
        carrozzeria: {
          cofano: { stato: "integro" },
          tetto: { stato: "graffi", nota: "lato guida" },
          // una nota senza stato non conta: il perito ha scritto, non deciso
          portellone: { nota: "da riguardare" },
        },
      },
    });

    expect(riepilogo.vociCompilate).toBe(2);
    expect(riepilogo.daSistemare).toHaveLength(1);
    expect(riepilogo.daSistemare[0]).toMatchObject({ voce: "Tetto", stato: "Graffi", nota: "lato guida" });
  });

  /**
   * Il battistrada sotto la soglia entra nello stesso elenco dei difetti, e
   * non resta un numero in fondo alla pagina: e' un costo dell'acquisto, ed e'
   * la voce che il preventivo dimentica piu' spesso.
   */
  it("un pneumatico consumato e' un difetto come gli altri", () => {
    const riepilogo = riepilogoPerizia({
      ruote: {
        ant_sx: { mm: MILLIMETRI_MINIMI_BATTISTRADA - 1 },
        ant_dx: { mm: MILLIMETRI_MINIMI_BATTISTRADA + 2 },
      },
    });

    expect(riepilogo.daSistemare).toHaveLength(1);
    expect(riepilogo.daSistemare[0].voce).toBe("Anteriore sinistra");
  });

  // Una gomma non misurata non e' una gomma buona.
  it("una ruota senza millimetri non viene giudicata", () => {
    expect(riepilogoPerizia({ ruote: { ant_sx: { marca: "Michelin" } } }).daSistemare).toEqual([]);
  });
});

/**
 * Quello che torna dal database e' un documento libero: una perizia salvata
 * mesi fa puo' avere voci che non esistono piu'. Si legge quello che c'e' e si
 * ignora il resto, invece di rompersi davanti al concessionario.
 */
describe("una perizia vecchia o storta si legge lo stesso", () => {
  it("un documento vuoto o sbagliato non fa danni", () => {
    expect(leggiRilievo(null)).toEqual({});
    expect(leggiRilievo("non un oggetto")).toEqual({});
    expect(leggiRilievo(42)).toEqual({});
  });

  it("le voci che non esistono piu' si ignorano senza perdere le altre", () => {
    const letto = leggiRilievo({
      sezioni: {
        carrozzeria: { cofano: { stato: "integro" }, voce_sparita: { stato: "chissa" } },
        sezione_sparita: { qualcosa: { stato: "boh" } },
      },
      ruote: { ant_sx: { mm: "non un numero" } },
    });

    expect(letto.sezioni?.carrozzeria?.cofano?.stato).toBe("integro");
    // il riepilogo guarda solo le voci dell'elenco di oggi
    expect(riepilogoPerizia(letto).vociCompilate).toBe(1);
    expect(letto.ruote?.ant_sx?.mm).toBeNull();
  });
});

describe("come si chiama una perizia nell'elenco", () => {
  it("marca, modello e targa quando ci sono", () => {
    expect(titoloPerizia({ brand: "Fiat", model: "Panda", plate: "ab123cd" })).toBe("Fiat Panda — AB123CD");
  });

  // Una perizia si apre vuota, con l'auto davanti: deve avere un nome anche
  // prima che qualcuno abbia scritto qualcosa.
  it("un nome ce l'ha anche appena aperta", () => {
    expect(titoloPerizia({})).toBe("Perizia senza vettura");
    expect(titoloPerizia({ plate: "XY999ZW" })).toBe("XY999ZW");
  });
});

/**
 * **Questi ultimi leggono il testo dei file: dicono che la regola e' scritta,
 * non che il database la applichi.** La prova vera e' stata fatta a mano su un
 * Postgres 15 in Docker, ricostruendo i ruoli di Supabase: il Pro scrive e
 * rilegge, il Base viene rifiutato dalla politica, una concessionaria non vede
 * le perizie dell'altra, dichiarare la concessionaria di un altro viene
 * rifiutato, agganciare il veicolo di un altro viene rifiutato, il pubblico
 * del sito non ha nemmeno il permesso sulla tabella, e le perizie scritte
 * quando il piano era Base ricompaiono intatte il giorno che passa al Pro.
 */
describe("il database chiude la porta, non solo la schermata", () => {
  const migration = leggi("supabase/migrations/20260902110000_perizia_veicolo.sql");

  it("la protezione per riga e' accesa e obbligatoria", () => {
    expect(migration).toContain("alter table public.vehicle_appraisals enable row level security");
    expect(migration).toContain("alter table public.vehicle_appraisals force row level security");
  });

  it("ogni politica poggia su current_dealer_id, e in piu' chiede il piano", () => {
    const politiche = migration.split("create policy").slice(1);
    expect(politiche.length, "mancano delle politiche").toBe(4);

    for (const politica of politiche) {
      expect(politica).toContain("dealer_id = public.current_dealer_id()");
      expect(politica).toContain("public.current_dealer_has_perizie()");
    }
  });

  /**
   * Il difetto che questo test impedisce, e che questa migration nella sua
   * prima stesura commetteva davvero: chiedere il piano **di qualcun altro**.
   *
   * Il 01/09/2026 il progetto ha gia' pagato questo errore con il conto
   * economico (20260901040000): la funzione che accettava un identificativo
   * era eseguibile da chiunque avesse fatto login, per qualunque
   * concessionaria, e una Base ha chiesto il piano di un'altra ottenendo
   * "elite". Gli identificativi delle concessionarie sono pubblici -- il
   * marketplace li legge -- quindi bastava una sessione per farsi il listino
   * dei concorrenti. Provato su un Postgres vero il 03/09/2026: prima della
   * correzione rispondeva "true" sull'altra concessionaria, dopo la funzione
   * con l'identificativo non esiste piu'.
   */
  it("la funzione che apre la porta non risponde su nessun altro", () => {
    expect(migration).toContain("create or replace function public.current_dealer_has_perizie()");
    expect(migration).toContain("public.dealer_plan_in_force(public.current_dealer_id())");

    // Nessuna funzione che accetti un identificativo e sia concessa a chi ha
    // solo una sessione: e' esattamente la forma del difetto.
    expect(migration).not.toMatch(/function public\.dealer_has_perizie\s*\(/);
    expect(migration).not.toMatch(/grant execute on function public\.dealer_plan_in_force[^;]*authenticated/);
  });

  // Le perizie contengono nome e telefono di un privato: la tabella non deve
  // essere raggiungibile con la chiave pubblica del sito.
  it("il pubblico non ha nessun permesso sulla tabella", () => {
    expect(migration).toContain("revoke all on public.vehicle_appraisals from anon");
    expect(migration).not.toMatch(/grant[^;]*to anon/);
  });

  // Chi scrive non deve poter attribuire una perizia a un'altra
  // concessionaria, nemmeno per sbaglio.
  it("la concessionaria la mette il database, e rifiuta chi ne dichiara un'altra", () => {
    expect(migration).toContain("enforce_vehicle_appraisal_dealer_id");
    expect(migration).toContain("La perizia non appartiene alla concessionaria collegata");
    expect(migration).toContain("Il veicolo agganciato non e'' di questa concessionaria");
  });
});

/**
 * Il difetto che questi test impediscono: promettere "si ristampa" e mandare
 * alla stampante il modulo con le pastiglie da premere. Su carta si legge solo
 * quello che il perito ha deciso -- cinque pastiglie per riga, quattro delle
 * quali non scelte, renderebbero il foglio illeggibile.
 */
describe("quello che esce dalla stampante non e' il modulo", () => {
  const pagina = leggi("src/components/perizie/perizia-page.tsx");
  const guscio = leggi("src/components/layout/dealer-dashboard-shell.tsx");

  it("il modulo sparisce e compare il foglio", () => {
    expect(pagina).toContain('<div className="print:hidden">');
    expect(pagina).toContain('className="vehicle-sheet hidden bg-white text-slate-900 print:block"');
  });

  it("il foglio usa l'impaginazione A4 che esiste gia'", () => {
    // `.vehicle-sheet` porta con se' 210x297mm e i margini, definiti una volta
    // sola in globals.css: riscriverli qui vorrebbe dire due fogli diversi.
    expect(leggi("src/app/globals.css")).toContain(".vehicle-sheet {");
    expect(pagina).toContain("sheet-block");
  });

  it("il foglio porta le firme, perche' e' un documento che si mostra a chi vende", () => {
    expect(pagina).toContain("Firma del perito");
    expect(pagina).toContain("Firma di chi vende");
  });

  // Il menu e la barra in cima sono comandi: su carta mangerebbero mezzo
  // foglio a ogni stampa, di ogni pagina del gestionale.
  it("il menu e la barra restano fuori dalla carta", () => {
    const chrome = guscio.slice(guscio.indexOf("<DealerSidebar"), guscio.indexOf("</main>"));
    expect(guscio).toContain('<div className="no-print">');
    expect(chrome).toContain("no-print");
  });
});

/**
 * La ricerca fra le perizie, chiesta dal titolare il 03/09/2026: periodo, nome
 * di chi vende, marca e modello.
 */
describe("i filtri della ricerca", () => {
  it("un campo vuoto non diventa un filtro", () => {
    // Uno spazio battuto per sbaglio restringerebbe la ricerca a niente, e chi
    // cerca vedrebbe un elenco vuoto senza capire perche'.
    expect(normalizzaFiltriPerizia({ cliente: "   ", marca: "", modello: null })).toEqual({
      dal: undefined,
      al: undefined,
      cliente: undefined,
      marca: undefined,
      modello: undefined,
    });
  });

  it("gli spazi ai lati si tolgono", () => {
    expect(normalizzaFiltriPerizia({ marca: "  Fiat " }).marca).toBe("Fiat");
  });

  /**
   * Scrivere il "dal" piu' avanti dell'"al" e' un errore di battitura
   * frequente, e la risposta onesta a un intervallo impossibile sarebbe zero
   * risultati. Qui si raddrizza, perche' quello che l'utente intendeva e'
   * evidente.
   */
  it("le date al contrario si raddrizzano invece di non trovare niente", () => {
    const filtri = normalizzaFiltriPerizia({ dal: "2026-09-30", al: "2026-09-01" });
    expect(filtri.dal).toBe("2026-09-01");
    expect(filtri.al).toBe("2026-09-30");
  });

  it("una data sola resta com'e'", () => {
    expect(normalizzaFiltriPerizia({ dal: "2026-09-01" })).toMatchObject({ dal: "2026-09-01", al: undefined });
  });

  it("sa dire se si sta cercando o no", () => {
    expect(ricercaInCorso(normalizzaFiltriPerizia({}))).toBe(false);
    expect(ricercaInCorso(normalizzaFiltriPerizia({ marca: "Fiat" }))).toBe(true);
  });

  /**
   * Il difetto che questo test impedisce: chi scrive "%" nel campo modello
   * cercherebbe qualunque cosa, e "_" qualunque carattere singolo. Sono i
   * caratteri jolly di Postgres, e nessuno se li aspetta scrivendo il nome di
   * un'automobile.
   */
  it("i caratteri jolly di chi cerca vengono spenti", () => {
    expect(perRicercaParziale("Panda")).toBe("%Panda%");
    expect(perRicercaParziale("100%")).toBe("%100\\%%");
    expect(perRicercaParziale("A_3")).toBe("%A\\_3%");
  });
});

/**
 * La ricerca deve interrogare il database, non setacciare righe gia'
 * scaricate: ogni perizia si porta dietro il suo rilievo, cioe' la parte piu'
 * pesante, e scaricarle tutte per poi buttarne via il 90% e' proprio quello
 * che una ricerca dovrebbe evitare.
 */
describe("la ricerca si fa nel database", () => {
  const elenco = leggi("src/components/perizie/perizie-list-page.tsx");

  it("i filtri diventano condizioni dell'interrogazione", () => {
    expect(elenco).toContain('interrogazione.gte("appraised_on", filtri.dal)');
    expect(elenco).toContain('interrogazione.lte("appraised_on", filtri.al)');
    expect(elenco).toContain('interrogazione.ilike("owner_name", perRicercaParziale(filtri.cliente))');
    expect(elenco).toContain('interrogazione.ilike("brand", perRicercaParziale(filtri.marca))');
    expect(elenco).toContain('interrogazione.ilike("model", perRicercaParziale(filtri.modello))');
  });

  // La concessionaria si dichiara comunque, anche con i filtri addosso: e' la
  // regola che in questo progetto non si infrange mai.
  it("la concessionaria resta dichiarata anche quando si cerca", () => {
    const lettura = elenco.slice(elenco.indexOf("const elenco = await caricaTutto"), elenco.indexOf("if (elenco.error)"));
    expect(lettura).toContain('.eq("dealer_id", dealerId)');
  });

  /**
   * Il difetto che questo test impedisce: interrogare il database a ogni
   * tasto. Sarebbe una richiesta per lettera, e un elenco che si rimescola
   * sotto le dita mentre si scrive.
   */
  it("si cerca quando si preme Cerca, non mentre si scrive", () => {
    expect(elenco).toContain("const [modulo, setModulo] = useState<ModuloRicerca>(MODULO_VUOTO)");
    expect(elenco).toContain("const [filtri, setFiltri] = useState<FiltriPerizia>({})");
    expect(elenco).toContain("setFiltri(normalizzaFiltriPerizia(modulo))");
    expect(elenco).toContain("}, [filtri]);");
  });

  /**
   * Chi ha appena cercato non deve leggere "non hai ancora fatto perizie": ne
   * ha fatte, e quella frase gli farebbe temere di averle perse.
   */
  it("l'elenco vuoto dice se e' la ricerca a non trovare niente", () => {
    expect(elenco).toContain("Nessuna perizia con questi filtri");
    expect(elenco).toContain("Nessuna perizia, per ora");
    expect(elenco).toContain("ricercaInCorso(filtri)");
  });

  // Si cerca per un dato che nell'elenco non compariva: chi cerca "Rossi" deve
  // poter vedere che la riga trovata e' davvero di Rossi.
  it("chi vende compare anche nella colonna", () => {
    expect(elenco).toContain('<th className="py-3 pr-4 font-semibold">Chi vende</th>');
    expect(elenco).toContain("perizia.owner_name?.trim()");
  });
});
