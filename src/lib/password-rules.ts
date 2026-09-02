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

export type RegolaPassword = {
  chiave: string;
  etichetta: string;
  verifica: (password: string) => boolean;
};

export const REGOLE_PASSWORD: readonly RegolaPassword[] = [
  { chiave: "lunghezza", etichetta: "Almeno 8 caratteri", verifica: (v) => v.length >= 8 },
  { chiave: "maiuscola", etichetta: "Una lettera maiuscola", verifica: (v) => /\p{Lu}/u.test(v) },
  { chiave: "minuscola", etichetta: "Una lettera minuscola", verifica: (v) => /\p{Ll}/u.test(v) },
  { chiave: "numero", etichetta: "Un numero", verifica: (v) => /\p{Nd}/u.test(v) },
  {
    chiave: "speciale",
    // Si dice quali, con degli esempi: "carattere speciale" da solo lascia
    // dubbi, e chi non sa cosa mettere ci rinuncia.
    etichetta: "Un carattere speciale (! ? @ # € - _)",
    // Va bene qualunque cosa non sia una lettera o una cifra, ma lo spazio non
    // conta: una password con dentro uno spazio sembrerebbe a posto per
    // sbaglio, e chi l'ha scritta non saprebbe di averlo messo.
    verifica: (v) => /[^\p{L}\p{N}\s]/u.test(v),
  },
] as const;

/** Vero solo se la password soddisfa tutte le regole. */
export function passwordAccettabile(password: string) {
  return REGOLE_PASSWORD.every((regola) => regola.verifica(password));
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
