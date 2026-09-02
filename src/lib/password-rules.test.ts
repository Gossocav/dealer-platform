import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync as leggiFile } from "node:fs";
import {
  GIORNI_VALIDITA_PASSWORD,
  REGOLE_PASSWORD,
  giorniAllaScadenzaPassword,
  passwordAccettabile,
  passwordScaduta,
} from "@/lib/password-rules";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Le regole chieste dal titolare il 02/09/2026: otto caratteri fra lettere e
 * numeri, e almeno un carattere speciale. Prima il carattere speciale non era
 * richiesto da nessuna parte.
 */
describe("che password si puo' scegliere", () => {
  it("una password completa passa", () => {
    expect(passwordAccettabile("Concessionaria1!")).toBe(true);
    expect(passwordAccettabile("Aa1@bcde")).toBe(true);
  });

  it("otto caratteri sono il minimo", () => {
    expect(passwordAccettabile("Aa1@bcd")).toBe(false);
    expect(passwordAccettabile("Aa1@bcde")).toBe(true);
  });

  it("senza carattere speciale non basta piu'", () => {
    // E' esattamente la password che prima del 02/09/2026 sarebbe passata.
    expect(passwordAccettabile("Password1")).toBe(false);
  });

  it("ne' senza maiuscola, minuscola o numero", () => {
    expect(passwordAccettabile("password1!")).toBe(false);
    expect(passwordAccettabile("PASSWORD1!")).toBe(false);
    expect(passwordAccettabile("Passwordd!")).toBe(false);
  });

  /**
   * Uno spazio non vale come carattere speciale: sembrerebbe a posto per
   * sbaglio, e chi ha scritto la password non saprebbe di averlo messo --
   * salvo poi non riuscire piu' a rientrare.
   */
  it("lo spazio non conta come carattere speciale", () => {
    expect(passwordAccettabile("Password 1")).toBe(false);
    expect(passwordAccettabile("Password 1!")).toBe(true);
  });

  /**
   * Il difetto trovato il 02/09/2026, poche ore dopo aver scritto questa
   * regola: contava come speciale qualunque cosa non fosse lettera, cifra o
   * spazio -- il simbolo dell'euro compreso, che era pure fra gli esempi
   * mostrati a schermo. Ma l'elenco dei simboli lo decide Supabase, e l'euro
   * non c'e': la spunta diventava verde e il salvataggio falliva lo stesso,
   * con un messaggio in inglese. I due elenchi devono coincidere.
   */
  it("valgono solo i simboli che accetta anche il server", () => {
    for (const simbolo of "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~") {
      expect(passwordAccettabile(`Password1${simbolo}`), `${simbolo} dovrebbe valere`).toBe(true);
    }

    for (const fuoriElenco of ["\u20ac", "\u00a3", "\u00a7", "\u00b0"]) {
      expect(passwordAccettabile(`Password1${fuoriElenco}`), `${fuoriElenco} non deve valere`).toBe(false);
    }
  });

  // Gli esempi scritti a schermo devono stare dentro l'elenco: suggerirne uno
  // fuori elenco e' il modo piu' diretto per far fallire un salvataggio dopo
  // aver mostrato tutte le spunte verdi.
  it("gli esempi mostrati a schermo sono tutti accettati davvero", () => {
    const regola = REGOLE_PASSWORD.find((r) => r.chiave === "speciale");
    const esempi = (regola?.etichetta.match(/\(([^)]*)\)/)?.[1] ?? "").split(/\s+/).filter(Boolean);

    expect(esempi.length, "l'etichetta non mostra nessun esempio").toBeGreaterThan(2);

    for (const esempio of esempi) {
      expect(passwordAccettabile(`Password1${esempio}`), `l'esempio ${esempio} non e' accettato`).toBe(true);
    }
  });

  // Le lettere accentate sono lettere, non caratteri speciali: contarle
  // aprirebbe la porta a "Perquè123", che di speciale non ha niente.
  it("una lettera accentata resta una lettera", () => {
    expect(passwordAccettabile("Perche123")).toBe(false);
    expect(passwordAccettabile("Perchè123")).toBe(false);
  });

  it("ogni regola ha un'etichetta che si puo' leggere a schermo", () => {
    for (const regola of REGOLE_PASSWORD) {
      expect(regola.etichetta.length, `la regola ${regola.chiave} non si spiega`).toBeGreaterThan(5);
    }
  });
});

/**
 * La scadenza dei tre mesi, chiesta dal titolare il 02/09/2026.
 */
/**
 * Il difetto che questo test impedisce: fermare l'attivazione di una
 * concessionaria per colpa di una password che non usera' nessuno.
 *
 * Quando la piattaforma crea l'account ne inventa una provvisoria -- non la
 * conosce nessuno, non viene mai spedita, e il concessionario ne sceglie
 * subito una sua dal link dell'email. Ma il server le regole le applica a
 * tutte, e un identificativo casuale e' tutto in minuscolo: dal 02/09/2026,
 * con maiuscole e simboli diventati obbligatori su Supabase, una password
 * cosi' verrebbe rifiutata e l'attivazione si fermerebbe prima ancora di
 * creare la concessionaria.
 */
describe("la password provvisoria rispetta le stesse regole", () => {
  it("quella che l'attivazione costruisce sarebbe accettata", () => {
    const attivazione = leggiFile(resolve(process.cwd(), "src/app/api/admin/demo-requests/route.ts"), "utf8");
    const riga = attivazione.slice(attivazione.indexOf("const generatedPassword ="));
    const modello = riga.slice(riga.indexOf("`") + 1, riga.indexOf("`", riga.indexOf("`") + 1));

    // Si ricostruisce quello che il codice produrrebbe davvero, sostituendo i
    // pezzi variabili con un identificativo vero: provare il modello com'e'
    // scritto direbbe soltanto che il testo non e' cambiato.
    const generata = modello
      .replace("${crypto.randomUUID()}", crypto.randomUUID())
      .replace("${crypto.randomUUID().toUpperCase()}", crypto.randomUUID().toUpperCase())
      .replace("${Date.now()}", String(Date.now()));

    expect(generata).not.toContain("${");
    expect(passwordAccettabile(generata), `la password provvisoria non passa: ${generata}`).toBe(true);
  });
});

describe("quando una password va rifatta", () => {
  const ADESSO = new Date("2026-09-02T12:00:00.000Z");
  const giorniFa = (n: number) => new Date(ADESSO.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it("dura tre mesi", () => {
    expect(GIORNI_VALIDITA_PASSWORD).toBe(90);
    expect(passwordScaduta(giorniFa(89), ADESSO)).toBe(false);
    expect(passwordScaduta(giorniFa(90), ADESSO)).toBe(true);
    expect(passwordScaduta(giorniFa(200), ADESSO)).toBe(true);
  });

  it("dice quanti giorni mancano, cosi' si puo' avvisare prima", () => {
    expect(giorniAllaScadenzaPassword(giorniFa(85), ADESSO)).toBe(5);
    expect(giorniAllaScadenzaPassword(giorniFa(0), ADESSO)).toBe(90);
  });

  /**
   * Il difetto che questo test impedisce: buttare fuori dal gestionale tutti
   * gli account che esistevano prima della regola, il giorno in cui entra in
   * vigore. Senza una data non si dichiara scaduto niente; la data la scrive
   * il guscio al primo ingresso, e i tre mesi partono da li'.
   */
  it("un account senza data non e' scaduto: e' solo da timbrare", () => {
    expect(giorniAllaScadenzaPassword(null, ADESSO)).toBeNull();
    expect(passwordScaduta(null, ADESSO)).toBe(false);
    expect(passwordScaduta("non e' una data", ADESSO)).toBe(false);
  });
});

/**
 * La data del cambio password sta in `app_metadata`, che solo il server con la
 * chiave di servizio puo' scrivere. Se stesse nel profilo, o nei metadati
 * dell'utente, il diretto interessato potrebbe spostarsela in avanti da solo:
 * una scadenza che si rimanda da se' non e' una scadenza.
 */
describe("la data del cambio non la puo' scrivere chi la subisce", () => {
  const endpoint = leggi("src/app/api/account/password-aggiornata/route.ts");

  it("si scrive con la chiave di servizio, dentro app_metadata", () => {
    expect(endpoint).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(endpoint).toContain("admin.auth.admin.updateUserById");
    expect(endpoint).toContain("password_changed_at");
    expect(endpoint).not.toContain("user_metadata");
  });

  // Chiamare l'indirizzo a caso non deve far ripartire i tre mesi.
  it("timbra solo se manca la data o se la password e' appena cambiata", () => {
    expect(endpoint).toContain("if (dataEsistente && !cambiataAdesso)");
    expect(endpoint).toContain("FINESTRA_CAMBIO_MS");
  });

  it("senza sessione non fa niente", () => {
    expect(endpoint).toContain('{ error: "Sessione non valida." }, { status: 401 }');
  });
});

/**
 * La scadenza si applica dove il concessionario lavora: il guscio comune del
 * gestionale, l'unico punto da cui passano tutte le sue pagine.
 */
describe("il gestionale si ferma quando la password e' scaduta", () => {
  const guscio = leggi("src/components/layout/dealer-dashboard-shell.tsx");

  it("il contenuto della pagina lascia il posto all'avviso", () => {
    expect(guscio).toContain("giorniAllaScadenzaPassword");
    expect(guscio).toContain("passwordScaduta ? (");
    expect(guscio).toContain("Cambia la password");
    expect(guscio).toContain('href="/reset-password"');
  });

  // Bloccare senza aver avvisato prima e' il modo per farsi telefonare da un
  // concessionario convinto che la piattaforma sia rotta.
  it("e prima che scada lo dice", () => {
    expect(guscio).toContain("passwordInScadenza");
    expect(guscio).toContain("GIORNI_DI_PREAVVISO_PASSWORD");
  });

  /**
   * Il difetto che questo test impedisce: bloccare mentre la risposta e'
   * ancora in volo. Il gestionale sbatterebbe l'avviso in faccia a ogni
   * apertura di pagina, per il decimo di secondo in cui non si sa ancora
   * niente.
   */
  it("finche' non si sa, non si blocca niente", () => {
    expect(guscio).toContain("const [password, setPassword] = useState<ShellPassword>(null)");
    expect(guscio).toContain("password !== null && password.giorniRimasti <= 0");
  });
});
