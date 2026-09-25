/**
 * Le regole della copia delle foto nel nostro archivio, senza rete e senza
 * database: si provano una per una.
 *
 * Il perche' di ogni regola sta in `supabase/MIGRAZIONI.md`, "Le foto stanno
 * su un server non nostro", con i numeri delle regole citati qui accanto.
 * Il programma che le esegue e' `src/app/api/cron/copia-foto/route.ts`.
 */
import { SOGLIE_COPIA_FOTO } from "@/lib/copia-foto-soglie";

const ORA = 3600 * 1000;
const GIORNO = 24 * ORA;

/** Una foto della coda, con quello che serve sapere della sua auto. */
export type FotoInCoda = {
  id: string;
  vehicle_id: string;
  dealer_id: string;
  image_url: string;
  origine_url: string;
  position: number | null;
  is_cover: boolean | null;
  copia_esito: string | null;
  copia_tentativi: number;
  copia_primo_tentativo: string | null;
  copia_ultimo_tentativo: string | null;
  copia_primo_non_esiste: string | null;
  inVetrina: boolean;
  uscitaDalSito: boolean;
};

/** Il server delle foto: e' lui che si guasta, non la concessionaria. */
export function serverDellaFoto(origine: string): string {
  try {
    return new URL(origine).host.toLowerCase();
  } catch {
    return "(indirizzo illeggibile)";
  }
}

/**
 * Regola 1: l'ordine della coda.
 *
 * Prima le mai provate: le copertine delle auto in vetrina, poi il resto della
 * vetrina, poi le altre. Poi le rinviate da un giro frenato, poi le gia'
 * fallite, dalla meno recente. Le foto delle auto uscite dal sito **e fuori
 * vetrina** escono dalla coda (non dalla tabella): DealerK cancella le loro
 * foto, e i loro 404 veri consumerebbero il tetto delle morte per auto che
 * nessuno vede. "E fuori vetrina" l'ha chiesto la prova sui dati veri del
 * 25/09/2026: un'Alfa Romeo Tonale segnata uscita dal sito dal 29/08 era
 * ancora in vetrina, e le sue foto -- visibili a tutti -- sarebbero rimaste su
 * DealerK.
 */
export function ordinaCoda(foto: readonly FotoInCoda[]): FotoInCoda[] {
  const gruppo = (f: FotoInCoda) => {
    const maiProvata = f.copia_ultimo_tentativo === null;
    if (maiProvata && f.inVetrina && f.is_cover) return 0;
    if (maiProvata && f.inVetrina) return 1;
    if (maiProvata) return 2;
    if (f.copia_esito === null) return 3; // rinviata da un giro frenato
    return 4; // gia' fallita
  };
  return foto
    .filter((f) => !f.uscitaDalSito || f.inVetrina)
    .map((f) => ({ f, g: gruppo(f) }))
    .sort((a, b) => {
      if (a.g !== b.g) return a.g - b.g;
      if (a.g >= 3) return String(a.f.copia_ultimo_tentativo).localeCompare(String(b.f.copia_ultimo_tentativo));
      if (a.f.vehicle_id !== b.f.vehicle_id) return a.f.vehicle_id.localeCompare(b.f.vehicle_id);
      return (a.f.position ?? 0) - (b.f.position ?? 0);
    })
    .map(({ f }) => f);
}

/** Com'e' andato il tentativo su una foto, visto dall'origine. */
export type RisultatoTentativo =
  | { tipo: "copiata"; sha256: string; byte: number; percorso: string }
  /** 404 o 410, riconfermato con un parametro casuale nell'indirizzo. */
  | { tipo: "non-esiste"; stato: number }
  /** Il server ci chiede di smettere: 429, o 403 con Retry-After. */
  | { tipo: "fermati"; stato: number }
  /** Non raggiunta: 403, errore del server, tempo scaduto, dominio che non si trova. */
  | { tipo: "non-raggiunta"; motivo: string }
  /** Ha risposto, ma non era la foto: non un'immagine, troppo piccola, un segnaposto. */
  | { tipo: "non-era-la-foto"; motivo: string };

/**
 * Regola 2: come si legge una risposta. Solo 404 e 410 vogliono dire "non
 * esiste"; il primo 429, o un 403 con `Retry-After`, e' una richiesta esplicita
 * di smettere.
 */
export function leggiRisposta(risposta: { stato: number; retryAfter: boolean; mitigata: boolean }): "da-verificare" | "non-esiste" | "fermati" | "non-raggiunta" {
  if (risposta.stato >= 200 && risposta.stato < 300) return "da-verificare";
  if (risposta.stato === 404 || risposta.stato === 410) return "non-esiste";
  if (risposta.stato === 429) return "fermati";
  if (risposta.stato === 403 && (risposta.retryAfter || risposta.mitigata)) return "fermati";
  return "non-raggiunta";
}

/**
 * Regola 3: le sentinelle. Tre esiti, e il terzo ha un nome.
 *
 * Contano solo le risposte che non vengono dalla memoria di Cloudflare: senza
 * parametro casuale risponde la memoria (`HIT`) e DealerK non viene nemmeno
 * interpellato (verificato il 25/09/2026).
 */
export type VerdettoSentinelle = "sano" | "non-risponde" | "sconosciuto";

export function verdettoSentinelle(risposte: ReadonlyArray<{ ok: boolean; dallaMemoria: boolean }>): VerdettoSentinelle {
  const vere = risposte.filter((r) => !r.dallaMemoria);
  if (vere.length < SOGLIE_COPIA_FOTO.sentinelle) return "sconosciuto";
  const riuscite = vere.filter((r) => r.ok).length;
  return riuscite >= SOGLIE_COPIA_FOTO.sentinelleSane ? "sano" : "non-risponde";
}

/**
 * Regola 4: il freno di giro. Misura **le novita'**: non contano i fallimenti
 * delle foto gia' fallite prima, ne' i "non esiste" su un server sano.
 */
export function frenoScattato(conti: { tentativi: number; fallimentiNuovi: number }): boolean {
  return (
    conti.tentativi >= SOGLIE_COPIA_FOTO.frenoTentativiMinimi &&
    conti.fallimentiNuovi >= SOGLIE_COPIA_FOTO.frenoFalliteMinime &&
    conti.fallimentiNuovi > conti.tentativi * SOGLIE_COPIA_FOTO.frenoQuota
  );
}

/** Una foto e' "nuova" per il freno se non era mai fallita prima. */
export function eNuovaPerIlFreno(f: Pick<FotoInCoda, "copia_tentativi" | "copia_primo_non_esiste">): boolean {
  return f.copia_tentativi === 0 && f.copia_primo_non_esiste === null;
}

/**
 * Cosa scrivere su una foto che non si e' copiata, a fine giro, per server.
 *
 * - giro **non valido** (freno scattato, sentinelle "non risponde", server
 *   che ci ha chiesto di fermarci): solo la data, per far ruotare la coda;
 *   nessun tentativo consumato, nessun esito cambiato;
 * - "non esiste" con il server **sano**: la prima volta si segna quando
 *   (`copia_primo_non_esiste`); dopo almeno 24 ore, se le morte sono
 *   abilitate e il tetto lo consente, `sorgente-morta`; altrimenti aspetta,
 *   **senza consumare tentativi** (regole 5 e 6);
 * - qualunque altro fallimento: un tentativo in piu', `non-riuscita`, e il
 *   conto dei "non esiste" azzerato; dopo 16 tentativi e 7 giorni,
 *   `tentativi-esauriti` (regola 6).
 */
export type Scrittura = Record<string, string | number | null>;

export function scritturaDopoIlFallimento(
  foto: Pick<FotoInCoda, "copia_tentativi" | "copia_primo_tentativo" | "copia_primo_non_esiste">,
  risultato: Exclude<RisultatoTentativo, { tipo: "copiata" }>,
  contesto: { giroValido: boolean; sentinelle: VerdettoSentinelle; adesso: Date; morteAbilitate: boolean; postiMorteRestanti: number },
): { valori: Scrittura; mortaQui: boolean } {
  const adesso = contesto.adesso.toISOString();

  if (!contesto.giroValido || risultato.tipo === "fermati") {
    return { valori: { copia_ultimo_tentativo: adesso }, mortaQui: false };
  }

  if (risultato.tipo === "non-esiste" && contesto.sentinelle === "sano") {
    const primo = foto.copia_primo_non_esiste;
    const trascorso = primo ? contesto.adesso.getTime() - new Date(primo).getTime() : 0;
    if (primo && trascorso >= SOGLIE_COPIA_FOTO.oreFraIDueNonEsiste * ORA && contesto.morteAbilitate && contesto.postiMorteRestanti > 0) {
      return {
        valori: {
          copia_esito: "sorgente-morta",
          copia_tentativi: Math.max(1, foto.copia_tentativi),
          copia_primo_tentativo: foto.copia_primo_tentativo ?? adesso,
          copia_ultimo_tentativo: adesso,
          copia_ultimo_motivo: String(risultato.stato),
        },
        mortaQui: true,
      };
    }
    return {
      valori: {
        copia_primo_non_esiste: primo ?? adesso,
        copia_ultimo_tentativo: adesso,
        copia_ultimo_motivo: String(risultato.stato),
      },
      mortaQui: false,
    };
  }

  const tentativi = foto.copia_tentativi + 1;
  const primo = foto.copia_primo_tentativo ?? adesso;
  const giorniDalPrimo = (contesto.adesso.getTime() - new Date(primo).getTime()) / GIORNO;
  const esaurita = tentativi >= SOGLIE_COPIA_FOTO.tentativiPerEsaurire && giorniDalPrimo >= SOGLIE_COPIA_FOTO.giorniPerEsaurire;
  const motivo = risultato.tipo === "non-esiste" ? String(risultato.stato) : risultato.motivo;

  return {
    valori: {
      copia_esito: esaurita ? "tentativi-esauriti" : "non-riuscita",
      copia_tentativi: tentativi,
      copia_primo_tentativo: primo,
      copia_ultimo_tentativo: adesso,
      copia_ultimo_motivo: motivo.slice(0, 200),
      copia_primo_non_esiste: null,
    },
    mortaQui: false,
  };
}

/** La promemoria dell'appuntamento: da quel giorno in poi, in ogni riepilogo. */
export function promemoriaAppuntamento(adesso: Date, dataVerifica: string | null): string | null {
  if (!dataVerifica) return null;
  if (adesso.getTime() < new Date(`${dataVerifica}T00:00:00Z`).getTime()) return null;
  return `Da ${dataVerifica}: si rileggono i numeri della copia delle foto contro il tasso vero (supabase/MIGRAZIONI.md, "L'appuntamento"). Compilata la tabella, si toglie la data da src/lib/copia-foto-soglie.ts.`;
}
