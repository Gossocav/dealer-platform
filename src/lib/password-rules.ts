/**
 * Le regole della password: quali caratteri deve avere, e quanto dura.
 *
 * Stanno qui e non dentro la pagina perche' i posti che le devono conoscere
 * sono tre -- la schermata dove si sceglie la password, il guscio del
 * gestionale che avvisa quando sta per scadere, e i test -- e tre copie di
 * una regola divergono al primo cambiamento.
 *
 * **Quello che si vede qui non e' l'ultima parola.** Queste regole vivono nel
 * browser: servono a far scrivere una password buona senza scoprirlo da un
 * errore dopo l'invio. La regola che nessuno puo' aggirare e' quella scritta
 * nelle impostazioni di Supabase, dove al 02/09/2026 il minimo era di sei
 * caratteri e nient'altro. Le due vanno tenute allineate: se Supabase chiede
 * piu' di quello che la pagina mostra, il concessionario vede tutte le spunte
 * verdi e si prende un rifiuto scritto in inglese.
 */

/**
 * I simboli che contano come "carattere speciale".
 *
 * **Non e' un elenco scelto da noi: e' quello di Supabase**, letto dal
 * messaggio che il server manda quando rifiuta una password
 * (`!@#$%^&*()_+-=[]{};'\:"|<>?,./` piu' apice inverso e tilde). Accettarne
 * di piu' sarebbe la trappola peggiore: il concessionario vedrebbe tutte le
 * spunte verdi e si prenderebbe comunque un rifiuto scritto in inglese.
 *
 * Il simbolo dell'euro, per dirne uno, **non** e' nell'elenco -- ed era finito
 * negli esempi mostrati a schermo il 02/09/2026, prima che questa verifica
 * esistesse. Lo spazio nemmeno: una password con dentro uno spazio sembrerebbe
 * a posto per sbaglio, e chi l'ha scritta non saprebbe di averlo messo.
 */
const CARATTERI_SPECIALI = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

/**
 * Il tetto di lunghezza, che non e' una scelta di prodotto ma un fatto tecnico.
 *
 * Supabase custodisce le password con bcrypt, che **ignora tutto oltre il
 * settantaduesimo byte**: piu' che accettarla lunga, il server la rifiuta, e lo
 * fa nel modo peggiore -- non con "password troppo lunga", ma con un
 * `500 Internal Server Error` senza spiegazioni.
 *
 * **Il difetto che questo numero impedisce, misurato in produzione il
 * 14/09/2026.** Dal 2 settembre alle 18:38 nessuna attivazione di concessionaria
 * riusciva piu'. La password provvisoria creata dall'attivazione era diventata
 * di 91 byte:
 *
 *     Ka1! + uuid + "-" + uuid maiuscolo + "-" + orario   =  91 byte
 *
 * Provata sul server vero: a 91 byte risponde 500, a 40 byte crea l'utente.
 * L'attivazione si fermava li', lasciando la concessionaria a meta' -- creata
 * ma senza utente, senza profilo, senza abbonamento -- e ogni nuovo tentativo
 * ricadeva nello stesso punto. L'ultima attivazione riuscita, Ponginibbi, e'
 * delle 14:55 dello stesso giorno: tre ore e quaranta prima della modifica.
 *
 * Vale anche per chi sceglie la sua password dalla pagina: senza questa regola
 * vedrebbe tutte le spunte verdi e si prenderebbe lo stesso errore in inglese.
 */
export const LUNGHEZZA_MASSIMA_PASSWORD = 72;

export type RegolaPassword = {
  chiave: string;
  etichetta: string;
  verifica: (password: string) => boolean;
};

export const REGOLE_PASSWORD: readonly RegolaPassword[] = [
  {
    chiave: "lunghezza",
    // Il massimo sta nella stessa riga del minimo, e non in una riga sua,
    // perche' a schermo sarebbe una spunta verde fin dal campo vuoto: una
    // conferma di qualcosa che nessuno ha ancora fatto. Cosi' invece la riga
    // diventa rossa solo a chi incolla davvero una frase lunghissima, che e'
    // l'unico che ha bisogno di leggerla.
    etichetta: `Da 8 a ${LUNGHEZZA_MASSIMA_PASSWORD} caratteri`,
    // Si misura in byte e non in caratteri perche' e' in byte che bcrypt
    // taglia. Una password di sole lettere accentate ne occupa due per
    // carattere: la riga direbbe 72 e si fermerebbe a 36. E' un caso da
    // manuale piu' che da vita vera, e sbagliare da questa parte costa una
    // riga rossa, sbagliare dall'altra costa l'errore in inglese.
    verifica: (v) => v.length >= 8 && new TextEncoder().encode(v).length <= LUNGHEZZA_MASSIMA_PASSWORD,
  },
  { chiave: "maiuscola", etichetta: "Una lettera maiuscola", verifica: (v) => /\p{Lu}/u.test(v) },
  { chiave: "minuscola", etichetta: "Una lettera minuscola", verifica: (v) => /\p{Ll}/u.test(v) },
  { chiave: "numero", etichetta: "Un numero", verifica: (v) => /\p{Nd}/u.test(v) },
  {
    chiave: "speciale",
    // Si dice quali, con degli esempi: "carattere speciale" da solo lascia
    // dubbi, e chi non sa cosa mettere ci rinuncia. Gli esempi sono scelti
    // dentro l'elenco qui sotto: suggerirne uno fuori elenco sarebbe la
    // trappola peggiore, perche' la spunta diventerebbe verde e il salvataggio
    // fallirebbe lo stesso.
    etichetta: "Un carattere speciale (! ? @ # - _)",
    verifica: (v) => CARATTERI_SPECIALI.test(v),
  },
] as const;

/** Vero solo se la password soddisfa tutte le regole. */
export function passwordAccettabile(password: string) {
  return REGOLE_PASSWORD.every((regola) => regola.verifica(password));
}

/**
 * La password provvisoria di un account appena creato dalla piattaforma.
 *
 * **Non la conosce nessuno e non viene mai spedita**: il concessionario ne
 * sceglie una sua dal link che riceve per email. Serve solo perche' l'account
 * possa nascere -- ma il server le regole le applica lo stesso, a questa come
 * a tutte le altre, e quando la rifiuta l'attivazione si ferma prima ancora di
 * creare la concessionaria.
 *
 * Sta qui, accanto alle regole, e non dentro la procedura di attivazione,
 * perche' e' li' che era e da li' e' andata alla deriva: quarantasei giorni
 * dopo, nessuno ricordava piu' che quella riga doveva rispettare un vincolo.
 * Le due cose si cambiano insieme o non si cambiano.
 *
 * Le quattro lettere davanti non sono un vezzo: un identificativo casuale e'
 * tutto in minuscolo, e da solo verrebbe rifiutato per mancanza di maiuscola,
 * di numero e di simbolo. Quaranta byte in tutto -- la misura provata sul
 * server vero il 14/09/2026, quella che crea l'utente invece di rispondere
 * `500`.
 */
export function generaPasswordProvvisoria() {
  return `Ka1!${crypto.randomUUID()}`;
}

/**
 * Quanto dura una password prima di dover essere rifatta.
 *
 * Tre mesi, chiesti dal titolare il 02/09/2026. Vale la pena sapere che
 * obbligare a cambiare password a scadenza fissa non e' piu' considerata una
 * buona pratica -- porta la gente a scrivere Password1!, poi Password2! -- e
 * che il blocco delle password gia' finite in mano ai malintenzionati,
 * un'impostazione che Supabase ha gia' pronta, protegge molto di piu'. Le due
 * cose non si escludono: questa e' quella che e' stata chiesta.
 */
export const GIORNI_VALIDITA_PASSWORD = 90;

/** Quanti giorni mancano alla scadenza. Negativo se e' gia' passata. */
export function giorniAllaScadenzaPassword(cambiataIl: string | null | undefined, adesso: Date = new Date()) {
  const data = cambiataIl ? new Date(cambiataIl) : null;

  // Senza una data non si dichiara scaduta niente: e' il caso di tutti gli
  // account che esistevano prima di questa regola, e buttarli fuori tutti
  // insieme al primo accesso sarebbe un guasto, non una misura di sicurezza.
  // Il guscio del gestionale, quando la data manca, la fa scrivere adesso: i
  // tre mesi partono da li'.
  if (!data || Number.isNaN(data.getTime())) return null;

  const giorniPassati = Math.floor((adesso.getTime() - data.getTime()) / (24 * 60 * 60 * 1000));
  return GIORNI_VALIDITA_PASSWORD - giorniPassati;
}

/** Vero solo quando i tre mesi sono passati davvero. */
export function passwordScaduta(cambiataIl: string | null | undefined, adesso: Date = new Date()) {
  const giorni = giorniAllaScadenzaPassword(cambiataIl, adesso);
  return giorni !== null && giorni <= 0;
}

/** Da quanti giorni prima si comincia ad avvisare, senza ancora bloccare. */
export const GIORNI_DI_PREAVVISO_PASSWORD = 10;
