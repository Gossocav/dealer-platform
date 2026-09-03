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
  raggruppaPerVettura,
  ricercaDocumentiInCorso,
  type DocumentoRaggruppabile,
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

/**
 * L'archivio si sfoglia per automobile e non per documento: chiesto dal
 * titolare il 03/09/2026 dopo aver visto la prima versione, che mostrava un
 * elenco piatto di tutti i documenti. Ed e' come si cerca davvero -- "i
 * documenti della Panda targata AB123CD", non "tutti i contratti che ho".
 */
describe("l'archivio si sfoglia per vettura", () => {
  const doc = (p: Partial<DocumentoRaggruppabile>): DocumentoRaggruppabile => ({
    vehicle_id: null,
    vehicle_plate: null,
    vehicle_label: null,
    doc_type: "altro",
    document_date: null,
    created_at: "2026-09-01T10:00:00Z",
    ...p,
  });

  it("i documenti della stessa vettura fanno una riga sola", () => {
    const gruppi = raggruppaPerVettura([
      doc({ vehicle_id: "v1", vehicle_plate: "AB123CD", vehicle_label: "Fiat Panda", doc_type: "libretto" }),
      doc({ vehicle_id: "v1", vehicle_plate: "AB123CD", doc_type: "contratto_vendita" }),
      doc({ vehicle_id: "v2", vehicle_plate: "ZZ999ZZ", doc_type: "libretto" }),
    ]);

    expect(gruppi).toHaveLength(2);
    const panda = gruppi.find((g) => g.vehicleId === "v1");
    expect(panda?.quanti).toBe(2);
    expect(panda?.etichetta).toBe("Fiat Panda");
    expect(panda?.tipi.sort()).toEqual(["contratto_vendita", "libretto"]);
  });

  /**
   * Il difetto che questo test impedisce: quando una vettura viene cancellata
   * i suoi documenti perdono l'identificativo. Raggruppandoli per quello,
   * finirebbero tutti in un mucchio unico insieme a quelli di ogni altra
   * vettura cancellata -- e la targa, che e' l'unica cosa rimasta, non
   * servirebbe piu' a niente.
   */
  it("due vetture cancellate restano due righe distinte", () => {
    const gruppi = raggruppaPerVettura([
      doc({ vehicle_id: null, vehicle_plate: "AB123CD" }),
      doc({ vehicle_id: null, vehicle_plate: "AB123CD" }),
      doc({ vehicle_id: null, vehicle_plate: "ZZ999ZZ" }),
    ]);

    expect(gruppi).toHaveLength(2);
    expect(gruppi.every((g) => g.vehicleId === null)).toBe(true);
    expect(gruppi.map((g) => g.quanti).sort()).toEqual([1, 2]);
  });

  it("i documenti senza nessuna vettura stanno insieme, in fondo alla loro riga", () => {
    const gruppi = raggruppaPerVettura([doc({}), doc({})]);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].chiave).toBe("senza-vettura");
    expect(gruppi[0].quanti).toBe(2);
  });

  // In cima la vettura su cui si e' archiviato per ultimo: e' quella su cui si
  // sta lavorando adesso.
  it("in cima c'e' la vettura toccata piu' di recente", () => {
    const gruppi = raggruppaPerVettura([
      doc({ vehicle_id: "vecchia", vehicle_plate: "AA111AA", created_at: "2026-01-01T10:00:00Z" }),
      doc({ vehicle_id: "recente", vehicle_plate: "BB222BB", created_at: "2026-09-03T10:00:00Z" }),
    ]);

    expect(gruppi[0].vehicleId).toBe("recente");
  });

  // La targa si confronta senza distinzione fra maiuscole e spazi: due
  // documenti della stessa auto non devono diventare due vetture.
  it("la stessa targa scritta in due modi resta una vettura sola", () => {
    const gruppi = raggruppaPerVettura([
      doc({ vehicle_plate: "ab123cd" }),
      doc({ vehicle_plate: " AB123CD " }),
    ]);

    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].targa).toBe("AB123CD");
  });
});

/**
 * Le due schermate dell'archivio, dopo la correzione del 03/09/2026: quella
 * generale elenca le **vetture**, quella della vettura elenca i suoi
 * **documenti** ed e' l'unica da cui si carica.
 */
describe("le due schermate fanno due mestieri diversi", () => {
  const archivio = leggi("src/components/documenti/vetture-con-documenti-page.tsx");
  const vettura = leggi("src/components/documenti/archivio-documenti-page.tsx");

  it("l'archivio generale raggruppa per vettura", () => {
    expect(archivio).toContain("raggruppaPerVettura(documenti)");
    expect(archivio).toContain("Le vetture con documenti archiviati");
  });

  /**
   * Il difetto che questo test impedisce: rimettere il caricamento
   * nell'archivio generale. Un documento riguarda sempre un'automobile, e
   * chiedere "di quale vettura?" dopo aver scelto il file sarebbe una domanda
   * in piu' a ogni caricamento -- oltre a produrre documenti senza vettura,
   * che nell'archivio finiscono tutti in un mucchio unico.
   */
  it("si carica solo dalla vettura, non dall'archivio generale", () => {
    expect(vettura).toContain('type="file"');
    expect(archivio).not.toContain('type="file"');
    expect(archivio).not.toContain("supabase.storage");
  });

  // Cercare "contratto di vendita" deve mostrare le automobili che ne hanno
  // uno, non quelle il cui nome contiene quella parola: la ricerca lavora sui
  // documenti, il raggruppamento viene dopo.
  it("la ricerca lavora sui documenti e il raggruppamento viene dopo", () => {
    expect(archivio.indexOf('from("vehicle_documents")')).toBeLessThan(archivio.indexOf("raggruppaPerVettura(documenti)"));
    expect(archivio).toContain('interrogazione.eq("doc_type", filtri.tipo)');
  });

  /**
   * Una vettura cancellata non ha una scheda da aprire. I suoi documenti si
   * aprono sotto la riga, invece di portare a una pagina che non esiste.
   */
  it("la vettura cancellata apre i documenti li' dove sta", () => {
    expect(archivio).toContain("vettura.vehicleId ? (");
    expect(archivio).toContain("setApertoSenzaScheda");
    expect(archivio).toContain("vettura non piu&apos; in archivio");
  });

  // La concessionaria si dichiara in tutte e due, anche se il database la
  // impone comunque.
  it("tutte e due dichiarano la concessionaria", () => {
    expect(archivio).toContain('.eq("dealer_id", dealerId)');
    expect(vettura).toContain('.eq("dealer_id", idConcessionaria)');
    expect(vettura).toContain('.eq("vehicle_id", vehicleId)');
  });
});
