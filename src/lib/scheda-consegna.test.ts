import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dotazioniVeicolo,
  etichettaCliente,
  formattaChilometri,
  pianoIncludeSchedaConsegna,
  righeCliente,
  righeConcessionaria,
  righeVeicolo,
} from "@/lib/scheda-consegna";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function senzaCommenti(sorgente: string) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function valoreDi(righe: Array<{ etichetta: string; valore: string | null }>, etichetta: string) {
  const riga = righe.find((voce) => voce.etichetta === etichetta);
  if (!riga) throw new Error(`riga assente: ${etichetta}`);
  return riga.valore;
}

// La scheda di consegna e' venduta nel solo Piano Elite. Un controllo che
// sbaglia da questa parte regala un servizio a pagamento; uno che sbaglia
// dall'altra lo nega a chi l'ha comprato, e quello almeno lo si viene a sapere.
describe("chi puo' usare la scheda di consegna", () => {
  it("solo l'Elite", () => {
    expect(pianoIncludeSchedaConsegna("elite")).toBe(true);
    expect(pianoIncludeSchedaConsegna("pro")).toBe(false);
    expect(pianoIncludeSchedaConsegna("base")).toBe(false);
  });

  it("non si fa ingannare da maiuscole o spazi", () => {
    expect(pianoIncludeSchedaConsegna("  ELITE ")).toBe(true);
  });

  // Il piano arriva dal server e puo' mancare: rete caduta, sessione scaduta,
  // riga di abbonamento assente. In quel caso la porta resta chiusa.
  it("un piano sconosciuto o assente non apre la porta", () => {
    for (const valore of [null, undefined, "", "  ", "premium", "Elite Plus", "0"]) {
      expect(pianoIncludeSchedaConsegna(valore), String(valore)).toBe(false);
    }
  });
});

/**
 * Sul foglio che si firma, un dato mancante non e' un trattino: e' una riga su
 * cui scrivere. Non e' un dettaglio estetico -- dei 164 veicoli in produzione
 * nessuno ha targa o telaio salvati, perche' arrivano tutti dall'importazione:
 * se quelle righe uscissero con un trattino, la scheda direbbe che l'auto non
 * ha targa invece di lasciare lo spazio per scriverla.
 */
describe("i dati del veicolo sul foglio", () => {
  const veicolo = {
    brand: "Hyundai",
    model: "Tucson",
    version: "1.6 CRDi Xline",
    plate: null,
    vin: null,
    registration_date: "2019-06-13",
    mileage: 78000,
    fuel: "Diesel",
    transmission: "Manuale",
    color: "Grigio",
  };

  it("cio' che c'e' si legge, cio' che manca resta da compilare", () => {
    const righe = righeVeicolo(veicolo);

    expect(valoreDi(righe, "Marca e modello")).toBe("Hyundai Tucson");
    expect(valoreDi(righe, "Chilometri a libretto")).toBe("78.000 km");
    // null = riga vuota da riempire a penna, non "nessuna targa".
    expect(valoreDi(righe, "Targa")).toBeNull();
    expect(valoreDi(righe, "Numero di telaio")).toBeNull();
  });

  it("una stringa di soli spazi vale come dato assente", () => {
    const righe = righeVeicolo({ ...veicolo, plate: "   ", color: "" });
    expect(valoreDi(righe, "Targa")).toBeNull();
    expect(valoreDi(righe, "Colore")).toBeNull();
  });

  it("zero chilometri e' un dato vero e si stampa, non sparisce", () => {
    expect(formattaChilometri(0)).toBe("0 km");
    expect(formattaChilometri(null)).toBeNull();
  });

  it("l'elenco delle righe non cambia forma quando il veicolo e' vuoto", () => {
    const righe = righeVeicolo({});
    expect(righe).toHaveLength(righeVeicolo(veicolo).length);
    expect(righe.every((riga) => riga.valore === null)).toBe(true);
  });
});

describe("chi ritira il veicolo", () => {
  const cliente = {
    first_name: "Marco",
    last_name: "Rossi",
    fiscal_code: "RSSMRC80A01H501U",
    address: "Via Roma 1",
    zip_code: "20121",
    city: "Milano",
    province: "MI",
    mobile: "3331234567",
    phone: "021234567",
    email: "marco@esempio.it",
  };

  it("un cliente scelto riempie le righe", () => {
    const righe = righeCliente(cliente);
    expect(valoreDi(righe, "Intestatario")).toBe("Marco Rossi");
    expect(valoreDi(righe, "Residenza / sede")).toBe("Via Roma 1 - 20121 Milano - (MI)");
    // Il cellulare viene prima del fisso: e' il numero con cui si raggiunge
    // davvero qualcuno il giorno della consegna.
    expect(valoreDi(righe, "Telefono")).toBe("3331234567");
  });

  it("un'azienda si intesta con la ragione sociale, non col nome della persona", () => {
    const righe = righeCliente({ ...cliente, company: "Rossi Trasporti Srl" });
    expect(valoreDi(righe, "Intestatario")).toBe("Rossi Trasporti Srl");
  });

  // Il caso normale finche' l'anagrafica clienti e' vuota: in produzione ce ne
  // sono tre in tutto.
  it("senza cliente scelto tutte le righe restano da compilare a mano", () => {
    const righe = righeCliente(null);
    expect(righe.length).toBeGreaterThan(0);
    expect(righe.every((riga) => riga.valore === null)).toBe(true);
  });

  it("nella tendina un cliente senza nome non diventa una voce vuota da cliccare", () => {
    expect(etichettaCliente({ id: "1", first_name: null, last_name: null, company: null })).toBe("Cliente senza nome");
    expect(etichettaCliente({ id: "2", first_name: "Marco", last_name: "Rossi", city: "Milano" })).toBe("Marco Rossi - Milano");
  });
});

// Nell'intestazione, al contrario, una riga vuota non si stampa: non c'e'
// niente da scrivere a mano sull'indirizzo di chi consegna, o e' in anagrafica
// o quella riga non serve.
describe("l'intestazione della concessionaria", () => {
  it("salta le righe che l'anagrafica non ha", () => {
    const righe = righeConcessionaria({ address: "Via Torino 5", city: "Torino", province: "TO", vat_number: null, phone: null });
    expect(righe).toEqual(["Via Torino 5", "Torino (TO)"]);
  });

  it("la partita IVA si legge come tale, non come un numero qualsiasi", () => {
    expect(righeConcessionaria({ vat_number: "01234567890" })).toEqual(["P. IVA 01234567890"]);
  });
});

describe("le dotazioni", () => {
  it("si leggono sia da elenco sia da riga unica separata da virgole", () => {
    expect(dotazioniVeicolo(["Navigatore", "Sensori"])).toEqual(["Navigatore", "Sensori"]);
    expect(dotazioniVeicolo("Navigatore, Sensori; Cerchi in lega")).toEqual(["Navigatore", "Sensori", "Cerchi in lega"]);
  });

  it("niente dotazioni non diventa una voce vuota", () => {
    expect(dotazioniVeicolo(null)).toEqual([]);
    expect(dotazioniVeicolo(" , ; ")).toEqual([]);
  });
});

// Il controllo del piano deve stare anche sulla pagina, non solo sul bottone:
// nascondere un collegamento non impedisce di scrivere l'indirizzo a mano.
describe("la porta e' chiusa in due punti", () => {
  it("la pagina della scheda controlla il piano, non solo il bottone che ci porta", () => {
    expect(read("src/components/vehicles/vehicle-delivery-sheet-page.tsx")).toContain("pianoIncludeSchedaConsegna(planCode)");
    expect(read("src/components/vehicles/vehicle-detail-page.tsx")).toContain("pianoIncludeSchedaConsegna(planCode)");
  });

  it("il piano lo dice il server, non lo indovina il browser", () => {
    // Senza togliere i commenti il controllo si inganna da solo: il gancio
    // nomina la colonna vecchia proprio per spiegare perche' non la usa.
    const gancio = senzaCommenti(read("src/lib/use-piano-in-vigore.ts"));
    expect(gancio).toContain("/api/demo/plan-request");
    expect(gancio).toContain("effectivePlanCode");
    // La colonna vecchia mente: se venisse letta qui, un'Elite si vedrebbe
    // negare la sua scheda.
    expect(gancio).not.toContain("subscription_plan");
  });
});

/**
 * Il foglio si scrive prima di stamparlo.
 *
 * Prima si poteva compilare solo il pannello -- cliente, data, chilometri,
 * note -- e tutto il resto usciva com'era sulla scheda del veicolo. Misurato
 * il 28/08/2026 in produzione: nessuno dei 235 veicoli aveva targa, telaio o
 * garanzia, perche' arrivano dall'importazione dai siti che quei campi non li
 * espone. Erano tre righe vuote su **ogni** foglio stampato, e proprio le due
 * che identificano l'automobile su un documento che si firma.
 */
describe("le righe del foglio si possono scrivere", () => {
  const pagina = read("src/components/vehicles/vehicle-delivery-sheet-page.tsx");
  const codice = senzaCommenti(pagina);

  it("ogni riga e' un campo, non un testo fisso", () => {
    expect(codice).toContain("function CampoModificabile");
    expect(codice).toContain("<CampoModificabile");
    // La resa vecchia: il valore stampato cosi' com'era, senza modo di
    // toccarlo. Se torna, le righe ridiventano di sola lettura in silenzio.
    expect(codice).not.toContain("{riga.valore ?? <LineaVuota />}");
  });

  it("una riga vuota resta lo spazio per la penna", () => {
    // Vale in stampa: se il dato non c'e' e non lo si scrive a schermo, il
    // foglio deve comunque offrire la riga punteggiata su cui scriverlo.
    expect(codice).toContain('vuoto\n          ? "border-dotted border-slate-400"');
  });

  it("una riga piena non lascia segni sulla carta", () => {
    // Il bordo che a schermo dice "qui si scrive" non deve stamparsi: sul
    // foglio consegnato al cliente sarebbe una sottolineatura senza motivo.
    expect(codice).toContain("print:border-transparent");
  });
});

describe("solo tre righe valgono anche come dato del veicolo", () => {
  const pagina = read("src/components/vehicles/vehicle-delivery-sheet-page.tsx");
  const codice = senzaCommenti(pagina);

  it("targa, telaio e garanzia, con le loro colonne", () => {
    const tabella = codice.slice(codice.indexOf("const SALVABILI"), codice.indexOf("] as const;", codice.indexOf("const SALVABILI")));
    expect(tabella).toContain('{ etichetta: "Targa", colonna: "plate" }');
    expect(tabella).toContain('{ etichetta: "Numero di telaio", colonna: "vin" }');
    expect(tabella).toContain('{ etichetta: "Garanzia", colonna: "warranty" }');
    // I chilometri sono formattati ("78.500 km"): rimetterli in una colonna
    // numerica vorrebbe dire indovinare quale parte e' il numero.
    expect(tabella).not.toContain("mileage");
  });

  it("la scrittura resta dentro la concessionaria", () => {
    // Stessa regola della lettura poco sopra: senza questo vincolo la scheda
    // di consegna diventerebbe un modo per scrivere sull'auto di un altro.
    const salvataggio = codice.slice(codice.indexOf("const salvaSulVeicolo"), codice.indexOf("setSalvataggio(\"fatto\")"));
    expect(salvataggio).toContain('.from("vehicles")');
    expect(salvataggio).toContain('.eq("id", vehicleId)');
    expect(salvataggio).toContain('.eq("dealer_id", dealerId)');
  });

  it("niente si salva da solo", () => {
    // La scheda resta un foglio: il dato passa sul veicolo solo se qualcuno
    // clicca. Un salvataggio automatico riscriverebbe l'anagrafica a ogni
    // apertura della pagina, anche per una correzione buona per una stampa.
    expect(codice).toContain("onClick={() => void salvaSulVeicolo()}");
    const effetti = codice.split("useEffect(");
    for (const blocco of effetti.slice(1)) {
      expect(blocco.slice(0, blocco.indexOf("}, ["))).not.toContain("salvaSulVeicolo");
    }
  });
});
