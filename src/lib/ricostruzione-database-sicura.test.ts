import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ricostruire il database da zero non deve indebolire la sicurezza.
 *
 * **Quale difetto impedisce.** Trovato il 05/09/2026 in una verifica di
 * sicurezza. Due file di migration non hanno la data davanti al nome:
 *
 *     add_dealer_id_to_vehicle_images.sql
 *     rls_vehicles_policies.sql
 *
 * Ordinati per nome finiscono **dopo** ogni migration `2026XXXX`, perche' una
 * lettera viene dopo una cifra. Su un database ricostruito da zero -- un
 * ambiente nuovo, un ripristino dopo un guasto -- sono le ultime cose che
 * girano, e quello che definiscono vince su tutto.
 *
 * `rls_vehicles_policies.sql` ridefiniva `current_dealer_id()` nella versione
 * debole: legge `profiles.dealer_id` senza guardare se l'appartenenza alla
 * concessionaria e' ancora **attiva**. Con quella in vigore, sospendere una
 * concessionaria non le toglie l'accesso. Ed e' il fondamento di quasi ogni
 * regola per riga del progetto.
 *
 * La migration 20260717000016 aveva gia' ripristinato la versione giusta e
 * annotato il pericolo, ma non poteva risolverlo: sorta prima, e su una
 * ricostruzione veniva sovrascritta di nuovo.
 *
 * **Perche' un test e non solo la correzione.** Il difetto non si vedeva in
 * produzione, dove la versione giusta c'e': sarebbe uscito soltanto durante un
 * ripristino, cioe' il giorno peggiore, e nessuno lo avrebbe collegato a un
 * file senza data nel nome. Questo test guarda le migration nello stesso
 * ordine in cui verrebbero riapplicate, che e' l'unico momento in cui il
 * difetto esiste.
 */

const CARTELLA = resolve(process.cwd(), "supabase/migrations");

/** Le migration nell'ordine in cui una ricostruzione le riapplicherebbe. */
const migrazioni = readdirSync(CARTELLA)
  .filter((nome) => nome.endsWith(".sql"))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(resolve(CARTELLA, nome), "utf8") }));

describe("una ricostruzione del database non indebolisce la sicurezza", () => {
  it("legge le migration, e nell'ordine giusto", () => {
    expect(migrazioni.length).toBeGreaterThan(50);

    // Il presupposto di tutto il test: esistono file che finiscono in coda
    // proprio perche' non hanno la data. Se un giorno venissero rinominati,
    // questa riga fallisce e chi legge capisce che il pericolo e' rientrato
    // da un'altra parte invece di credere che il test protegga ancora.
    const ultimi = migrazioni.slice(-2).map((m) => m.nome);
    expect(ultimi).toEqual(["add_dealer_id_to_vehicle_images.sql", "rls_vehicles_policies.sql"]);
  });

  it("l'ultima definizione di current_dealer_id e' quella che controlla l'appartenenza attiva", () => {
    // "Ultima" e' la parola importante: e' quella che resta in piedi dopo
    // aver riapplicato tutto.
    const definizioni = migrazioni.filter(({ sql }) =>
      /create\s+(or\s+replace\s+)?function\s+public\.current_dealer_id\s*\(/i.test(sql)
    );

    expect(definizioni.length).toBeGreaterThan(0);

    const ultima = definizioni[definizioni.length - 1];
    const corpo = ultima.sql.slice(
      ultima.sql.search(/create\s+(or\s+replace\s+)?function\s+public\.current_dealer_id\s*\(/i)
    );

    expect(
      corpo,
      `L'ultima definizione di current_dealer_id() e' in ${ultima.nome} e non guarda dealer_users.`
    ).toMatch(/public\.dealer_users/);

    expect(
      corpo,
      `L'ultima definizione di current_dealer_id() e' in ${ultima.nome} e non richiede l'appartenenza attiva.`
    ).toMatch(/status\s*=\s*'active'/);

    // La versione debole leggeva il profilo. Se ricomparisse come **unica**
    // fonte, le due prove qui sopra basterebbero a fermarla; questa lo dice
    // in modo esplicito a chi legge il fallimento.
    const soloDalProfilo =
      /from\s+public\.profiles\s+p\s+where\s+p\.id\s*=\s*auth\.uid\(\)/i.test(corpo) &&
      !/public\.dealer_users/.test(corpo);

    expect(soloDalProfilo, `${ultima.nome} usa la versione debole, quella che legge solo profiles.`).toBe(false);
  });

  it("nessuna migration dichiara pubblico il secchio delle fotografie", () => {
    // Un secchio pubblico si scarica per indirizzo, senza firma: comprese le
    // fotografie dei veicoli non pubblicati. In produzione e' privato, ma la
    // migration lo dichiarava `true`, quindi un ambiente nuovo sarebbe nato
    // aperto.
    for (const { nome, sql } of migrazioni) {
      for (const riga of sql.split("\n")) {
        if (!riga.includes("'vehicle-images'")) continue;
        if (!/values\s*\(/i.test(riga)) continue;

        expect(riga.replace(/\s+/g, " "), `${nome} dichiara pubblico il secchio delle fotografie`).not.toMatch(
          /'vehicle-images'\s*,\s*true/i
        );
      }
    }
  });

  it("il secchio dei documenti e quello delle visure restano privati", () => {
    // Contengono documenti di persone: qui un "true" sarebbe peggio ancora.
    for (const { nome, sql } of migrazioni) {
      for (const secchio of ["vehicle-documents", "demo-documents"]) {
        for (const riga of sql.split("\n")) {
          if (!riga.includes(`'${secchio}'`)) continue;
          expect(riga.replace(/\s+/g, " "), `${nome} dichiara pubblico ${secchio}`).not.toMatch(
            new RegExp(`'${secchio}'\\s*,\\s*true`, "i")
          );
        }
      }
    }
  });
});
