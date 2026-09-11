import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  candidataAllaVetrina,
  messaggioDelTetto,
  messaggioPostiFiniti,
  pianoDelTetto,
  STATO_OLTRE_IL_TETTO,
  type RigaPerIlTetto,
} from "@/lib/tetto-del-piano";

/**
 * La regola del tetto, decisa il 10/09/2026 sul caso Ponginibbi: piano Base
 * da 50 auto, 81 sul sito. Fino ad allora il tetto lo imponeva solo il
 * database rifiutando la prima auto di troppo: quali cinquanta entrassero lo
 * decideva l'ordine dell'indice del sito (17 km 0 dentro, 31 usate fuori), e
 * le altre non entravano affatto.
 */

let contatore = 0;
const riga = (over: Omit<Partial<RigaPerIlTetto>, "vehicle_condition"> & { vehicle_condition: string }): RigaPerIlTetto => ({
  id: over.id ?? `v${String(++contatore).padStart(3, "0")}`,
  status: "published",
  published: true,
  created_at: "2026-09-01T10:00:00Z",
  import_source: "www.sito.it",
  import_missing_since: null,
  ...over,
});
type Sovrascritture = Omit<Partial<RigaPerIlTetto>, "vehicle_condition">;
const pubblicata = (condizione: string, over: Sovrascritture = {}) => riga({ vehicle_condition: condizione, ...over });
const oltreIlTetto = (condizione: string, over: Sovrascritture = {}) =>
  riga({ vehicle_condition: condizione, status: STATO_OLTRE_IL_TETTO, published: false, ...over });

describe("chi sta in vetrina", () => {
  it("con piu' auto del piano, in vetrina ce ne sono esattamente quante ne consente, e le usate vengono prima", () => {
    const righe = [
      ...Array.from({ length: 30 }, () => oltreIlTetto("Usato")),
      ...Array.from({ length: 20 }, () => pubblicata("Km/0")),
      ...Array.from({ length: 10 }, () => pubblicata("Nuovo")),
      ...Array.from({ length: 34 }, () => pubblicata("Usato")),
    ];

    const piano = pianoDelTetto(righe, 50);

    expect(piano.inVetrina).toHaveLength(50);
    const perId = new Map(righe.map((r) => [r.id, r]));
    const condizioni = piano.inVetrina.map((id) => perId.get(id)!.vehicle_condition);
    expect(condizioni.filter((c) => c === "Usato")).toHaveLength(50);
    // Le 30 usate messe da parte salgono; 20 km 0 e 10 nuove scendono; 14 usate restano fuori.
    expect(piano.daPubblicare).toHaveLength(16);
    expect(piano.daTogliere).toHaveLength(30);
    expect(piano.escluse).toHaveLength(44);
  });

  it("a parita' di tipo restano prima quelle gia' pubblicate: la scelta non cambia fra due sincronizzazioni", () => {
    const righe = [
      pubblicata("Usato", { id: "vecchia-pubblicata", created_at: "2026-08-01T00:00:00Z" }),
      oltreIlTetto("Usato", { id: "nuova-da-parte", created_at: "2026-09-10T00:00:00Z" }),
    ];

    const prima = pianoDelTetto(righe, 1);
    expect(prima.inVetrina).toEqual(["vecchia-pubblicata"]);
    expect(prima.daPubblicare).toEqual([]);
    expect(prima.daTogliere).toEqual([]);

    // Seconda sincronizzazione, stesso archivio: stessa risposta, niente si muove.
    const seconda = pianoDelTetto(righe, 1);
    expect(seconda).toEqual(prima);
  });

  it("fra le non ancora pubblicate, vincono le piu' recenti", () => {
    const righe = [
      oltreIlTetto("Usato", { id: "di-agosto", created_at: "2026-08-01T00:00:00Z" }),
      oltreIlTetto("Usato", { id: "di-settembre", created_at: "2026-09-09T00:00:00Z" }),
    ];
    expect(pianoDelTetto(righe, 1).inVetrina).toEqual(["di-settembre"]);
  });

  it("quando un'auto sparisce dal sito, il posto va alla prossima in ordine di priorita'", () => {
    const righe = [
      pubblicata("Usato", { id: "u1" }),
      pubblicata("Usato", { id: "u2" }),
      oltreIlTetto("Usato", { id: "u3-in-attesa" }),
      oltreIlTetto("Km/0", { id: "k1-in-attesa" }),
    ];
    expect(pianoDelTetto(righe, 2).inVetrina).toEqual(["u1", "u2"]);

    // u1 non e' piu' sul sito: ha la data di sparizione e non concorre.
    const dopo = righe.map((r) => (r.id === "u1" ? { ...r, status: STATO_OLTRE_IL_TETTO, published: false, import_missing_since: "2026-09-10T00:00:00Z" } : r));
    const piano = pianoDelTetto(dopo, 2);
    expect(piano.inVetrina).toEqual(["u2", "u3-in-attesa"]);
    expect(piano.daPubblicare).toEqual(["u3-in-attesa"]);
  });

  it("se il piano scende, escono prima le altre e le usate restano per ultime", () => {
    const righe = [
      pubblicata("Usato", { id: "u1" }),
      pubblicata("Usato", { id: "u2" }),
      pubblicata("Km/0", { id: "k1", created_at: "2026-09-05T00:00:00Z" }),
      pubblicata("Nuovo", { id: "n1", created_at: "2026-09-08T00:00:00Z" }),
      pubblicata("Km/0", { id: "k2", created_at: "2026-09-01T00:00:00Z" }),
    ];
    // Da Pro a Base: solo tre posti.
    const piano = pianoDelTetto(righe, 3);
    expect(piano.inVetrina).toEqual(["u1", "u2", "n1"]);
    expect(piano.daTogliere).toEqual(["k1", "k2"]);
    // Da Base a un solo posto: esce anche una usata, ma solo dopo tutte le altre.
    // n1 e' piu' recente di k1: fra "le altre" vale l'ordine per data.
    expect(pianoDelTetto(righe, 1).daTogliere).toEqual(["u2", "n1", "k1", "k2"]);
  });

  it("il limite vale sul totale, comprese le auto inserite a mano", () => {
    const righe = [
      pubblicata("Nuovo", { id: "a-mano", import_source: null }),
      oltreIlTetto("Usato", { id: "dal-sito" }),
    ];
    const piano = pianoDelTetto(righe, 1);
    expect(piano.inVetrina).toEqual(["dal-sito"]);
    expect(piano.daTogliere).toEqual(["a-mano"]);
  });

  it("una bozza scelta dal concessionario e un'auto sparita dal sito non concorrono", () => {
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Usato", status: "draft", published: false }))).toBe(false);
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Usato", status: STATO_OLTRE_IL_TETTO, published: false, import_missing_since: "2026-09-01T00:00:00Z" }))).toBe(false);
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Usato", status: STATO_OLTRE_IL_TETTO, published: false, import_source: null }))).toBe(false);
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Usato", status: "sold", published: false }))).toBe(false);
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Usato" }))).toBe(true);
    expect(candidataAllaVetrina(riga({ vehicle_condition: "Km/0", status: STATO_OLTRE_IL_TETTO, published: false }))).toBe(true);
  });

  it("senza un limite leggibile non si tocca niente", () => {
    const righe = [pubblicata("Km/0", { id: "k" }), oltreIlTetto("Usato", { id: "u" })];
    const piano = pianoDelTetto(righe, null);
    expect(piano.limite).toBeNull();
    expect(piano.daTogliere).toEqual([]);
    expect(piano.daPubblicare).toEqual([]);
  });
});

describe("il messaggio per il concessionario", () => {
  it("dice quante ne restano fuori e cosa fare, solo quando ce ne sono", () => {
    expect(messaggioDelTetto(50, 31)).toBe(
      "Il tuo piano include 50 auto: 31 auto del tuo sito non sono pubblicate. Passa a un piano superiore per pubblicarle tutte.",
    );
    expect(messaggioDelTetto(50, 1)).toBe(
      "Il tuo piano include 50 auto: 1 auto del tuo sito non e' pubblicata. Passa a un piano superiore per pubblicarle tutte.",
    );
    expect(messaggioDelTetto(50, 0)).toBeNull();
    expect(messaggioDelTetto(null, 10)).toBeNull();
  });
});

/**
 * Il tetto non si supera mai, da nessuna delle dodici porte.
 *
 * Fino al 10/09/2026 il limite lo imponeva **solo** il trigger del database,
 * rifiutando la prima auto di troppo con una frase che parla di "annunci" e
 * non dice cosa fare. Nel gestionale il concessionario ci sbatteva contro a
 * meta' di un'operazione di gruppo; sui percorsi del server, peggio: due di
 * essi scrivono con la chiave di servizio, e li' il trigger non e' nemmeno
 * l'ultima serratura, perche' non scatta.
 */
describe("il posto in vetrina si conta prima, non dopo", () => {
  it("quando i posti sono finiti il messaggio dice le due strade", () => {
    expect(messaggioPostiFiniti(50)).toBe("Il tuo piano include 50 auto: togline una o passa a un piano superiore.");
  });

  it("senza un limite leggibile il messaggio non inventa un numero", () => {
    expect(messaggioPostiFiniti(null)).toBe("Il tuo piano non ha piu' posto per altre auto pubblicate.");
    expect(messaggioPostiFiniti(null)).not.toMatch(/\d/);
  });

  /**
   * Il conto dei posti che i percorsi di importazione tengono a mano mentre
   * scrivono, riprodotto qui: e' la parte che sbagliava in `import-site`, dove
   * veniva scalato solo sugli inserimenti e non sugli aggiornamenti -- e chi
   * reimportava il proprio sito, con le auto gia' in archivio, superava il
   * tetto.
   */
  it("un'auto portata in vetrina occupa un posto, che sia nuova o gia' in archivio", () => {
    let posti = 2;
    const entra = () => {
      const inVetrina = posti > 0;
      if (inVetrina) posti -= 1;
      return inVetrina ? "published" : STATO_OLTRE_IL_TETTO;
    };

    expect(entra()).toBe("published");
    // La seconda e' un aggiornamento di una gia' presente: occupa lo stesso.
    expect(entra()).toBe("published");
    expect(entra()).toBe(STATO_OLTRE_IL_TETTO);
    expect(posti).toBe(0);
  });
});

/**
 * Il tetto si legge con la chiave giusta.
 *
 * Il difetto, mio, dell'11/09/2026: `import-feed` chiedeva il limite del piano
 * con la sessione dell'utente. Ma `resolve_dealer_listing_cap` e' riservata
 * alla chiave di servizio dal 05/09, quindi rispondeva "permesso negato" --
 * e siccome `limiteDelPiano` ignora l'errore e restituisce `null`, il limite
 * risultava "non leggibile" e **la regola del tetto non si applicava mai** su
 * quel percorso. Non si vedeva: il database rifiutava comunque le auto oltre
 * il tetto, quindi il limite non veniva superato -- ma le eccedenti venivano
 * saltate con un errore invece di entrare in attesa di un posto.
 *
 * Verificato su Postgres vero: `set role authenticated; select
 * public.resolve_dealer_listing_cap(...)` risponde "permission denied for
 * function".
 *
 * Questi test leggono il *testo* dei sorgenti: non provano che il codice
 * funzioni, fissano la decisione. Il permesso di esecuzione resta chiuso di
 * proposito (src/lib/funzioni-sql-chiuse.test.ts), quindi l'unica strada e'
 * la chiave di servizio.
 */
describe("il limite del piano si chiede con la chiave di servizio", () => {
  const senzaCommenti = (percorso: string) =>
    readFileSync(resolve(process.cwd(), percorso), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("la pagina Importazione non chiede il limite al database: nel browser non si puo'", () => {
    // Il browser ha solo la chiave pubblica e la sessione dell'utente, e
    // `resolve_dealer_listing_cap` non e' eseguibile da li'. Il limite arriva
    // dal server, con `usePianoInVigore()`. Aprire quella funzione ad
    // `authenticated` non e' un rimedio: accetta un dealer_id qualsiasi,
    // quindi chiunque avesse una sessione potrebbe leggere il piano di
    // un'altra concessionaria.
    const pagina = senzaCommenti("src/components/vehicles/vehicles-import-page.tsx");
    expect(pagina, "il browser chiede il limite al database").not.toContain("limiteDelPiano");
    expect(pagina, "il limite deve arrivare dal server").toContain("usePianoInVigore");
  });

  for (const rotta of ["src/app/api/vehicles/import-feed/route.ts", "src/app/api/vehicles/import-site/route.ts"]) {
    it(`${rotta.split("/").slice(-2)[0]}: legge il tetto con la chiave di servizio, non con quella dell'utente`, () => {
      const testo = senzaCommenti(rotta);

      // Il client della chiave di servizio esiste e si chiama cosi' in tutte e due.
      expect(testo, "manca il client con la chiave di servizio").toContain("supabaseTetto");

      // E le due funzioni che toccano il tetto ricevono quello, non `supabase`.
      expect(testo, "il limite viene chiesto con la sessione dell'utente").not.toMatch(/limiteDelPiano\(\s*supabase\s*,/);
      expect(testo, "il tetto viene applicato con la sessione dell'utente").not.toMatch(/applicaTettoDelPiano\(\s*supabase\s*,/);
    });
  }
});
