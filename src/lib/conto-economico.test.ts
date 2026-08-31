import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VOCI_DI_COSTO,
  costoTotale,
  formattaImporto,
  leggiImporto,
  margine,
  marginePercentuale,
} from "@/lib/conto-economico";

const MIGRATION = "supabase/migrations/20260831010000_conto_economico_veicolo.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

// Il caso provato su Postgres vero il 31/08/2026, con gli stessi numeri.
const AUTO = {
  purchase_price: 18000,
  cost_transport: 400,
  cost_preparation: 1900,
  cost_parts: 700,
  cost_commission: 200,
  cost_other: 0,
};

describe("le due somme", () => {
  it("il costo totale e' l'acquisto piu' tutte le voci", () => {
    expect(costoTotale(AUTO)).toBe(21200);
  });

  it("il margine e' quello che resta dopo la vendita", () => {
    expect(margine({ ...AUTO, sale_price: 24900 })).toBe(3700);
    expect(marginePercentuale({ ...AUTO, sale_price: 24900 })).toBeCloseTo(14.86, 2);
  });

  it("senza vendita il margine e' ignoto, non zero", () => {
    // Zero vorrebbe dire "venduta in pari". Su una schermata di soldi la
    // differenza fra "non lo so" e "zero" non e' una sfumatura.
    expect(margine(AUTO)).toBeNull();
    expect(marginePercentuale(AUTO)).toBeNull();
  });

  it("un conto vuoto non e' un errore", () => {
    expect(costoTotale({})).toBe(0);
    expect(margine({})).toBeNull();
  });

  it("una vendita in perdita si vede", () => {
    expect(margine({ ...AUTO, sale_price: 19000 })).toBe(-2200);
  });
});

/**
 * Le stesse due formule stanno anche nel database, come colonne calcolate.
 * Quelle sono l'autorita'; queste servono a mostrare il totale mentre si
 * digita. Due formule che dicono cose diverse sono peggio di una sola: se il
 * database cambiasse modo di contare senza che cambi anche questo file, il
 * concessionario vedrebbe un numero mentre digita e un altro dopo il
 * salvataggio.
 */
describe("il conto qui e il conto nel database sono lo stesso conto", () => {
  it("il database somma le stesse voci", () => {
    const formula = sql.slice(sql.indexOf("total_cost numeric"), sql.indexOf(") stored", sql.indexOf("total_cost numeric")));
    expect(formula).toContain("coalesce(purchase_price, 0)");
    for (const { campo } of VOCI_DI_COSTO) {
      expect(formula, `il database non somma ${campo}`).toContain(campo);
    }
  });

  it("il database lascia il margine nullo finche' non c'e' la vendita", () => {
    const formula = sql.slice(sql.indexOf("margin numeric"), sql.indexOf(") stored", sql.indexOf("margin numeric")));
    expect(formula).toContain("when sale_price is null then null");
  });

  it("ogni voce di costo esiste davvero come colonna", () => {
    for (const { campo } of VOCI_DI_COSTO) {
      expect(sql, `manca la colonna ${campo}`).toContain(`${campo} numeric(12, 2) not null default 0`);
    }
  });
});

/**
 * Il difetto che questi impediscono: un concessionario che scrive "18.000"
 * nel prezzo di acquisto. Letto all'inglese diventano diciotto euro, e il
 * margine di quella vettura risulterebbe di ventimila.
 */
describe("gli importi si leggono come li scrive un italiano", () => {
  it("il punto separa le migliaia", () => {
    expect(leggiImporto("18.000")).toBe(18000);
    expect(leggiImporto("18000")).toBe(18000);
    expect(leggiImporto("1.234.567")).toBe(1234567);
  });

  it("la virgola separa i centesimi", () => {
    expect(leggiImporto("18.000,50")).toBe(18000.5);
    expect(leggiImporto("1500,25")).toBe(1500.25);
  });

  it("l'euro e gli spazi non danno fastidio", () => {
    expect(leggiImporto(" 18.000 € ")).toBe(18000);
  });

  it("quello che non e' un importo torna nulla, non zero", () => {
    // Zero sarebbe un costo scritto, e finirebbe nella somma.
    expect(leggiImporto("")).toBeNull();
    expect(leggiImporto("abc")).toBeNull();
    expect(leggiImporto("-500")).toBeNull();
  });

  it("si riscrive come lo scriverebbe lui", () => {
    expect(formattaImporto(21200)).toBe("21.200,00 €");
    expect(formattaImporto(null)).toBe("—");
  });
});

/**
 * Il conto economico non deve mai uscire sul marketplace: e' la ragione per
 * cui vive in una tabella a parte invece che come colonne su `vehicles`,
 * dove sarebbe stato pubblico come lo erano il telaio e il piano della
 * concessionaria fino al 31/08/2026.
 */
describe("il conto economico non e' roba da marketplace", () => {
  const leggiFile = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

  it("il pubblico non ha nessun permesso sulla tabella", () => {
    expect(sql).toContain("revoke all on public.vehicle_economics from anon;");
    // E nessuna politica lo riammette dalla finestra.
    expect(sql).not.toMatch(/create policy[\s\S]{0,200}?to anon/);
  });

  it("la protezione per riga e' accesa e non aggirabile dal proprietario della tabella", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
  });

  it("ogni politica guarda la concessionaria di chi chiede", () => {
    const politiche = sql.match(/create policy vehicle_economics_\w+/g) ?? [];
    expect(politiche.length).toBe(4);
    expect(sql.match(/dealer_id = public\.current_dealer_id\(\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("la concessionaria la mette il database, non chi scrive", () => {
    // Senza, si potrebbe attribuire il conto di un'auto a un'altra
    // concessionaria. Provato su Postgres vero: viene rifiutato.
    expect(sql).toContain("create trigger trg_enforce_vehicle_economics_dealer_id");
    expect(sql).toContain("Il conto economico non appartiene alla concessionaria del veicolo");
  });

  it("nessuna pagina pubblica la nomina", () => {
    for (const percorso of [
      "src/app/(marketplace)/auto/[id]/page.tsx",
      "src/app/(marketplace)/page.tsx",
      "src/lib/public-marketplace.ts",
      "src/lib/structured-data.ts",
    ]) {
      expect(leggiFile(percorso), `${percorso} nomina il conto economico`).not.toContain("vehicle_economics");
    }
  });
});

/**
 * Il 31/08/2026 il titolare ha compilato il conto economico sull'anteprima e
 * ha ricevuto un errore generico. Non era un guasto: la tabella non era
 * ancora stata creata, perche' in questo progetto le modifiche al database si
 * applicano a mano e c'e' sempre una finestra fra il codice in linea e la
 * tabella che nasce. Un messaggio generico, dentro quella finestra, fa
 * cercare un difetto che non esiste.
 */
describe("la finestra fra il codice e la tabella si spiega, non si nasconde", () => {
  const carta = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-economics-card.tsx"), "utf8");

  it("la schermata riconosce la tabella che non c'e' ancora", () => {
    expect(carta).toContain("tabellaNonAncoraCreata");
    expect(carta).toContain("non e ancora attivo sul tuo account");
  });

  it("parla al concessionario, non a chi scrive il codice", () => {
    // Un test gia' esistente (nomi-fornitori-non-visibili) mi ha fermato:
    // avevo scritto in schermata il nome del fornitore tecnico e quello del
    // file da applicare. Al concessionario non dicono niente, e soprattutto
    // non e' lui a dover fare quel passaggio.
    expect(carta).toContain("non e ancora attivo sul tuo account");
    expect(carta).not.toContain("SQL");
    expect(carta).not.toContain(".sql\"");
  });

  it("non promette un salvataggio che non puo' avvenire", () => {
    // Il bottone resta spento: cliccarlo e vedere un errore, sapendo gia' che
    // fallira', e' peggio che non poterlo cliccare.
    expect(carta).toContain("|| daCreare}");
  });
});
