import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * **Ogni vista nasce con `security_invoker`.**
 *
 * Una vista in Postgres gira, di regola, **con i permessi di chi l'ha
 * scritta** -- il proprietario del database. Le regole di protezione per riga
 * delle tabelle che legge non vengono applicate a chi la interroga, ma a lui:
 * cioe' non vengono applicate. Una vista e' quindi il modo classico di
 * scavalcare l'isolamento fra concessionarie **senza toccare nessuna
 * politica**, e senza che niente diventi rosso da nessuna parte.
 *
 * `with (security_invoker = on)` ribalta la cosa: la vista gira con i
 * permessi di **chi la chiama**, e `current_dealer_id()` torna a valere.
 *
 * Nella prima vista di questo progetto -- `vetrina_per_concessionaria`,
 * 19/09/2026, nata per contare i veicoli nel database invece che su un
 * elenco tagliato -- quella riga e' l'unica che separa un conteggio pubblico
 * legittimo da una porta aperta su tutto lo stock di tutti. Il conteggio in
 * se' e' innocuo; la vista che lo calcola non lo e' per niente.
 *
 * Questo controllo esiste perche' la seconda vista, scritta fra sei mesi da
 * chi non ha in mente questa pagina, non possa nascere senza.
 */

/** `create view x as` oppure `create or replace view x as`, fino alla `as`. */
const DICHIARAZIONE_DI_VISTA = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\s\S]*?)\bas\b/gi;

export function vistePericolose(sql: string): string[] {
  return [...sql.matchAll(DICHIARAZIONE_DI_VISTA)]
    .filter(([, testa]) => !/security_invoker\s*=\s*on/i.test(testa))
    .map(([, testa]) => testa.trim().split(/\s+/)[0]);
}

function migrazioni(): string[] {
  const file = execSync("find supabase/migrations -name '*.sql'").toString().trim().split("\n").filter(Boolean);
  // Se la ricerca non trova niente il controllo direbbe "tutto a posto"
  // senza aver letto una riga.
  expect(file.length).toBeGreaterThan(10);
  return file;
}

describe("ogni vista nasce con security_invoker", () => {
  it("nessuna migration dichiara una vista senza", () => {
    const scoperte: string[] = [];
    for (const percorso of migrazioni()) {
      for (const vista of vistePericolose(readFileSync(percorso, "utf8"))) {
        scoperte.push(`${percorso} · ${vista}`);
      }
    }
    expect(scoperte).toEqual([]);
  });

  it("il controllo diventa rosso davanti a una vista nuova senza la riga", () => {
    expect(vistePericolose("create view public.prezzi as select 1;")).toEqual(["public.prezzi"]);
    expect(vistePericolose("create or replace view public.prezzi as select 1;")).toEqual(["public.prezzi"]);
    // Con un'altra opzione ma senza quella che conta: e' il caso piu'
    // probabile, perche' sembra fatto bene.
    expect(vistePericolose("create view public.prezzi with (check_option = local) as select 1;")).toEqual([
      "public.prezzi",
    ]);
    expect(vistePericolose("create view public.prezzi\nwith (security_invoker = on) as\n  select 1;")).toEqual([]);
  });
});
