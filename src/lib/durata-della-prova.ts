/**
 * **Quanto dura la prova gratuita. Un posto solo, e tutto il resto lo chiede
 * a lui.**
 *
 * Il 21/09/2026 il titolare ha portato la prova da sette giorni a trenta. Non
 * era una correzione: era un cambio di prodotto, e ha fatto emergere quante
 * copie di quel numero c'erano in giro. **Sessanta punti in ventidue file** --
 * sette frasi sulle pagine pubbliche, due nell'email di attivazione, nove nel
 * database, diciassette nei test -- e ognuna sapeva il numero per conto suo.
 *
 * Con quattro di quei punti il numero non era nemmeno scritto due volte: era
 * **calcolato** due volte. La rotta di attivazione ne faceva uno in
 * JavaScript (`now + 7 * 24 * 60 * 60 * 1000`) e il database un altro, e
 * l'email mandava al concessionario il primo mentre l'account viveva sul
 * secondo. Finche' erano tutti e due sette non si vedeva; a trenta sarebbero
 * stati **ventitre giorni di scarto**.
 *
 * **Perche' il posto unico e' uno per macchina e non uno in assoluto.** La
 * durata serve a due esecutori diversi: il database quando scrive la riga, il
 * sito quando stampa la frase. Una pagina statica non puo' interrogare il
 * database per sapere come si chiama se stessa, e il database non puo' leggere
 * questo file. Quindi le case sono due -- questa e `public.durata_della_prova()`
 * -- e la terza cosa, quella che le tiene insieme, e' un guardiano che legge il
 * numero da tutti e due e fallisce se non coincidono
 * (`src/lib/durata-della-prova.test.ts`).
 *
 * **La regola per chi arriva dopo:** se stai per scrivere il numero dei giorni
 * di prova da qualche altra parte, non farlo. Importa `GIORNI_DI_PROVA` da
 * qui. Se sei nel database, chiama `public.durata_della_prova()`. Il guardiano
 * se ne accorge comunque, ma e' meglio saperlo prima.
 */

/**
 * I giorni che dura la prova gratuita.
 *
 * Cambiarlo qui **non basta**: il database ha la sua copia, e le due devono
 * dire lo stesso numero. La procedura completa sta in
 * `supabase/MIGRAZIONI.md`, ed e' due righe -- questa e l'`interval` dentro
 * `public.durata_della_prova()` -- piu' la migration da applicare a mano.
 */
export const GIORNI_DI_PROVA = 30;

/**
 * La scadenza di una prova, scritta come la legge una persona:
 * *"21 ottobre 2026"*.
 *
 * **Il difetto che chiude.** L'email di attivazione mandava al concessionario
 * la data grezza del database -- `2026-09-28T09:01:50.265Z`. Non e'
 * sbagliata: e' scritta per una macchina. Chi la riceve deve accorgersi che
 * la `T` separa l'ora, che la `Z` vuol dire fuso di Greenwich, e fare i conti
 * per sapere fino a quando ha tempo.
 *
 * Sta qui e non in una libreria di date qualunque perche' e' la scadenza
 * **della prova**: chi cambia la durata passa di qui, e trova accanto anche
 * il modo in cui quella data viene raccontata.
 */
export function scadenzaPerUnaPersona(iso: string): string {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) {
    // Non si inventa una data leggibile a partire da una illeggibile: si
    // restituisce quella che c'e', che almeno e' vera. Un ripiego che
    // inventasse "oggi + trenta giorni" direbbe al concessionario una
    // scadenza che il suo account non ha.
    return iso;
  }
  // Il fuso e' fissato: senza, la stessa scadenza diventerebbe un giorno
  // diverso a seconda di dove gira il server che manda l'email.
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(quando);
}
