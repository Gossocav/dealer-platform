import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIORNI_VALIDITA_PASSWORD,
  LUNGHEZZA_MASSIMA_PASSWORD,
  REGOLE_PASSWORD,
  generaPasswordProvvisoria,
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
 * Il difetto che questo blocco impedisce, ed e' costato dodici giorni.
 *
 * Quando la piattaforma crea l'account di una concessionaria ne inventa una
 * password provvisoria: non la conosce nessuno, non viene mai spedita, e il
 * concessionario ne sceglie subito una sua dal link dell'email. Ma il server
 * le regole le applica a tutte, e quella password fino al 14/09/2026 era
 * scritta a mano dentro la procedura di attivazione, lontana dalle regole.
 *
 * Il 02/09/2026 alle 18:38 e' diventata di 91 byte. **Da quel minuto nessuna
 * attivazione e' piu' riuscita**: bcrypt si ferma a 72 byte e Supabase, invece
 * di dire "troppo lunga", risponde `500 Internal Server Error`. La procedura
 * moriva li', lasciando la concessionaria a meta' -- creata ma senza utente,
 * senza profilo e senza abbonamento -- e ogni nuovo tentativo ricadeva nello
 * stesso punto. Misurato sul server vero il 14/09/2026: a 91 byte 500, a 40
 * byte l'utente nasce. L'ultima attivazione riuscita, Ponginibbi, e' delle
 * 14:55 dello stesso 2 settembre.
 *
 * Il test che c'era leggeva il **testo** di quella riga e ricostruiva la
 * password per provarla: ha continuato a passare per tutti i dodici giorni,
 * perche' il limite di lunghezza allora non era scritto da nessuna parte.
 */
describe("la password provvisoria dell'attivazione", () => {
  it("rispetta tutte le regole della piattaforma", () => {
    for (let tentativo = 0; tentativo < 50; tentativo += 1) {
      const provvisoria = generaPasswordProvvisoria();
      expect(passwordAccettabile(provvisoria), `rifiutata: ${provvisoria}`).toBe(true);
    }
  });

  // Il byte, non il carattere: e' in byte che bcrypt taglia, ed e' in byte che
  // si misurava la password da 91 che ha fermato tutto.
  it("sta dentro il limite oltre il quale il server risponde 500", () => {
    const byte = new TextEncoder().encode(generaPasswordProvvisoria()).length;

    expect(byte).toBeLessThanOrEqual(LUNGHEZZA_MASSIMA_PASSWORD);
    expect(LUNGHEZZA_MASSIMA_PASSWORD).toBe(72);
  });

  it("non e' mai due volte la stessa", () => {
    const generate = new Set(Array.from({ length: 100 }, () => generaPasswordProvvisoria()));

    expect(generate.size).toBe(100);
  });

  /**
   * E questo e' il pezzo che mancava. Le prove qui sopra dicono che la
   * funzione fa il suo lavoro; non dicono che l'attivazione la chiami. Se
   * qualcuno tornasse a comporre la password a mano dentro l'endpoint, tutto
   * il resto di questo file continuerebbe a passare -- come ha fatto per
   * dodici giorni.
   */
  it("e' quella che l'attivazione usa davvero", () => {
    const attivazione = leggi("src/app/api/admin/demo-requests/route.ts");

    expect(attivazione).toContain('import { generaPasswordProvvisoria } from "@/lib/password-rules"');
    expect(attivazione).toContain("const generatedPassword = generaPasswordProvvisoria();");
    // Nessuna password composta sul posto: era esattamente cosi' che si
    // scriveva quella da 91 byte.
    expect(attivazione).not.toMatch(/const generatedPassword = `/);
  });
});

/**
 * Il limite vale anche per chi la password la sceglie di persona.
 *
 * Senza questa regola la pagina di scelta password mostrerebbe tutte le
 * spunte verdi a chi incolla una frase lunga, e il salvataggio fallirebbe
 * comunque con lo stesso `500` in inglese. E' la trappola che questo file
 * dichiara di voler evitare fin dalla prima riga.
 */
describe("una password troppo lunga si ferma qui, non sul server", () => {
  it("settantadue byte passano, settantatre no", () => {
    const riempi = (quanti: number) => `Aa1!${"b".repeat(quanti - 4)}`;

    expect(passwordAccettabile(riempi(LUNGHEZZA_MASSIMA_PASSWORD))).toBe(true);
    expect(passwordAccettabile(riempi(LUNGHEZZA_MASSIMA_PASSWORD + 1))).toBe(false);
  });

  // Una lettera accentata occupa due byte: quello che conta e' quanto pesa,
  // non quanto e' lunga a vedersi.
  it("si misura quanto pesa, non quanti caratteri si vedono", () => {
    const accentata = `Aa1!${"\u00e8".repeat(40)}`;

    expect(accentata.length).toBeLessThanOrEqual(LUNGHEZZA_MASSIMA_PASSWORD);
    expect(new TextEncoder().encode(accentata).length).toBeGreaterThan(LUNGHEZZA_MASSIMA_PASSWORD);
    expect(passwordAccettabile(accentata)).toBe(false);
  });

  // La riga che il concessionario legge deve dire tutte e due le cose: una
  // riga rossa che ripete solo "almeno 8 caratteri" a chi ne ha scritti cento
  // non spiega niente.
  it("la riga a schermo dichiara anche il massimo", () => {
    const regola = REGOLE_PASSWORD.find((r) => r.chiave === "lunghezza");

    expect(regola?.etichetta).toContain("8");
    expect(regola?.etichetta).toContain(String(LUNGHEZZA_MASSIMA_PASSWORD));
  });
});

/**
 * La scadenza dei tre mesi, chiesta dal titolare il 02/09/2026.
 */
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
