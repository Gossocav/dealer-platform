import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIMENSIONE_MASSIMA_BYTE,
  TIPI_DOCUMENTO,
  condizioneTestoLibero,
  etichettaTipoDocumento,
  motivoRifiutoFile,
  normalizzaFiltriDocumenti,
  percorsoDocumento,
  pesoLeggibile,
  ricercaDocumentiInCorso,
} from "@/lib/archivio-documenti";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const migration = leggi("supabase/migrations/20260903100000_archivio_documenti_veicolo.sql");

/**
 * L'archivio documenti, chiesto dal titolare il 03/09/2026.
 */
describe("i tipi di documento", () => {
  /**
   * Il difetto che questo test impedisce: una tendina che offre un tipo che il
   * database rifiuta. Si scoprirebbe solo al momento di salvare, con il file
   * gia' caricato -- cioe' dopo aver fatto aspettare chi archivia.
   */
  it("quelli della tendina sono esattamente quelli che il database accetta", () => {
    const vincolo = migration.slice(
      migration.indexOf("vehicle_documents_tipo_valido"),
      migration.indexOf("))", migration.indexOf("vehicle_documents_tipo_valido"))
    );

    const nelDatabase = [...vincolo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const nellaTendina = TIPI_DOCUMENTO.map((t) => t.valore).sort();

    expect(nelDatabase.length, "il vincolo non e' stato letto").toBeGreaterThan(5);
    expect(nellaTendina).toEqual(nelDatabase);
  });

  it("ogni tipo ha un nome leggibile", () => {
    for (const tipo of TIPI_DOCUMENTO) {
      expect(tipo.etichetta.length, `${tipo.valore} non ha etichetta`).toBeGreaterThan(3);
    }
    expect(etichettaTipoDocumento("contratto_vendita")).toBe("Contratto di vendita");
  });

  // Un documento vecchio con un tipo che non esiste piu' non deve far sparire
  // la riga dall'elenco: si legge "Altro" e si vede lo stesso.
  it("un tipo sconosciuto non fa sparire il documento", () => {
    expect(etichettaTipoDocumento("tipo_di_tre_anni_fa")).toBe("Altro");
    expect(etichettaTipoDocumento(null)).toBe("Altro");
  });
});

/**
 * Il rifiuto deve arrivare **prima** del caricamento: scoprire che il file e'
 * troppo grande dopo aver aspettato venti megabyte su rete mobile e' il modo
 * piu' rapido per far rinunciare qualcuno.
 */
describe("quali file si possono archiviare", () => {
  const file = (nome: string, dimensione: number, tipo: string) => ({ name: nome, size: dimensione, type: tipo });

  it("un PDF e una fotografia vanno bene", () => {
    expect(motivoRifiutoFile(file("contratto.pdf", 400_000, "application/pdf"))).toBeNull();
    expect(motivoRifiutoFile(file("libretto.jpg", 3_000_000, "image/jpeg"))).toBeNull();
  });

  it("sopra i dieci megabyte si dice quanto pesa e cosa fare", () => {
    const motivo = motivoRifiutoFile(file("scansione.pdf", DIMENSIONE_MASSIMA_BYTE + 1, "application/pdf"));
    expect(motivo).toContain("10 MB");
    expect(motivo).toContain("dividilo");
  });

  // Un file vuoto arriva quando il caricamento si interrompe: archiviarlo
  // vorrebbe dire credere di avere il contratto e non averlo.
  it("un file vuoto si rifiuta", () => {
    expect(motivoRifiutoFile(file("contratto.pdf", 0, "application/pdf"))).toContain("vuoto");
  });

  it("un formato che il browser non apre si rifiuta, dicendo quali vanno bene", () => {
    const motivo = motivoRifiutoFile(file("contratto.docx", 50_000, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expect(motivo).toContain("PDF");
    expect(motivo).toContain("stampalo in PDF");
  });
});

/**
 * La prima cartella e' la concessionaria, ed e' quella su cui il database
 * decide chi puo' leggere e scrivere i file: cambiarla vorrebbe dire cambiare
 * anche le politiche.
 */
describe("dove finisce il file", () => {
  const DEALER = "11111111-1111-1111-1111-111111111111";

  it("la prima cartella e' la concessionaria", () => {
    expect(percorsoDocumento(DEALER, "veicolo-1", "contratto.pdf").startsWith(`${DEALER}/`)).toBe(true);
  });

  it("la seconda e' la vettura, o una cartella per quelli sciolti", () => {
    expect(percorsoDocumento(DEALER, "veicolo-1", "x.pdf").split("/")[1]).toBe("veicolo-1");
    expect(percorsoDocumento(DEALER, null, "x.pdf").split("/")[1]).toBe("senza-vettura");
  });

  // Chi apre l'archivio fra due anni deve riconoscere il documento dal nome,
  // non trovarsi davanti a un codice.
  it("il nome del file si conserva, ripulito", () => {
    expect(percorsoDocumento(DEALER, null, "Contratto Rossi (firmato).pdf")).toContain("Contratto-Rossi-firmato.pdf");
  });

  it("due caricamenti dello stesso file non si sovrascrivono", () => {
    const primo = percorsoDocumento(DEALER, "v", "libretto.pdf");
    const secondo = percorsoDocumento(DEALER, "v", "libretto.pdf");
    expect(primo).not.toBe(secondo);
  });

  // Un nome che risale le cartelle scriverebbe fuori dalla cartella della
  // concessionaria, cioe' fuori dal confine su cui poggia tutto.
  it("un nome che prova a uscire dalla cartella non ci riesce", () => {
    const percorso = percorsoDocumento(DEALER, "v", "../../altro/rubato.pdf");
    expect(percorso.split("/")).toHaveLength(3);
    expect(percorso).not.toContain("..");
  });
});

describe("i filtri della ricerca", () => {
  it("un campo vuoto non diventa un filtro", () => {
    expect(ricercaDocumentiInCorso(normalizzaFiltriDocumenti({ targa: "  ", testo: "" }))).toBe(false);
  });

  it("le date al contrario si raddrizzano", () => {
    const filtri = normalizzaFiltriDocumenti({ dal: "2026-12-31", al: "2026-01-01" });
    expect(filtri.dal).toBe("2026-01-01");
    expect(filtri.al).toBe("2026-12-31");
  });

  /**
   * Chi cerca "Rossi" puo' averlo scritto nel titolo, o nelle note, o averlo
   * nel nome del file arrivato dal commercialista, e non si ricorda quale.
   */
  it("il testo libero cerca in titolo, note e nome del file", () => {
    const condizione = condizioneTestoLibero("Rossi");
    expect(condizione).toContain("title.ilike.%Rossi%");
    expect(condizione).toContain("notes.ilike.%Rossi%");
    expect(condizione).toContain("file_name.ilike.%Rossi%");
  });

  it("i caratteri jolly di chi cerca restano spenti", () => {
    expect(condizioneTestoLibero("50%")).toContain("50\\%");
  });
});

describe("il peso dei file a schermo", () => {
  it("si legge in chilobyte o megabyte, non in cifre lunghe", () => {
    expect(pesoLeggibile(900)).toBe("900 B");
    expect(pesoLeggibile(300_000)).toBe("293 KB");
    expect(pesoLeggibile(3_500_000)).toBe("3.3 MB");
  });

  it("un peso che non c'e' non diventa zero", () => {
    expect(pesoLeggibile(null)).toBe("-");
    expect(pesoLeggibile(0)).toBe("-");
  });
});

/**
 * **Questi ultimi leggono il testo del file SQL.** La prova vera e' stata
 * fatta a mano su un Postgres 15 in Docker, ricostruendo i ruoli di Supabase e
 * lo schema `storage`: dodici casi, fra cui la cancellazione della vettura con
 * il documento che resta, l'altra concessionaria che non vede niente, e il
 * caricamento nella cartella di un altro che viene rifiutato.
 */
describe("il database tiene i documenti anche quando la vettura non c'e' piu'", () => {
  /**
   * Il requisito dichiarato dal titolare: i documenti devono restare dopo la
   * vendita. Vale anche per la cancellazione -- il concessionario puo'
   * cancellare una vettura per fare pulizia -- e con un vincolo a cascata si
   * porterebbe via i contratti. In Italia un contratto di vendita si conserva
   * dieci anni.
   */
  it("il legame con la vettura si spezza, il documento no", () => {
    expect(migration).toContain("vehicle_id uuid references public.vehicles(id) on delete set null");
    expect(migration).not.toContain("references public.vehicles(id) on delete cascade");
  });

  // Quando il veicolo non c'e' piu', la copia della targa e' tutto quello che
  // resta per ritrovare il documento.
  it("targa, telaio e nome della vettura sono copiati sulla riga", () => {
    expect(migration).toContain("vehicle_plate text");
    expect(migration).toContain("vehicle_vin text");
    expect(migration).toContain("vehicle_label text");
    expect(migration).toContain("new.vehicle_plate := coalesce");
  });

  it("ogni politica poggia su current_dealer_id", () => {
    const politiche = migration.slice(migration.indexOf("create policy vehicle_documents_select_own")).split("create policy").slice(1, 5);
    expect(politiche.length).toBe(4);
    for (const politica of politiche) {
      expect(politica).toContain("dealer_id = public.current_dealer_id()");
    }
  });

  // Nessuna soglia di piano: l'archivio e' di tutti, Base compreso.
  it("non c'e' nessuna condizione sul piano", () => {
    expect(migration).not.toContain("dealer_plan_in_force");
    expect(migration).not.toMatch(/has_(perizie|conto_economico)/);
  });

  // I documenti contengono dati di persone: il secchio non deve essere
  // raggiungibile con la chiave pubblica del sito.
  it("i file stanno in un secchio privato, per concessionaria", () => {
    expect(migration).toContain("'vehicle-documents'");
    expect(migration).toContain("false,");
    expect(migration).toContain("split_part(name, '/', 1) = public.current_dealer_id()::text");
    expect(migration).toContain("revoke all on public.vehicle_documents from anon");
  });
});
