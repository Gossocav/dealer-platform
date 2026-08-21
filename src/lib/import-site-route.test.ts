import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = read("src/app/api/vehicles/import-site/route.ts");
const pagina = read("src/components/vehicles/vehicles-import-page.tsx");

// Chi lancia l'importazione manda un indirizzo. Se il server leggesse
// qualunque cosa gli venga passata, diventerebbe un modo per fargli aprire
// indirizzi altrui -- compresi quelli interni alla nostra rete.
describe("il server non legge indirizzi arbitrari", () => {
  it("dell'indirizzo tiene solo il nome del sito", () => {
    expect(route).toContain("const host = grezzo.split(\"/\")[0].toLowerCase()");
    expect(route).toMatch(/\^\[a-z0-9-\]\+\(\\\.\[a-z0-9-\]\+\)\+\$/);
  });

  // Il browser manda quanti veicoli, non quali: l'elenco lo rilegge il server
  // dalla sorgente.
  it("il lotto si ricava dall'elenco letto dal server, non da quello che manda il browser", () => {
    expect(route).toContain("const lotto = voci.slice(offset, offset + limit)");
    expect(pagina).not.toMatch(/body: JSON.stringify\(\{[^}]*entries/);
  });

  it("richiede una sessione valida e risolve la concessionaria dal profilo", () => {
    expect(route).toContain('"Sessione non valida."');
    expect(route).toContain("resolveDealerIdFromTenantSources");
  });
});

// Misurato sul sito vero: leggendo 154 schede di fila ventidue tornavano
// vuote; rilette con calma c'erano tutte.
describe("il sito della concessionaria viene letto con calma", () => {
  it("c'e' una pausa fra una scheda e l'altra, e un secondo tentativo", () => {
    expect(route).toContain("PAUSA_FRA_SCHEDE_MS");
    expect(route).toContain("TENTATIVI_PER_SCHEDA");
    expect(route).toContain("AbortSignal.timeout(TIMEOUT_SCHEDA_MS)");
  });

  // La distinzione che conta: quando ci sara' la rimozione delle vendute,
  // scambiare una lettura fallita per un veicolo assente farebbe sparire dal
  // marketplace automobili in vendita.
  it("una lettura fallita non viene confusa con un veicolo che non c'e'", () => {
    expect(route).toContain('esito: "lettura-fallita"');
    const ramo = route.slice(route.indexOf("if (!html)"), route.indexOf("const letto = parseDealerStockVehicle"));
    expect(ramo).not.toContain("delete");
    expect(ramo).not.toContain("published: false");
  });

  it("l'interfaccia spiega che quelle schede si riprendono, non sono perse", () => {
    expect(pagina).toContain("Non sono veicoli mancanti");
  });
});

describe("il caricamento e' prudente per costruzione", () => {
  it("in bozza salvo scelta diversa", () => {
    expect(route).toContain('const status = body?.status === "published" ? "published" : "draft"');
    expect(pagina).toContain('useState<VehicleImportStatus>("draft")');
  });

  it("le bozze non consumano il tetto del piano, e l'interfaccia lo dice", () => {
    expect(pagina).toContain("non consumano il limite di annunci del tuo piano");
  });

  it("lo stesso veicolo importato due volte viene aggiornato, non duplicato", () => {
    expect(route).toContain('.eq("import_source", host)');
    expect(route).toContain('.eq("import_source_id", veicolo.sourceId)');
    expect(route).toContain('esito: "aggiornato"');
  });

  it("un lotto non puo' essere grande a piacere", () => {
    expect(route).toContain("Math.min(MAX_LOTTO");
  });
});

// Le prime venti vetture importate si sono portate dentro i loghi delle
// marche: nessuna reimportazione avrebbe potuto ripulirle, perche' il
// salvataggio delle foto aggiungeva soltanto.
describe("la galleria si rifa', non si accumula", () => {
  it("le foto vengono sostituite con quelle attuali della sorgente", () => {
    expect(route).toContain("async function sostituisciFoto");
    expect(route).toContain('.from("vehicle_images").delete()');
    expect(route).toContain("sostituisciFoto(supabase, dealerId, vehicleId, veicolo.images)");
  });

  // La cancellazione e' limitata alla concessionaria oltre che al veicolo:
  // due condizioni invece di una, su un'operazione che toglie righe.
  it("cancella solo le foto di quel veicolo di quella concessionaria", () => {
    const blocco = route.slice(route.indexOf('.from("vehicle_images").delete()'));
    expect(blocco.slice(0, 160)).toContain('.eq("vehicle_id", vehicleId)');
    expect(blocco.slice(0, 160)).toContain('.eq("dealer_id", dealerId)');
  });

  it("se la galleria e' gia' quella giusta non si tocca niente", () => {
    expect(route).toContain("if (gia) return;");
  });

  it("resta il tetto di venti foto a veicolo", () => {
    expect(route).toContain("urls.slice(0, MAX_FOTO_VEICOLO)");
  });
});

describe("i motivi dello scarto sono leggibili nel pannello", () => {
  it("ogni motivo ha la sua spiegazione in italiano", () => {
    for (const spiegazione of [
      "nessuna fotografia",
      "nessun prezzo",
      "offerta di noleggio, non una vendita",
      "scheda non leggibile",
    ]) {
      expect(pagina, spiegazione).toContain(spiegazione);
    }
    // E non l'etichetta tecnica al posto della spiegazione.
    expect(pagina).toContain("MOTIVI_SALTO[esito.motivo");
  });
});
