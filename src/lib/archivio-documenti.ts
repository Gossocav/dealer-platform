/**
 * L'archivio dei documenti di una vettura.
 *
 * Chiesto dal titolare il 03/09/2026: libretto, preventivi, contratti,
 * fatture, revisioni. Con due requisiti che decidono il disegno -- si archivia
 * in qualunque stato si trovi la vettura, e i documenti restano anche dopo che
 * e' stata venduta **o cancellata**.
 *
 * L'elenco dei tipi vive qui e nel vincolo della tabella. Sono due posti e
 * devono restare uguali: un tipo che la tendina offre e il database rifiuta si
 * scoprirebbe solo al momento di salvare, con il documento gia' caricato.
 * C'e' un test che li confronta riga per riga, e che legge il vincolo
 * **dall'ultima** migration che lo ridefinisce -- non dalla prima: quella
 * dice come era l'elenco il giorno che l'archivio e' nato, non com'e' adesso.
 */

import { perRicercaParziale } from "@/lib/ricerca-testo";

export type TipoDocumento = {
  valore: string;
  etichetta: string;
};

export const TIPI_DOCUMENTO: readonly TipoDocumento[] = [
  { valore: "libretto", etichetta: "Libretto di circolazione" },
  { valore: "certificato_proprieta", etichetta: "Certificato di proprieta'" },
  { valore: "contratto_acquisto", etichetta: "Contratto di acquisto" },
  { valore: "contratto_vendita", etichetta: "Contratto di vendita" },
  { valore: "preventivo", etichetta: "Preventivo" },
  { valore: "fattura", etichetta: "Fattura" },
  { valore: "assicurazione", etichetta: "Assicurazione" },
  { valore: "bollo", etichetta: "Bollo" },
  { valore: "revisione", etichetta: "Revisione" },
  { valore: "tagliando", etichetta: "Tagliando o manutenzione" },
  { valore: "perizia", etichetta: "Perizia" },
  { valore: "garanzia", etichetta: "Garanzia" },
  { valore: "passaggio_proprieta", etichetta: "Passaggio di proprieta'" },
  { valore: "altro", etichetta: "Altro" },
] as const;

export function etichettaTipoDocumento(valore: string | null | undefined) {
  const cercato = String(valore ?? "").trim();
  return TIPI_DOCUMENTO.find((tipo) => tipo.valore === cercato)?.etichetta ?? "Altro";
}

/** Il secchio dove finiscono i file. */
export const SECCHIO_DOCUMENTI = "vehicle-documents";

/**
 * Dieci megabyte per file, lo stesso limite che impone il secchio.
 *
 * Scritto anche qui e non solo nel database perche' il rifiuto deve arrivare
 * **prima** del caricamento: scoprire che il file e' troppo grande dopo aver
 * aspettato il caricamento di venti megabyte su rete mobile e' il modo piu'
 * rapido per far rinunciare qualcuno.
 */
export const DIMENSIONE_MASSIMA_BYTE = 10 * 1024 * 1024;

/** I tipi che il browser sa mostrare: un file che si scarica ma non si apre non e' archiviato, e' perso. */
export const TIPI_FILE_AMMESSI = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/**
 * Dice se un file si puo' archiviare, e se no perche'.
 *
 * Torna la frase da mostrare, non un codice: chi la legge deve capire cosa
 * fare, e "formato non valido" non gli dice quali formati vanno bene.
 */
export function motivoRifiutoFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size > DIMENSIONE_MASSIMA_BYTE) {
    const megabyte = (file.size / 1024 / 1024).toFixed(1);
    return `"${file.name}" pesa ${megabyte} MB: il massimo e' 10 MB. Se e' una fotografia, rifalla a risoluzione piu' bassa; se e' un PDF con molte pagine, dividilo.`;
  }

  if (file.size === 0) {
    return `"${file.name}" e' vuoto: il caricamento non e' andato a buon fine.`;
  }

  if (!(TIPI_FILE_AMMESSI as readonly string[]).includes(file.type)) {
    return `"${file.name}" non e' un formato che si puo' archiviare. Vanno bene PDF, JPG, PNG e WEBP: se hai un documento Word o Excel, stampalo in PDF.`;
  }

  return null;
}

/**
 * Dove finisce il file dentro il secchio.
 *
 * La prima cartella e' la concessionaria, ed e' quella su cui il database
 * decide chi puo' leggere e scrivere: cambiarla vorrebbe dire cambiare anche
 * le politiche dei file. La seconda e' la vettura, cosi' l'archivio si sfoglia
 * anche da fuori senza cercare in un mucchio unico.
 *
 * Il nome del file viene ripulito ma **conservato**: chi apre l'archivio fra
 * due anni deve riconoscere "contratto-rossi.pdf", non un codice.
 */
export function percorsoDocumento(dealerId: string, vehicleId: string | null, nomeFile: string) {
  const pulito = nomeFile
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);

  const nome = pulito.length > 0 ? pulito : "documento";
  const cartellaVettura = vehicleId ?? "senza-vettura";

  return `${dealerId}/${cartellaVettura}/${crypto.randomUUID()}-${nome}`;
}

export type FiltriDocumenti = {
  targa?: string;
  tipo?: string;
  dal?: string;
  al?: string;
  testo?: string;
};

function testoPulito(valore: string | null | undefined) {
  const pulito = String(valore ?? "").trim();
  return pulito.length > 0 ? pulito : undefined;
}

/**
 * Ripulisce i campi di ricerca. Stesse due regole della ricerca delle perizie:
 * un campo vuoto non e' un filtro, e le date scritte al contrario si
 * raddrizzano invece di non trovare niente.
 */
export function normalizzaFiltriDocumenti(grezzi: {
  targa?: string | null;
  tipo?: string | null;
  dal?: string | null;
  al?: string | null;
  testo?: string | null;
}): FiltriDocumenti {
  let dal = testoPulito(grezzi.dal);
  let al = testoPulito(grezzi.al);

  if (dal && al && dal > al) {
    [dal, al] = [al, dal];
  }

  return {
    targa: testoPulito(grezzi.targa),
    tipo: testoPulito(grezzi.tipo),
    dal,
    al,
    testo: testoPulito(grezzi.testo),
  };
}

export function ricercaDocumentiInCorso(filtri: FiltriDocumenti) {
  return Object.values(filtri).some((valore) => valore !== undefined);
}

/**
 * Il pezzo di condizione che cerca dentro titolo, note e nome del file.
 *
 * Tre colonne e non una: chi cerca "Rossi" puo' averlo scritto nel titolo, o
 * nelle note, o averlo nel nome del file scaricato dal commercialista, e non
 * si ricorda quale.
 */
export function condizioneTestoLibero(testo: string) {
  const parziale = perRicercaParziale(testo);
  return `title.ilike.${parziale},notes.ilike.${parziale},file_name.ilike.${parziale}`;
}

/** Il peso di un file come si legge a schermo. */
export function pesoLeggibile(byte: number | null | undefined) {
  const n = typeof byte === "number" && Number.isFinite(byte) ? byte : null;
  if (n === null || n <= 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type DocumentoRaggruppabile = {
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_label: string | null;
  doc_type: string | null;
  document_date: string | null;
  created_at: string;
};

export type VetturaConDocumenti = {
  /** La chiave con cui si raggruppa: l'identificativo se c'e', altrimenti la targa. */
  chiave: string;
  vehicleId: string | null;
  targa: string | null;
  etichetta: string | null;
  quanti: number;
  /** L'ultima volta che e' stato archiviato qualcosa su questa vettura. */
  ultimoCaricamento: string;
  /** I tipi presenti, per far vedere a colpo d'occhio cosa c'e' e cosa manca. */
  tipi: string[];
};

/**
 * Raggruppa i documenti per vettura.
 *
 * L'archivio si sfoglia per automobile e non per documento: chiesto dal
 * titolare il 03/09/2026, dopo aver visto la prima versione. Ed e' come si
 * cerca davvero -- "i documenti della Panda targata AB123CD", non "tutti i
 * contratti che ho".
 *
 * **La chiave e' l'identificativo del veicolo se c'e', altrimenti la targa.**
 * Quando una vettura viene cancellata i suoi documenti restano ma perdono
 * l'identificativo: raggrupparli per quello li butterebbe tutti in un mucchio
 * unico insieme a quelli di ogni altra vettura cancellata. La targa li tiene
 * distinti, ed e' l'unica cosa che resta.
 */
export function raggruppaPerVettura(documenti: readonly DocumentoRaggruppabile[]): VetturaConDocumenti[] {
  const gruppi = new Map<string, VetturaConDocumenti>();

  for (const documento of documenti) {
    const targa = String(documento.vehicle_plate ?? "").trim().toUpperCase() || null;
    const chiave = documento.vehicle_id ?? (targa ? `targa:${targa}` : "senza-vettura");

    const gruppo = gruppi.get(chiave) ?? {
      chiave,
      vehicleId: documento.vehicle_id,
      targa,
      etichetta: documento.vehicle_label?.trim() || null,
      quanti: 0,
      ultimoCaricamento: documento.created_at,
      tipi: [],
    };

    gruppo.quanti += 1;
    if (documento.created_at > gruppo.ultimoCaricamento) gruppo.ultimoCaricamento = documento.created_at;
    if (!gruppo.etichetta && documento.vehicle_label?.trim()) gruppo.etichetta = documento.vehicle_label.trim();

    const tipo = String(documento.doc_type ?? "altro");
    if (!gruppo.tipi.includes(tipo)) gruppo.tipi.push(tipo);

    gruppi.set(chiave, gruppo);
  }

  // In cima la vettura su cui si e' archiviato per ultimo: e' quella su cui si
  // sta lavorando adesso, ed e' quasi sempre quella che si sta cercando.
  return [...gruppi.values()].sort((a, b) => b.ultimoCaricamento.localeCompare(a.ultimoCaricamento));
}
