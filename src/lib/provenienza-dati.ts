/**
 * Da dove viene ogni dato di una scheda, e chi puo' sovrascriverlo.
 *
 * **La regola, decisa dal titolare il 14/09/2026:**
 *
 * > Un dato scritto dal concessionario **non viene mai sovrascritto** dalla
 * > sincronizzazione, nemmeno se il sito cambia idea.
 *
 * **Come si applica, ed e' il punto di tutto questo file.** Non chiedendo a
 * chi scrive di ricordarsene: **non consegnandogli il dato protetto**. Chi
 * sincronizza passa a `scriviDalSito` quello che il sito dice e riceve
 * indietro **solo cio' che puo' scrivere** -- i campi che il concessionario ha
 * scritto a mano non compaiono nel risultato, quindi non c'e' niente da
 * saltare e niente da dimenticare.
 *
 * La differenza non e' di stile. Un controllo **dentro** la sincronizzazione
 * si aggira scrivendo una tredicesima porta che non lo fa: e' esattamente
 * quello che e' successo al tetto del piano, sparso su dodici punti di
 * scrittura. Una funzione che **non restituisce** il campo protetto non si
 * aggira, perche' chi la usa non ha in mano niente da scrivere.
 *
 * **Quando il sito cambia un dato che il concessionario aveva scritto**, il
 * valore non si tocca e il disaccordo **non si butta via**: si registra
 * accanto, in `il_sito_dice`. Un dato che il sito dichiara e noi scartiamo
 * senza lasciare traccia e' indistinguibile da un dato che il sito non ha mai
 * detto -- ed e' la famiglia di difetti piu' ripetuta di questo progetto.
 *
 * Tre regole perche' non diventi rumore: si **sovrascrive** a ogni giro (conta
 * l'ultima cosa che il sito dice, non lo storico); **sparisce da solo** quando
 * il sito torna d'accordo; e **non e' un errore** -- diventera' la riga "il tuo
 * sito ora dice 03/2022, tu avevi scritto 01/2022", con un pulsante per
 * adottarlo se il concessionario vuole.
 */

/** Chi ha messo li' quel valore. */
export type Fonte =
  /** Il sito della concessionaria lo dichiara. */
  | "sito"
  /** Il sistema del concessionario l'ha riempito da solo: vale meno. */
  | "dedotto"
  /**
   * Il feed (o il file) che il concessionario ci manda lo dichiara. Non e'
   * "il sito": la dicitura lo dice, perche' una provenienza sbagliata e'
   * peggio di nessuna provenienza.
   */
  | "feed"
  /** L'ha scritto il concessionario. **Non si sovrascrive mai.** */
  | "dealer";

/** Le fonti che scrivono da sole, e che quindi si fermano davanti a `dealer`. */
export type FonteAutomatica = Exclude<Fonte, "dealer">;

/** Un valore come sta in una colonna di `vehicles`: anche gli elenchi (`equipment`). */
export type Valore = string | number | boolean | string[] | null;

export type SegnoDiProvenienza = {
  fonte: Fonte;
  /** Quando il concessionario l'ha confermato. Assente = e' una proposta. */
  confermato_il?: string | null;
  /** Cosa dice il sito adesso, quando non e' d'accordo con il concessionario. */
  il_sito_dice?: { valore: string; visto_il: string } | null;
};

export type OrigineDati = Record<string, SegnoDiProvenienza>;

/** Un valore letto dal sito, con quanto ci si puo' credere. */
export type LettoDalSito = { valore: Valore; fonte: FonteAutomatica };

export type EsitoScrittura = {
  /** Cosa si puo' scrivere davvero. I campi del concessionario non ci sono. */
  daScrivere: Record<string, Valore>;
  /** Il nuovo `origine_dati` della scheda, gia' pronto da salvare. */
  origineDati: OrigineDati;
  /**
   * I campi che il sito dichiarava e che **non** si sono scritti perche' li ha
   * scritti il concessionario. Serve a raccontarlo nei log, non a decidere.
   */
  protetti: string[];
};

/** Legge il segno di un campo. Un oggetto malformato vale come "mai visto". */
export function provenienza(origineDati: unknown, campo: string): SegnoDiProvenienza | null {
  if (!origineDati || typeof origineDati !== "object" || Array.isArray(origineDati)) return null;
  const segno = (origineDati as Record<string, unknown>)[campo];
  if (!segno || typeof segno !== "object" || Array.isArray(segno)) return null;
  const fonte = (segno as { fonte?: unknown }).fonte;
  if (fonte !== "sito" && fonte !== "dedotto" && fonte !== "feed" && fonte !== "dealer") return null;
  return segno as SegnoDiProvenienza;
}

/** Vero solo se quel campo l'ha scritto il concessionario. */
export function scrittoDalDealer(origineDati: unknown, campo: string): boolean {
  return provenienza(origineDati, campo)?.fonte === "dealer";
}

/**
 * Vero quando il concessionario ha confermato quel campo.
 *
 * **Un dato proposto si mostra ma non si usa**: finche' non e' confermato non
 * entra nella giacenza, non entra nel margine, non entra nella priorita' del
 * tetto del piano e non conta nella completezza. Quello che ha scritto lui e'
 * confermato per definizione: non c'e' niente da approvare.
 */
export function confermato(origineDati: unknown, campo: string): boolean {
  const segno = provenienza(origineDati, campo);
  if (!segno) return false;
  if (segno.fonte === "dealer") return true;
  return Boolean(segno.confermato_il);
}

/**
 * Se due valori sono lo **stesso** valore.
 *
 * Il confronto e' per testo, con una eccezione che conta: quando tutti e due
 * si leggono come numeri si confrontano **come numeri**. Il database
 * restituisce un prezzo come `"9500.00"` e il modulo lo rimanda come `9500`:
 * sono la stessa cifra, e chiamarle diverse fa credere che il concessionario
 * abbia cambiato il prezzo quando non l'ha toccato -- e, nella
 * sincronizzazione, fa registrare un disaccordo che non esiste.
 */
const uguali = (a: unknown, b: unknown) => {
  const testoA = String(a ?? "").trim();
  const testoB = String(b ?? "").trim();
  if (testoA === testoB) return true;
  const numeroA = Number(testoA);
  const numeroB = Number(testoB);
  if (testoA === "" || testoB === "") return false;
  return Number.isFinite(numeroA) && Number.isFinite(numeroB) && numeroA === numeroB;
};

/**
 * Cosa si puo' scrivere, avendo letto il sito.
 *
 * `valoriInArchivio` sono quelli che la scheda ha adesso: servono a capire se
 * il sito sta dicendo una cosa **diversa** da quella scritta dal
 * concessionario, che e' l'unico caso in cui si registra il disaccordo.
 *
 * `oggi` si passa da fuori invece di chiederlo all'orologio, cosi' la stessa
 * chiamata da' sempre lo stesso risultato e il test non dipende dal giorno.
 */
export function scriviDalSito(
  origineDatiAttuale: unknown,
  valoriInArchivio: Record<string, Valore | undefined>,
  lettiDalSito: Record<string, LettoDalSito>,
  oggi: string,
): EsitoScrittura {
  const partenza = (origineDatiAttuale && typeof origineDatiAttuale === "object" && !Array.isArray(origineDatiAttuale)
    ? (origineDatiAttuale as OrigineDati)
    : {}) as OrigineDati;

  const origineDati: OrigineDati = { ...partenza };
  const daScrivere: Record<string, Valore> = {};
  const protetti: string[] = [];

  for (const [campo, letto] of Object.entries(lettiDalSito)) {
    // Il sito non dice niente su questo campo: non e' un motivo per cancellare
    // quello che c'e'.
    if (letto.valore === null || letto.valore === undefined || letto.valore === "") continue;

    const segno = provenienza(origineDati, campo);

    if (segno?.fonte === "dealer") {
      protetti.push(campo);

      // Il disaccordo si registra; il valore no. Quando il sito torna a dire
      // la stessa cosa, il segno sparisce da solo.
      const nuovo: SegnoDiProvenienza = { ...segno };
      if (uguali(valoriInArchivio[campo], letto.valore)) {
        delete nuovo.il_sito_dice;
      } else {
        nuovo.il_sito_dice = { valore: String(letto.valore), visto_il: oggi };
      }
      origineDati[campo] = nuovo;
      continue;
    }

    daScrivere[campo] = letto.valore;
    origineDati[campo] = {
      fonte: letto.fonte,
      // Una conferma gia' data non si perde: il concessionario ha detto di si'
      // a quel campo, e il sito che lo riconferma non gli chiede di rifarlo.
      confermato_il: segno && uguali(valoriInArchivio[campo], letto.valore) ? segno.confermato_il ?? null : null,
    };
  }

  return { daScrivere, origineDati, protetti };
}

/**
 * Comodita' per chi ha gia' un oggetto di valori letti dal sito e vuole
 * passarlo a `scriviDalSito` senza ripetere la fonte per ogni campo.
 *
 * I campi vuoti non si tolgono qui: ci pensa `scriviDalSito`, e la ragione e'
 * la stessa -- "il sito non lo dice" non vuol dire "il sito dice che non c'e'".
 */
export function dalSito(
  valori: Record<string, Valore | undefined>,
  fonte: FonteAutomatica = "sito",
): Record<string, LettoDalSito> {
  const letti: Record<string, LettoDalSito> = {};
  for (const [campo, valore] of Object.entries(valori)) {
    letti[campo] = { valore: valore === undefined ? null : valore, fonte };
  }
  return letti;
}

/** Come si segna un campo scritto dal concessionario. Da qui in poi e' suo. */
export function segnaComeScrittoDalDealer(origineDatiAttuale: unknown, campi: string[]): OrigineDati {
  const partenza = (origineDatiAttuale && typeof origineDatiAttuale === "object" && !Array.isArray(origineDatiAttuale)
    ? (origineDatiAttuale as OrigineDati)
    : {}) as OrigineDati;

  const origineDati: OrigineDati = { ...partenza };
  for (const campo of campi) origineDati[campo] = { fonte: "dealer" };
  return origineDati;
}

/**
 * I campi che stanno **davvero cambiando** rispetto a quello che c'e' in
 * archivio.
 *
 * **Perche' esiste.** Salvando una scheda, il modulo rimanda tutti i suoi
 * campi, toccati o no. Segnarli tutti come "scritti dal concessionario"
 * voleva dire, aprendo un'auto importata e premendo Salva senza cambiare
 * niente: venticinque campi che dicono "scritto da te" su numeri che ha
 * scritto il sito, tutti i disaccordi cancellati e tutte le conferme perse.
 * Finche' nessuna schermata mostrava la provenienza non si vedeva; il giorno
 * che la mostra, diventa una bugia su ogni riga della scheda (18/09/2026).
 *
 * Un campo non toccato **non si tocca**: il suo segno resta com'era, con la
 * sua fonte, la sua conferma e il suo eventuale disaccordo.
 */
export function campiDavveroCambiati(
  valoriInArchivio: Record<string, unknown> | null | undefined,
  valoriDaSalvare: Record<string, unknown>,
  daIgnorare: readonly string[] = [],
): string[] {
  const archivio = valoriInArchivio ?? {};
  const fuori = new Set(daIgnorare);
  return Object.keys(valoriDaSalvare).filter(
    (campo) => !fuori.has(campo) && !uguali(archivio[campo], valoriDaSalvare[campo]),
  );
}

/** La dicitura da mettere accanto al valore. Un numero non si mostra mai nudo. */
export function etichettaProvenienza(origineDati: unknown, campo: string): string | null {
  const segno = provenienza(origineDati, campo);
  if (!segno) return null;
  if (segno.fonte === "dealer") return "scritto da te";
  const daConfermare = segno.confermato_il ? "" : " · da confermare";
  if (segno.fonte === "feed") return `dal tuo feed${daConfermare}`;
  return segno.fonte === "sito" ? `dal tuo sito${daConfermare}` : `deciso dal tuo sito${daConfermare}`;
}
