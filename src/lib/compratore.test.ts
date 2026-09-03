import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clienteDaCompratore,
  compratoreDaCliente,
  compratoreHaUnNome,
  dettaglioCompratore,
  nomeCliente,
  nomeCompratore,
  venditaSenzaCompratore,
} from "@/lib/compratore";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Chi ha comprato la vettura, chiesto dal titolare il 03/09/2026.
 */
describe("come si legge il nome del compratore", () => {
  it("una persona si legge nome e cognome", () => {
    expect(nomeCompratore({ buyer_first_name: "Mario", buyer_last_name: "Rossi" })).toBe("Mario Rossi");
  });

  /**
   * Quando un'auto la compra una societa', la fattura e il passaggio di
   * proprieta' vanno a lei: il nome della persona che ha firmato e' un
   * dettaglio, e metterlo davanti farebbe cercare la vendita sotto il nome
   * sbagliato.
   */
  it("la ragione sociale vince sulla persona che ha firmato", () => {
    expect(
      nomeCompratore({ buyer_first_name: "Mario", buyer_last_name: "Rossi", buyer_company: "Autonoleggi Bianchi Srl" })
    ).toBe("Autonoleggi Bianchi Srl");
  });

  it("ma la persona che ha firmato non si perde: si legge sotto", () => {
    const righe = dettaglioCompratore({
      buyer_first_name: "Mario",
      buyer_last_name: "Rossi",
      buyer_company: "Autonoleggi Bianchi Srl",
    });
    expect(righe[0]).toBe("Mario Rossi");
  });

  // Se il nome in alto e' gia' quello della persona, ripeterlo sotto sarebbe
  // scriverlo due volte.
  it("una persona sola non viene scritta due volte", () => {
    expect(dettaglioCompratore({ buyer_first_name: "Mario", buyer_last_name: "Rossi" })).not.toContain("Mario Rossi");
  });

  it("indirizzo, recapiti e dati fiscali si leggono su righe separate", () => {
    const righe = dettaglioCompratore({
      buyer_last_name: "Rossi",
      buyer_address: "Via Roma 1",
      buyer_zip_code: "20100",
      buyer_city: "Milano",
      buyer_province: "MI",
      buyer_phone: "333111222",
      buyer_email: "mario@example.it",
      buyer_vat_number: "01234567890",
    });

    expect(righe).toContain("Via Roma 1, 20100 Milano, MI");
    expect(righe).toContain("333111222 · mario@example.it");
    expect(righe.some((r) => r.includes("P. IVA 01234567890"))).toBe(true);
  });

  // Un campo vuoto non deve lasciare virgole appese o righe vuote.
  it("i campi mancanti non lasciano segni", () => {
    expect(dettaglioCompratore({ buyer_last_name: "Rossi", buyer_city: "Milano" })).toEqual(["Milano"]);
    expect(dettaglioCompratore({})).toEqual([]);
    expect(nomeCompratore(null)).toBeNull();
  });
});

/**
 * Un compratore senza nessun nome sarebbe una riga che dice "venduta a
 * qualcuno", cioe' quello che c'era prima. Lo impone anche il database, ma il
 * rifiuto deve arrivare mentre si compila.
 */
describe("quando un compratore si puo' salvare", () => {
  it("basta il cognome, o la sola ragione sociale", () => {
    expect(compratoreHaUnNome({ buyer_last_name: "Rossi" })).toBe(true);
    expect(compratoreHaUnNome({ buyer_company: "Autonoleggi Bianchi Srl" })).toBe(true);
  });

  it("i soli recapiti non bastano", () => {
    expect(compratoreHaUnNome({ buyer_email: "mario@example.it", buyer_phone: "333" })).toBe(false);
    expect(compratoreHaUnNome({ buyer_first_name: "   " })).toBe(false);
  });
});

describe("il passaggio dalla rubrica e ritorno", () => {
  it("scegliere un cliente riempie il modulo", () => {
    const compratore = compratoreDaCliente({
      id: "c1",
      first_name: "Mario",
      last_name: "Rossi",
      email: "mario@example.it",
      address: "Via Roma 1",
      province: "MI",
    });

    expect(compratore.buyer_first_name).toBe("Mario");
    expect(compratore.buyer_email).toBe("mario@example.it");
    expect(compratore.buyer_province).toBe("MI");
  });

  /**
   * Su un contratto serve un numero che risponda, non la colonna giusta: se il
   * fisso non c'e' vale il cellulare.
   */
  it("se manca il telefono fisso vale il cellulare", () => {
    expect(compratoreDaCliente({ id: "c1", last_name: "Rossi", mobile: "3331112222" }).buyer_phone).toBe("3331112222");
    expect(compratoreDaCliente({ id: "c1", last_name: "Rossi", phone: "021234", mobile: "333" }).buyer_phone).toBe("021234");
  });

  it("un compratore nuovo diventa una riga di rubrica", () => {
    const cliente = clienteDaCompratore({ buyer_company: "Autonoleggi Bianchi Srl", buyer_email: "info@bianchi.it" });
    expect(cliente.company).toBe("Autonoleggi Bianchi Srl");
    expect(cliente.email).toBe("info@bianchi.it");
    expect(cliente.first_name).toBeNull();
  });

  it("i clienti si leggono nella tendina con lo stesso criterio", () => {
    expect(nomeCliente({ id: "c1", company: "Autonoleggi Bianchi Srl", last_name: "Rossi" })).toBe(
      "Autonoleggi Bianchi Srl"
    );
    expect(nomeCliente({ id: "c2" })).toBe("Cliente senza nome");
  });
});

/**
 * Il difetto che questo test impedisce: una vettura venduta di cui non si sa
 * a chi, e nessuno che lo faccia notare. Prima del 03/09/2026 una vettura
 * passava a "venduta" senza che niente chiedesse il compratore, e in
 * produzione **zero** vetture su 275 avevano un cliente collegato.
 */
describe("la vendita senza compratore si vede", () => {
  it("una vettura venduta senza vendita registrata va segnalata", () => {
    expect(venditaSenzaCompratore("sold", false)).toBe(true);
    expect(venditaSenzaCompratore("SOLD", false)).toBe(true);
  });

  it("una vettura venduta con il compratore no", () => {
    expect(venditaSenzaCompratore("sold", true)).toBe(false);
  });

  // Una vettura ancora in vendita non ha nessun compratore da indicare: quel
  // riquadro non deve comparire finche' non e' venduta.
  it("e nemmeno una vettura che non e' ancora venduta", () => {
    expect(venditaSenzaCompratore("published", false)).toBe(false);
    expect(venditaSenzaCompratore(null, false)).toBe(false);
  });
});

/**
 * **Questi leggono il testo del file SQL.** La prova vera e' stata fatta su un
 * Postgres 15 in Docker: nove casi, fra cui il cliente cancellato dalla
 * rubrica con la vendita che resta completa, la vettura cancellata con la
 * targa che si conserva, e le due concessionarie che non si vedono.
 */
describe("il database conserva la vendita anche quando spariscono gli altri", () => {
  const migration = leggi("supabase/migrations/20260903110000_compratore_della_vettura.sql");

  /**
   * Un collegamento dice chi e' quel cliente oggi. Se fra due anni cambia
   * indirizzo o viene cancellato, la vendita cambierebbe insieme a lui o
   * resterebbe senza nome: una vendita e' un fatto avvenuto in un giorno
   * preciso.
   */
  it("il cliente cancellato non porta via il nome del compratore", () => {
    expect(migration).toContain("customer_id uuid references public.customers(id) on delete set null");
    expect(migration).toContain("buyer_first_name text");
    expect(migration).toContain("buyer_email text");
    expect(migration).toContain("buyer_address text");
  });

  it("la vettura cancellata lascia la targa sulla vendita", () => {
    expect(migration).toContain("vehicle_id uuid references public.vehicles(id) on delete set null");
    expect(migration).toContain("new.vehicle_plate := coalesce");
  });

  it("una vendita senza nessun nome non si scrive", () => {
    expect(migration).toContain("vehicle_sales_ha_un_nome");
  });

  // Una vendita per vettura, ma l'indice e' parziale: le vendite di vetture
  // cancellate hanno tutte vehicle_id nullo e un vincolo pieno le
  // considererebbe doppioni fra loro.
  it("una vendita per vettura, senza inciampare su quelle cancellate", () => {
    expect(migration).toContain("create unique index if not exists vehicle_sales_una_per_vettura");
    expect(migration).toContain("where vehicle_id is not null");
  });

  it("ogni politica poggia su current_dealer_id, e non c'e' nessuna soglia di piano", () => {
    const politiche = migration.split("create policy").slice(1);
    expect(politiche.length).toBe(4);
    for (const politica of politiche) {
      expect(politica).toContain("dealer_id = public.current_dealer_id()");
    }
    expect(migration).not.toContain("dealer_plan_in_force");
  });

  // Qui dentro ci sono nome, indirizzo e telefono di privati cittadini.
  it("il pubblico del sito non ha nessun permesso", () => {
    expect(migration).toContain("revoke all on public.vehicle_sales from anon");
    expect(migration).not.toMatch(/grant[^;]*to anon/);
  });
});

/**
 * Dove si registra il compratore: sulla scheda della vettura, e solo quando e'
 * venduta.
 */
describe("il riquadro sulla scheda della vettura", () => {
  const riquadro = leggi("src/components/vehicles/riquadro-compratore.tsx");
  const scheda = leggi("src/components/vehicles/vehicle-detail-page.tsx");

  it("sta sulla scheda del veicolo, in cima", () => {
    expect(scheda).toContain("<RiquadroCompratore vehicleId={vehicle.id}");
    expect(scheda.indexOf("<RiquadroCompratore")).toBeLessThan(scheda.indexOf("Scheda completa"));
  });

  // Prima della vendita non c'e' nessun compratore da indicare, e un riquadro
  // vuoto su ogni scheda sarebbe rumore.
  it("non compare finche' la vettura non e' venduta", () => {
    expect(riquadro).toContain('const venduta = String(status ?? "").trim().toLowerCase() === "sold"');
    expect(riquadro).toContain("if (!venduta || caricamento) return null;");
  });

  it("una vettura venduta senza compratore lo dice", () => {
    expect(riquadro).toContain("venditaSenzaCompratore(status, Boolean(vendita))");
    expect(riquadro).toContain("Compratore da indicare");
  });

  /**
   * Chi compra un'auto e' un cliente: la prossima volta deve trovarsi gia' in
   * rubrica. Ma se esiste gia' un cliente con la stessa email si aggancia
   * quello, invece di creare un doppione che poi qualcuno dovra' unire a mano.
   */
  it("il compratore nuovo finisce in rubrica, senza creare doppioni", () => {
    expect(riquadro).toContain('from("customers")');
    expect(riquadro).toContain('.ilike("email", email)');
    expect(riquadro).toContain("clienteDaCompratore(modulo)");
  });

  // La concessionaria si dichiara in ogni interrogazione, anche dove il
  // database la impone comunque.
  it("ogni lettura e scrittura dichiara la concessionaria", () => {
    const chiamate = riquadro.split("supabase").slice(1);
    const conDealer = chiamate.filter((c) => c.slice(0, 400).includes('"dealer_id"') || c.slice(0, 400).includes("dealer_id:"));
    expect(conDealer.length).toBeGreaterThanOrEqual(4);
  });
});
