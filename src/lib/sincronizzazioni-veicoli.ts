/**
 * Il riepilogo delle sincronizzazioni, ricavato dagli annunci veri.
 *
 * Questo progetto **non tiene un registro delle importazioni**: non esiste
 * nessuna tabella che dica "il 3 settembre alle 22 sono arrivate 27 auto".
 * Quello che esiste, su ogni annuncio, e' da dove viene e quando e' stato
 * visto l'ultima volta sul sito di origine (`import_source`,
 * `import_synced_at`, `import_missing_since`), scritti dall'importazione dal
 * sito e dalla sincronizzazione notturna.
 *
 * Da li' si ricava una cosa vera e utile: per ogni sito collegato, quando e'
 * stato sincronizzato l'ultima volta, quanti annunci ne arrivano e quanti non
 * ci sono piu'. Non e' lo storico delle singole importazioni -- quello non
 * esiste, e finche' non esiste non si mostra.
 */

export type RigaVeicoloImportato = {
  import_source: string | null;
  import_synced_at: string | null;
  import_missing_since: string | null;
};

export type OrigineSincronizzata = {
  /** Il sito da cui arrivano gli annunci, per esempio "www.concessionaria.it". */
  fonte: string;
  /** Quando e' stato sincronizzato l'ultima volta, o `null` se non risulta. */
  ultimaSincronizzazione: string | null;
  /** Quanti annunci arrivano da quel sito. */
  annunci: number;
  /** Di quelli, quanti il sito non dichiara piu'. */
  nonPiuSulSito: number;
};

function quando(valore: string | null): number | null {
  if (!valore) return null;
  const istante = Date.parse(valore);
  return Number.isNaN(istante) ? null : istante;
}

/**
 * Raggruppa gli annunci per sito di origine.
 *
 * Le righe senza origine sono annunci inseriti a mano: non appartengono a
 * nessuna sincronizzazione e restano fuori.
 */
export function riepilogaSincronizzazioni(righe: RigaVeicoloImportato[]): OrigineSincronizzata[] {
  const perFonte = new Map<string, OrigineSincronizzata>();

  for (const riga of righe) {
    const fonte = String(riga.import_source ?? "").trim();
    if (!fonte) continue;

    const corrente = perFonte.get(fonte) ?? {
      fonte,
      ultimaSincronizzazione: null,
      annunci: 0,
      nonPiuSulSito: 0,
    };

    corrente.annunci += 1;
    if (riga.import_missing_since) corrente.nonPiuSulSito += 1;

    const questa = quando(riga.import_synced_at);
    const finora = quando(corrente.ultimaSincronizzazione);
    if (questa !== null && (finora === null || questa > finora)) {
      corrente.ultimaSincronizzazione = riga.import_synced_at;
    }

    perFonte.set(fonte, corrente);
  }

  // La sincronizzazione piu' recente per prima; i siti senza data in fondo,
  // in ordine alfabetico, perche' "non risulta" non e' "molto tempo fa".
  return [...perFonte.values()].sort((a, b) => {
    const qa = quando(a.ultimaSincronizzazione);
    const qb = quando(b.ultimaSincronizzazione);
    if (qa === null && qb === null) return a.fonte.localeCompare(b.fonte);
    if (qa === null) return 1;
    if (qb === null) return -1;
    return qb - qa;
  });
}
