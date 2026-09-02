import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTA_ATTIVAZIONE_DIRETTA, eAttivazioneDiretta } from "@/lib/attivazione-diretta";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const endpoint = leggi("src/app/api/admin/dealers/attivazione-diretta/route.ts");
const pagina = leggi("src/app/admin/attivazione-diretta/page.tsx");
const attivazione = leggi("src/app/api/admin/demo-requests/route.ts");

/**
 * Attivare una concessionaria direttamente su un piano a pagamento.
 *
 * Fino al 01/09/2026 l'unica strada era fargli aprire una richiesta di prova
 * per convertirla un minuto dopo: una finzione da recitare, e sette giorni di
 * scadenza da spegnere subito. Serviva il giorno che un concessionario dice
 * "ho visto, attivami il Pro".
 */
describe("l'attivazione diretta riusa la macchina che esiste", () => {
  // Il difetto che questo test impedisce: riscrivere qui le duecento righe
  // dell'attivazione. Due strade che fanno la stessa cosa si comportano in
  // modo diverso col tempo, e la seconda e' sempre la meno provata.
  it("il pannello chiama le due azioni gia' in produzione, non ne crea di nuove", () => {
    expect(pagina).toContain('action: "activate_demo"');
    expect(pagina).toContain('action: "convert_demo"');
    expect(pagina).toContain('fetch("/api/admin/demo-requests"');
  });

  it("l'endpoint nuovo crea soltanto la richiesta, il pezzo che mancava", () => {
    expect(endpoint).toContain('.from("demo_requests")');
    expect(endpoint).not.toContain("auth.admin.createUser");
    expect(endpoint).not.toContain("finalize_demo_activation");
  });

  it("la richiesta nasce segnata come diretta, cosi' si distingue dalle altre", () => {
    expect(endpoint).toContain("NOTA_ATTIVAZIONE_DIRETTA");
    expect(NOTA_ATTIVAZIONE_DIRETTA).toContain("Attivazione diretta dal pannello amministrativo");
  });

  it("il piano scelto viaggia fino alla conversione", () => {
    expect(endpoint).toContain("normalizeDemoPlanCode(corpo.planCode)");
    expect(pagina).toContain("planCode: modulo.planCode");
  });
});

describe("chi puo' usarla", () => {
  it("solo un amministratore della piattaforma", () => {
    expect(endpoint).toContain("isPlatformAdminRole");
    expect(endpoint).toContain('status: 403');
  });

  it("senza sessione non si entra", () => {
    expect(endpoint).toContain('{ error: "Sessione non valida." }, { status: 401 }');
  });
});

/**
 * L'ordine che questo progetto usa in ogni endpoint: normalizza, valida
 * (400), variabili d'ambiente (500), scrittura principale, errore stabile.
 */
describe("i dati si controllano prima di scrivere", () => {
  it("i campi che l'attivazione usa sono tutti obbligatori", () => {
    for (const campo of ["dealershipName", "contactName", "email", "phone", "city", "province"]) {
      expect(endpoint, `${campo} non e' controllato`).toContain(campo);
    }
    expect(endpoint).toContain("Mancano questi dati");
  });

  it("un'email storta si ferma qui, non dopo aver creato mezzo account", () => {
    expect(endpoint).toContain("L'indirizzo email non e valido.");
  });

  // Riattivare da qui un account che sta gia' pagando lo riporterebbe a una
  // prova, e con esso il piano in vigore.
  it("un account gia' esistente non si tocca", () => {
    expect(endpoint).toContain('.from("dealers")');
    expect(endpoint).toContain("Esiste gia un account con questa email");
    expect(endpoint).toContain("status: 409");
  });

  it("senza un piano valido non si attiva niente", () => {
    expect(endpoint).toContain("Scegli un piano fra Base, Pro ed Elite.");
  });
});

/**
 * Lo schema di produzione e' andato alla deriva rispetto alle migration piu'
 * di una volta: una colonna accessoria che non esiste non deve far fallire
 * l'attivazione di una concessionaria.
 */
describe("una colonna mancante non fa cadere l'attivazione", () => {
  it("si toglie la colonna e si riprova", () => {
    expect(endpoint).toContain("nomeDellaColonnaMancante(esito.error.message)");
    expect(endpoint).toContain("delete corrente[nome]");
  });

  /**
   * Il difetto trovato in revisione il 02/09/2026: il nome della colonna si
   * cercava qui, a mano, in un messaggio che il database vero non manda quasi
   * mai -- PostgREST ne usa un altro. Il ripiego non e' mai entrato in
   * funzione. Le due forme le riconosce ora un solo posto, provato per
   * davvero in `tabella-mancante.test.ts`.
   */
  it("i due messaggi possibili li riconosce l'aggancio comune, non una regola scritta qui", () => {
    expect(endpoint).toContain('from "@/lib/tabella-mancante"');
    expect(endpoint, "il messaggio di Postgres e' di nuovo cercato a mano qui").not.toContain("does not exist");
  });
});

/**
 * Il difetto che questo test impedisce: dire "errore" dopo aver creato
 * l'account. Il titolare ricreerebbe la concessionaria e si ritroverebbe due
 * account con la stessa email.
 */
describe("se il piano non si applica, la pagina dice cosa e' rimasto in piedi", () => {
  it("dichiara che l'account esiste ed e' operativo", () => {
    expect(pagina).toContain("La concessionaria e stata creata e ha gia ricevuto l'email di accesso");
  });

  it("indica dove finire il lavoro", () => {
    expect(pagina).toContain('href="/admin/demo-requests"');
    expect(pagina).toContain("Converti");
  });
});

describe("si trova nel pannello", () => {
  it("la voce sta accanto alle richieste demo", () => {
    const menu = leggi("src/components/layout/admin-shell.tsx");
    expect(menu).toContain('{ href: "/admin/attivazione-diretta", label: "Attivazione diretta" }');
  });

  it("i piani e i prezzi vengono dal catalogo, non riscritti qui", () => {
    expect(pagina).toContain("DEMO_PLAN_CATALOG.map");
    expect(pagina).toContain("formattaPrezzoPiano(piano)");
    expect(pagina).not.toMatch(/€\s*\d+/);
  });
});

/**
 * Il difetto trovato in revisione: un clic creava l'account **e mandava
 * l'email**, senza nessuna conferma. Un'email non si richiama indietro, e un
 * indirizzo sbagliato manda le credenziali a un estraneo.
 */
describe("prima di creare un account si chiede conferma", () => {
  it("il primo pulsante non attiva niente: apre la conferma", () => {
    expect(pagina).toContain("onClick={() => setConferma(true)}");
  });

  it("solo il secondo fa partire l'attivazione", () => {
    const riquadro = pagina.slice(pagina.indexOf("{conferma ? ("), pagina.indexOf("Torna a correggere"));
    expect(riquadro).toContain("onClick={() => void attiva()}");
    expect(riquadro).toContain("Conferma e attiva");
  });

  // Le due cose che dopo non si correggono: dove va l'email, e quale piano.
  it("la conferma rilegge l'indirizzo e il piano", () => {
    const riquadro = pagina.slice(pagina.indexOf("{conferma ? ("), pagina.indexOf("Torna a correggere"));
    expect(riquadro).toContain("modulo.email");
    expect(riquadro).toContain("modulo.planCode");
    expect(riquadro).toContain("Non si puo&apos; richiamare");
  });

  it("si puo' tornare indietro a correggere", () => {
    expect(pagina).toContain("onClick={() => setConferma(false)}");
  });

  // Cambiare un dato dopo aver aperto la conferma la annulla: quella che si
  // stava per dare riguardava un'email che adesso e' un'altra.
  it("modificare un campo annulla la conferma in sospeso", () => {
    const aggiorna = pagina.slice(pagina.indexOf("const aggiorna ="), pagina.indexOf("const attiva ="));
    expect(aggiorna).toContain("setConferma(false)");
  });
});

/**
 * Il difetto trovato in revisione il 02/09/2026: era l'unica pagina sotto
 * `/admin` senza controllo del ruolo, e non esiste un layout che lo faccia al
 * posto suo. I dati non uscivano -- l'endpoint risponde 403 comunque -- ma un
 * concessionario che digitava l'indirizzo si trovava davanti il modulo e il
 * listino dei piani.
 */
describe("la pagina si apre solo a un amministratore", () => {
  it("controlla il ruolo come tutte le altre schermate del pannello", () => {
    expect(pagina).toContain("isPlatformAdminRole");
    expect(pagina).toContain("resolveUserRoleFromMetadata");
  });

  it("e a chi non lo e' non mostra il modulo, ma il rifiuto", () => {
    expect(pagina).toContain('Questa sezione e riservata agli account amministrativi.');
    expect(pagina.indexOf('accesso === "negato"')).toBeLessThan(pagina.indexOf("Nome della concessionaria"));
  });

  // Ogni pagina di /admin fa il suo controllo: se un giorno nascesse un
  // layout comune, questo test non varrebbe piu' e andrebbe riscritto li'.
  it("nessuna pagina del pannello e' rimasta senza", () => {
    const pagine = [
      "src/app/admin/attivazione-diretta/page.tsx",
      "src/app/admin/dealer-approval/page.tsx",
      "src/app/admin/dealers/page.tsx",
      "src/app/admin/demo-requests/page.tsx",
      "src/app/admin/info-requests/page.tsx",
      "src/app/admin/users/page.tsx",
      "src/app/admin/page.tsx",
    ];

    for (const percorso of pagine) {
      expect(leggi(percorso), `${percorso} non controlla il ruolo`).toContain("isPlatformAdminRole");
    }
  });
});

/**
 * Il difetto trovato in revisione il 02/09/2026: il pulsante si disabilita
 * solo al disegno successivo, e fra il clic e la lettura della sessione resta
 * premibile. Due clic rapidi facevano partire due catene complete: due
 * concessionarie con la stessa email, e due email di accesso gia' spedite --
 * cioe' proprio l'esito che il riquadro di conferma dice di voler evitare.
 */
describe("un doppio clic non crea due concessionarie", () => {
  it("la serratura chiude nello stesso istante del clic, prima di ogni attesa", () => {
    expect(pagina).toContain("const inEsecuzione = useRef(false)");

    const avvio = pagina.slice(pagina.indexOf("const attiva = async"), pagina.indexOf("const eseguiAttivazione"));
    expect(avvio).toContain("if (inEsecuzione.current) return;");
    expect(avvio).toContain("inEsecuzione.current = true;");
    // Nessun `await` prima della serratura: e' li' che si infilava il secondo clic.
    expect(avvio.slice(0, avvio.indexOf("inEsecuzione.current = true;"))).not.toContain("await");
    expect(avvio).toContain("inEsecuzione.current = false;");
  });

  /**
   * Se l'attivazione si ferma dopo aver creato la richiesta, ripremere
   * Conferma ne creerebbe una seconda. Il riquadro si chiude e il messaggio
   * dice dove riprendere.
   */
  it("dopo un passo fallito il riquadro di conferma si chiude", () => {
    const corpo = pagina.slice(pagina.indexOf("const eseguiAttivazione"), pagina.indexOf("const inCorso ="));
    for (const pezzo of corpo.split("setPasso(\"fermo\")").slice(1)) {
      expect(pezzo.slice(0, 120), "un fallimento lascia la conferma aperta").toContain("setConferma(false)");
    }
  });
});

/**
 * Il difetto segnalato dal titolare il 02/09/2026, alla prima attivazione
 * diretta vera (Ponginibbi, piano Base): al concessionario sono arrivate
 * **due email nello stesso momento**, prima ancora che avesse impostato la
 * password. La prima raccontava una demo di sette giorni con un tetto di
 * dieci veicoli -- una prova che non ha mai chiesto, e limiti che il piano
 * che paga smentisce -- la seconda diceva che l'account era stato "attivato
 * definitivamente". Deve riceverne una sola: quella per entrare.
 */
describe("chi e' attivato direttamente riceve una sola email", () => {
  it("la richiesta si riconosce dalla nota che le ha scritto dentro il pannello", () => {
    expect(eAttivazioneDiretta(NOTA_ATTIVAZIONE_DIRETTA)).toBe(true);
    expect(eAttivazioneDiretta(`${NOTA_ATTIVAZIONE_DIRETTA} Chiamato il 2 settembre.`)).toBe(true);
  });

  // Una richiesta di prova vera continua a comportarsi come prima: le sue due
  // email raccontano fatti che sono successi davvero.
  it("una richiesta di prova normale non si confonde con una diretta", () => {
    expect(eAttivazioneDiretta("Vorrei provare la piattaforma per due settimane.")).toBe(false);
    expect(eAttivazioneDiretta(null)).toBe(false);
    expect(eAttivazioneDiretta("")).toBe(false);
  });

  /**
   * Il contrassegno si legge dalla richiesta, non da un campo passato dal
   * pannello: se la conversione fallisce e viene ripresa a mano il giorno dopo
   * dalle Richieste demo, deve valere lo stesso.
   */
  it("l'attivazione lo legge dalla richiesta, non da chi preme il pulsante", () => {
    expect(attivazione).toContain("eAttivazioneDiretta(targetRequest.message)");
  });

  it("l'email dell'accesso non gli racconta una prova che non ha chiesto", () => {
    expect(attivazione).toContain('attivazioneDiretta ? "Il tuo account KeyAuto e attivo" : "Demo KeyAuto attivata"');

    // Il testo della demo -- sette giorni, dieci veicoli -- resta solo nel
    // ramo di chi la prova l'ha chiesta davvero.
    const suo = attivazione.slice(attivazione.indexOf("html: attivazioneDiretta"), attivazione.indexOf('<h2 style="margin:0 0 12px;">Demo attivata</h2>'));
    expect(suo).toContain("Imposta la password e accedi");
    expect(suo).not.toContain("7 giorni");
    expect(suo).not.toContain("max 10 veicoli");
  });

  // "Il tuo account e stato attivato definitivamente" arrivava nello stesso
  // minuto dell'email di accesso: due email per un solo fatto.
  it("e la conversione al piano non ne manda una seconda", () => {
    const conversione = attivazione.slice(attivazione.indexOf('kind: "converted"') - 400, attivazione.indexOf('kind: "converted"'));
    expect(conversione).toContain("if (!attivazioneDiretta)");
  });
});
