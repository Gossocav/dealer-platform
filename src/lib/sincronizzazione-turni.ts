/**
 * I turni della sincronizzazione notturna: chi lavora, in che ordine, quando
 * fermarsi, e cosa vuol dire "c'e' ancora da fare".
 *
 * **Il difetto che questo file corregge.** Dal 07/09/2026 il sito di Autogepy
 * ha risposto "troppe richieste" (HTTP 429) a quasi ogni scheda. Il lavoro
 * periodico dava a ogni sito la sua fetta di tempo, e Autogepy la bruciava
 * tutta in letture fallite: prima le stesse tredici auto "nuove" -- mai
 * importate perche' la pagina non si leggeva -- poi le stesse venticinque
 * schede da rileggere, che non venivano segnate e restavano in testa alla
 * fila. Zero progresso per tre giorni, e nessuno che lo dicesse: un flag
 * unico ("ancora da fare") restava acceso per sempre, ogni run andava al
 * tetto delle venti chiamate, e il riepilogo era verde.
 *
 * Qui non c'e' rete ne' database: ci sono le regole, e i test le provano con
 * un sito finto che non risponde mai.
 */

export const FALLIMENTI_CONSECUTIVI_MAX = 3;

/** Oltre queste ore senza una scheda riletta, il lavoro periodico diventa rosso. */
export const ORE_MASSIME_SENZA_AGGIORNAMENTO = 24;

/** Quante schede fallite si ricordano per sito, fra una chiamata e l'altra. */
const SALTATE_MASSIME_PER_SITO = 200;

/**
 * Quello che una chiamata passa alla successiva. L'endpoint non ha memoria:
 * ogni chiamata e' un processo nuovo. Il progresso di un sito grande sta gia'
 * nel database (`import_synced_at` manda in fondo alla fila le schede
 * rilette); quello che il database non sa e' **cosa e' gia' fallito in
 * questo run**, e da quale sito si e' cominciato l'ultima volta.
 */
export type Cursore = {
  /** La chiave del sito che ha avuto il primo turno nella chiamata precedente. */
  dopo: string | null;
  /** Per sito, gli identificativi delle schede fallite in questo run: non si ritentano. */
  saltate: Record<string, string[]>;
};

export const CURSORE_VUOTO: Cursore = { dopo: null, saltate: {} };

export function chiaveSorgente(sorgente: { dealer_id: string; import_source: string }) {
  return `${sorgente.dealer_id}|${sorgente.import_source}`;
}

/** Legge un cursore arrivato dall'esterno senza fidarsi della sua forma. */
export function leggiCursore(grezzo: unknown): Cursore {
  if (!grezzo || typeof grezzo !== "object") return CURSORE_VUOTO;
  const oggetto = grezzo as Record<string, unknown>;
  const dopo = typeof oggetto.dopo === "string" && oggetto.dopo.trim() ? oggetto.dopo.trim() : null;
  const saltate: Record<string, string[]> = {};
  if (oggetto.saltate && typeof oggetto.saltate === "object") {
    for (const [chiave, valore] of Object.entries(oggetto.saltate as Record<string, unknown>)) {
      if (!Array.isArray(valore)) continue;
      const ids = valore.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (ids.length > 0) saltate[chiave] = ids.slice(-SALTATE_MASSIME_PER_SITO);
    }
  }
  return { dopo, saltate };
}

export function aggiungiSaltate(cursore: Cursore, chiave: string, ids: readonly string[]): Cursore {
  if (ids.length === 0) return cursore;
  const unite = [...new Set([...(cursore.saltate[chiave] ?? []), ...ids])].slice(-SALTATE_MASSIME_PER_SITO);
  return { ...cursore, saltate: { ...cursore.saltate, [chiave]: unite } };
}

/**
 * Lo stesso elenco, ma a partire dall'elemento **dopo** `dopo`.
 *
 * Il primo turno e' il piu' ricco: ha davanti tutto il tempo che il primo
 * passo ha lasciato. Se fosse sempre dello stesso sito, gli altri vivrebbero
 * di avanzi. Se `dopo` non c'e' piu' -- un sito scollegato -- si riparte
 * dall'inizio.
 */
export function ordinaARotazione<T>(elenco: readonly T[], chiaveDi: (elemento: T) => string, dopo: string | null): T[] {
  if (!dopo || elenco.length < 2) return [...elenco];
  const indice = elenco.findIndex((elemento) => chiaveDi(elemento) === dopo);
  if (indice < 0) return [...elenco];
  return [...elenco.slice(indice + 1), ...elenco.slice(0, indice + 1)];
}

export type EsitoLetturaFila = { ok: true; html: string } | { ok: false; motivo: "frenato" | "non-letta" };

/**
 * Cosa fare con una pagina letta. `fermati` e' per il tetto del piano: se
 * non c'e' posto per una, non c'e' per nessuna. `saltata` e' una scheda che
 * non si importa (senza prezzo, un noleggio): non e' un guasto del sito.
 */
export type EsitoElaborazione = "fatta" | "saltata" | "fermati";

export type EsitoFila = {
  /** Schede lette e scritte. */
  fatte: number;
  /** Schede prese in mano, riuscite o no. */
  esaminate: number;
  /** Identificativi delle schede la cui pagina non si e' letta. */
  fallite: string[];
  /**
   * Perche' ci si e' fermati prima della fine, se ci si e' fermati:
   * - `freno`: il sito ha risposto 429. Si smette subito: continuare e'
   *   quello che ci chiede di non fare, e il tempo va agli altri siti.
   * - `letture-fallite`: tre pagine di fila non lette. Il sito e' giu', o ci
   *   rifiuta: stessa conclusione.
   * - `tetto`: il piano non ha piu' posto.
   */
  fermataPer: null | "freno" | "letture-fallite" | "tetto";
  /** Il tempo e' finito prima della fine della fila. */
  interrotta: boolean;
  /** Quante ne restano per un'altra chiamata. Con il tetto del piano, nessuna. */
  restanti: number;
};

/**
 * Percorre una fila di schede finche' c'e' tempo, il sito risponde e c'e'
 * posto. Non sa niente di rete o database: chi la chiama passa `leggi` ed
 * `elabora`, e nei test sono finti.
 */
export async function percorriFila<T extends { sourceId: string }>(input: {
  voci: readonly T[];
  scaduto: () => boolean;
  leggi: (voce: T) => Promise<EsitoLetturaFila>;
  elabora: (voce: T, html: string) => Promise<EsitoElaborazione>;
  pausa?: () => Promise<void>;
}): Promise<EsitoFila> {
  const esito: EsitoFila = { fatte: 0, esaminate: 0, fallite: [], fermataPer: null, interrotta: false, restanti: 0 };
  const pausa = input.pausa ?? (async () => {});
  let falliteDiFila = 0;

  for (const voce of input.voci) {
    if (input.scaduto()) {
      esito.interrotta = true;
      break;
    }

    esito.esaminate += 1;
    const letto = await input.leggi(voce);

    if (!letto.ok) {
      esito.fallite.push(voce.sourceId);
      if (letto.motivo === "frenato") {
        esito.fermataPer = "freno";
        break;
      }
      falliteDiFila += 1;
      if (falliteDiFila >= FALLIMENTI_CONSECUTIVI_MAX) {
        esito.fermataPer = "letture-fallite";
        break;
      }
      await pausa();
      continue;
    }

    falliteDiFila = 0;
    const elaborata = await input.elabora(voce, letto.html);
    if (elaborata === "fermati") {
      esito.fermataPer = "tetto";
      break;
    }
    if (elaborata === "fatta") esito.fatte += 1;
    await pausa();
  }

  // Le fallite restano da fare: la prossima chiamata le salta grazie al
  // cursore, ma il run dopo le ritenta.
  esito.restanti = esito.fermataPer === "tetto" ? 0 : Math.max(0, input.voci.length - esito.esaminate + esito.fallite.length);
  return esito;
}

/**
 * Se vale la pena richiamare per questo sito.
 *
 * Non basta che resti qualcosa da fare: deve esserci **progresso**. Un sito
 * che in questa chiamata non ha portato a casa niente -- perche' frena,
 * perche' e' giu' -- alla prossima fara' lo stesso, e tenere acceso il flag
 * per lui vuol dire venti chiamate a vuoto e un riepilogo che dice "fermata
 * al tetto" per sempre. L'eccezione e' il sito che non ha nemmeno iniziato,
 * perche' il tempo era finito prima: alla prossima chiamata la rotazione lo
 * mette per primo.
 */
export function serveAncora(esito: Pick<EsitoFila, "restanti" | "fatte" | "esaminate">): boolean {
  if (esito.restanti <= 0) return false;
  return esito.fatte > 0 || esito.esaminate === 0;
}

export type SitoInRitardo = {
  sito: string;
  dealerId: string;
  ultimaSincronizzazione: string | null;
  /** `null` quando non e' mai stato sincronizzato. */
  oreDiRitardo: number | null;
};

/**
 * I siti fermi da troppo. E' quello che manca al riepilogo: un sito che non
 * viene aggiornato da tre giorni non e' un dettaglio dentro un JSON, e' un
 * lavoro che non sta facendo quello per cui esiste.
 */
export function sitiInRitardo(
  esiti: ReadonlyArray<{ sito: string; dealerId: string; ultimaSincronizzazione: string | null }>,
  adesso: Date,
  oreMassime = ORE_MASSIME_SENZA_AGGIORNAMENTO,
): SitoInRitardo[] {
  const inRitardo: SitoInRitardo[] = [];
  for (const esito of esiti) {
    const istante = esito.ultimaSincronizzazione ? Date.parse(esito.ultimaSincronizzazione) : Number.NaN;
    if (Number.isNaN(istante)) {
      inRitardo.push({ ...esito, oreDiRitardo: null });
      continue;
    }
    const ore = (adesso.getTime() - istante) / 3_600_000;
    if (ore > oreMassime) inRitardo.push({ ...esito, oreDiRitardo: Math.floor(ore) });
  }
  return inRitardo;
}
