/**
 * Il filtro di testo della ricerca veicoli, in un posto solo.
 *
 * Fino al 06/09/2026 cercava la **frase intera** dentro una colonna sola --
 * marca, oppure modello, oppure allestimento -- e la confrontava cosi' com'era
 * scritta. Due difetti, misurati sulla produzione:
 *
 *     Veicoli pubblicati:          296
 *     Con marca accentata:          36    (Citroen 35, Skoda 1)
 *
 *     chi cerca "citroen"     trovava   1   invece di 35
 *     chi cerca "skoda"       trovava   0   invece di 1
 *     chi cerca "citroen c3"  trovava   0   anche scrivendo l'accento
 *
 * Il 12% del parco non si faceva trovare da chi lo cercava per nome, e
 * "marca + modello" -- il modo piu' naturale di cercare un'auto -- non poteva
 * funzionare per costruzione, perche' nessuna singola colonna contiene
 * entrambe le parole.
 *
 * Ora si cerca dentro `vehicles.ricerca_testo`, una colonna che il database
 * riempie da solo con marca, modello e allestimento messi insieme, senza
 * accenti e in minuscolo (migration 20260906160000). Ogni parola scritta da
 * chi cerca si confronta con tutto insieme, quindi l'ordine non conta.
 */

/**
 * Le parole da cercare, normalizzate come le normalizza il database.
 *
 * **Deve dare lo stesso risultato di `public.senza_accenti()`**, altrimenti
 * chi scrive "Citroen" con la dieresi non trova le proprie auto. Verificato
 * sui caratteri che esistono davvero in produzione -- misurati, non supposti:
 *
 *     "e" (35 volte)  "a" (3)  "e" (1)  "u" (1)  "S" (1)
 *
 * Su tutti e cinque i due lati coincidono, compreso l'indicatore ordinale
 * "1a serie" che nessuno dei due tocca.
 *
 * Restituisce un elenco vuoto quando non resta niente da cercare: chi chiama
 * non deve filtrare, non deve filtrare per stringa vuota -- che farebbe
 * passare tutto sembrando una ricerca riuscita.
 */
export function paroleRicercaVeicolo(testo: string | null | undefined): string[] {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Il percento e' il jolly di `ilike`: lasciarlo passare cambierebbe in
    // silenzio cosa si sta cercando. La virgola diventa un separatore, cosi'
    // "audi, a3" si comporta come "audi a3" invece di essere una parola sola
    // che non esiste.
    .replace(/[%,]/g, " ")
    .split(/\s+/)
    .filter((parola) => parola.length > 0)
    // Una ricerca di cinquanta parole diventerebbe cinquanta condizioni
    // messe in and: nessuno la scrive davvero, e il database la pagherebbe.
    .slice(0, 6);
}

/** Il modello di confronto per una parola, come lo vuole `ilike`. */
export function modelloIlike(parola: string): string {
  return `%${parola}%`;
}

/** La colonna su cui si cerca. Nominarla in un posto solo evita refusi. */
export const COLONNA_RICERCA = "ricerca_testo";
