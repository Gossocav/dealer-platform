/**
 * **Il percorso della home ha tre forme, e solo una e' quella che ci
 * aspettavamo.**
 *
 * `usePathname()` non restituisce sempre `"/"` per la radice. Le forme viste
 * in produzione sono tre, e ognuna e' costata:
 *
 * | cosa restituisce | quando | cosa succedeva |
 * |---|---|---|
 * | `""` | in un caso osservato nel 2026 | la home diventava una pagina protetta |
 * | `"/index"` | **a ogni ricostruzione a runtime su Vercel** | idem, dal 09/09/2026 |
 * | `"/"` | quando la pagina viene costruita alla pubblicazione | tutto bene |
 *
 * **Il difetto che questa funzione chiude, misurato il 21/09/2026.** La home
 * serviva **63 caratteri** -- il guscio di attesa dell'autenticazione, cioe'
 * *"Verifica autenticazione..."* -- a chiunque non eseguisse JavaScript, e
 * quindi anche alla prima passata di chi indicizza. Non sempre: **solo nelle
 * copie ricostruite**, che su questa pagina sono tutte tranne la prima dopo
 * ogni pubblicazione. Misurato al secondo seguendo una pubblicazione:
 *
 *     06:56:46  piena  6.118 caratteri  age=0    PRERENDER
 *     07:01:49  piena  6.118 caratteri  age=302  STALE
 *     07:02:15  VUOTA     65 caratteri  age=22   HIT
 *
 * Cinque minuti e mezzo di pagina giusta dopo ogni pubblicazione, e vuota per
 * tutto il resto del tempo.
 *
 * **Come si e' trovato il valore: facendoselo dire.** L'ipotesi -- che il
 * difetto riguardasse la radice, perche' una scheda auto si ricostruisce
 * benissimo -- era plausibile e non bastava. Invece di dedurre il valore si
 * e' messa una sonda temporanea nel guscio, che scriveva nell'HTML il
 * percorso grezzo; la copia ricostruita ha risposto **`/index`**, letta due
 * volte a venti secondi di distanza. Cinque minuti invece di mezza giornata
 * di lettura del codice di Next.
 *
 * **Perche' una scheda auto non ne soffriva**, ed e' la conferma che il
 * meccanismo e' questo: durante la sua ricostruzione il percorso e'
 * `/auto/<identificativo>`, che comincia per `/auto/` -- una voce
 * dell'elenco delle pagine pubbliche -- quindi resta pubblica. Solo la radice
 * non ha un prefisso che la salvi.
 *
 * **Perche' sta in un file suo e non dentro il componente.** Il guscio e' un
 * componente client e non si puo' montare nei test di questo progetto, quindi
 * il suo guardiano ricostruiva la classificazione **ricopiandola** -- e un
 * test che confronta con una propria trascrizione prova la trascrizione, non
 * il codice. Da qui la regola puo' essere chiamata davvero.
 */
export function normalizzaPercorso(grezzo: string | null | undefined): string {
  if (!grezzo) return "/";
  // Vercel chiama la radice `/index` quando ricostruisce la sua copia: e' il
  // nome del file prerenderizzato (`index.html`), non un indirizzo del sito.
  // Nessuna pagina vera si chiama cosi'.
  if (grezzo === "/index") return "/";
  return grezzo;
}
