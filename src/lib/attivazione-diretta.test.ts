import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const endpoint = leggi("src/app/api/admin/dealers/attivazione-diretta/route.ts");
const pagina = leggi("src/app/admin/attivazione-diretta/page.tsx");

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
    expect(endpoint).toContain("Attivazione diretta dal pannello amministrativo");
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
    expect(endpoint).toContain('does not exist');
    expect(endpoint).toContain("delete corrente[nome]");
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
