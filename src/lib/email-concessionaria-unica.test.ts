import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const migration = leggi("supabase/migrations/20260902100000_email_concessionaria_unica.sql");
const impostazioni = leggi("src/app/impostazioni/page.tsx");

/**
 * Il difetto trovato nella verifica del 02/09/2026: l'unicita' dell'email
 * viveva solo nel codice dell'attivazione, ma la stessa colonna la puo'
 * riscrivere il concessionario dalle Impostazioni, nel campo "Email
 * commerciale", dove non controllava niente nessuno. Bastava scriverci
 * l'indirizzo di un'altra concessionaria.
 *
 * Non e' un dettaglio: `dealers.email` e' la chiave con cui l'attivazione
 * decide "questo account esiste gia'". Con due righe uguali l'attivazione
 * diretta si ferma con un errore, e quella da Richieste demo puo' agganciarsi
 * alla concessionaria sbagliata e sovrascriverla.
 *
 * **Questi test leggono il testo del file: dicono che la regola e' scritta,
 * non che il database la applichi.** La prova vera e' stata fatta a mano su un
 * Postgres 15 in Docker, come prescrive il manuale del progetto: inserimento
 * uguale rifiutato, stessa email con maiuscole diverse rifiutata, stessa email
 * con spazi ai lati rifiutata, un concessionario che si riscrive l'indirizzo
 * di un altro rifiutato, due righe senza email accettate, due righe con email
 * vuota accettate.
 */
describe("il database impedisce due concessionarie con la stessa email", () => {
  it("l'indice e' unico e sta su dealers", () => {
    expect(migration).toContain("create unique index if not exists dealers_email_unica_idx");
    expect(migration).toContain("on public.dealers");
  });

  // Una maiuscola non deve bastare ad aggirarlo: "Mario@x.it" e "mario@x.it"
  // sono lo stesso indirizzo per chiunque tranne che per un confronto esatto.
  it("il confronto ignora maiuscole e spazi ai lati", () => {
    expect(migration).toContain("lower(btrim(email))");
  });

  /**
   * Alcune concessionarie non hanno ancora messo l'email. Due caselle vuote
   * non sono un doppione, e un vincolo che le contasse tali impedirebbe di
   * salvare la seconda: Postgres tratta gia' cosi' i NULL, ma non la stringa
   * vuota, che va esclusa a mano.
   */
  it("le righe senza email restano fuori dal vincolo", () => {
    expect(migration).toContain("where email is not null and btrim(email) <> ''");
  });

  /**
   * Se in produzione ci fossero gia' dei doppioni, l'indice non nascerebbe e
   * Postgres direbbe soltanto "could not create unique index". La migration si
   * ferma prima dicendo quali indirizzi sono ripetuti: sono quelli da
   * correggere a mano.
   */
  it("se ci sono gia' dei doppioni si ferma e dice quali", () => {
    expect(migration).toContain("Queste email sono usate da piu'' di una concessionaria");
    expect(migration).toContain("raise exception");
    // Il confronto usa l'istruzione, non la frase: "could not create unique
    // index" compare anche nel commento che spiega perche' il controllo esiste.
    expect(migration.indexOf("raise exception")).toBeLessThan(migration.indexOf("create unique index if not exists"));
  });
});

/**
 * Il difetto che questo test impedisce: mostrare al concessionario il
 * messaggio grezzo di Postgres. "duplicate key value violates unique
 * constraint dealers_email_unica_idx" non gli dice ne' cosa ha sbagliato ne'
 * cosa fare, e il campo colpevole e' uno solo fra i venti del modulo.
 */
describe("chi prova a usare un'email gia' presa legge perche' non si puo'", () => {
  it("l'errore del database diventa una frase comprensibile", () => {
    expect(impostazioni).toContain('updateError.code === "23505"');
    expect(impostazioni).toContain("dealers_email_unica_idx");
    expect(impostazioni).toContain("gia usata da un'altra concessionaria");
  });

  // Solo quello: un errore diverso deve continuare a mostrarsi com'e',
  // altrimenti un guasto vero verrebbe raccontato come un'email doppia.
  it("gli altri errori restano quelli di prima", () => {
    expect(impostazioni).toContain("Errore nel salvataggio dei dati concessionaria.");
  });
});
