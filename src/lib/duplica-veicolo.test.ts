import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copiaDelVeicolo, NON_SI_COPIANO } from "@/lib/duplica-veicolo";

/**
 * Il difetto che impedisce, verificato sul codice il 16/09/2026: "Duplica"
 * copiava ogni colonna con `select("*")`. La copia di un'auto importata
 * portava targa, telaio, cliente e l'aggancio al sito dell'originale: due
 * auto con la stessa targa, e una copia che la sincronizzazione rileggeva e
 * riscriveva come l'originale -- e che spariva quando spariva lui.
 */
describe("la copia di un'auto non porta le chiavi dell'originale", () => {
  const originale = {
    id: "v-1",
    dealer_id: "d-1",
    brand: "Fiat",
    model: "Panda",
    price: 9500,
    mileage: 12000,
    plate: "GA123BC",
    vin: "ZFA31200003123456",
    customer_id: "c-9",
    import_source: "sito.it",
    import_source_id: "1000",
    import_synced_at: "2026-09-16T00:00:00Z",
    import_missing_since: null,
    origine_dati: { price: { fonte: "sito" } },
    ricerca_testo: "fiat panda",
    status: "published",
    published: true,
    created_at: "2026-01-01",
    updated_at: "2026-09-16",
  };

  it("targa, telaio, cliente, aggancio al sito e provenienza restano all'originale", () => {
    const copia = copiaDelVeicolo(originale, "d-1") as Record<string, unknown>;
    for (const campo of ["plate", "vin", "customer_id", "import_source", "import_source_id", "import_synced_at", "import_missing_since", "ricerca_testo", "id", "created_at", "updated_at"]) {
      expect(campo in copia, `${campo} e' stato copiato`).toBe(false);
    }
    expect(copia.brand).toBe("Fiat");
    expect(copia.price).toBe(9500);
  });

  it("nasce in bozza, della concessionaria che duplica, e non pubblicata", () => {
    const copia = copiaDelVeicolo(originale, "d-2");
    expect(copia.status).toBe("draft");
    expect(copia.published).toBe(false);
    expect(copia.dealer_id).toBe("d-2");
  });

  it("i suoi campi sono del concessionario, non del sito dell'originale", () => {
    // Senza questo la copia avrebbe i segni dell'originale: un campo "dal tuo
    // sito" su un'auto che nessun sito rilegge, e che il concessionario ha
    // scelto lui di creare con quei valori.
    const copia = copiaDelVeicolo(originale, "d-1");
    expect(copia.origine_dati.price).toEqual({ fonte: "dealer" });
    expect(copia.origine_dati.brand).toEqual({ fonte: "dealer" });
    expect(copia.origine_dati.status).toBeUndefined();
    expect(copia.origine_dati.plate).toBeUndefined();
  });

  it("l'elenco di cio' che non si copia contiene le chiavi, e la pagina passa da qui", () => {
    for (const campo of ["plate", "vin", "customer_id", "import_source_id", "origine_dati"]) {
      expect(NON_SI_COPIANO).toContain(campo);
    }
    const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-management-page.tsx"), "utf8");
    expect(pagina).toContain("copiaDelVeicolo(");
    expect(pagina, "la duplicazione costruisce ancora la copia da sola").not.toContain("delete payload.id");
  });
});
