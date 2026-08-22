/**
 * Legge un elenco per intero, non i primi mille.
 *
 * Il database consegna al massimo mille righe per richiesta, e non lo dice:
 * chi chiede "i clienti" ne riceve mille e crede siano tutti. Con due
 * concessionarie non si vede; alla ventesima si vedrebbe come dati spariti,
 * che e' il modo peggiore di accorgersene.
 *
 * Questa funzione ripete la richiesta a blocchi finche' il database smette di
 * dare righe nuove. Non e' una paginazione a video: le pagine che la usano
 * continuano a cercare e filtrare sull'elenco intero, com'erano fatte.
 *
 * Il tetto serve a non trascinare in un browser un catalogo enorme: se lo si
 * tocca, chi chiama lo viene a sapere (`troncato`) e puo' dirlo a chi guarda,
 * invece di mostrare un elenco incompleto in silenzio.
 */
export const RIGHE_PER_BLOCCO = 1000;

export const RIGHE_MASSIME = 5000;

type Risposta<T> = { data: T[] | null; error: { message: string } | null };

export async function caricaTutto<T>(
  blocco: (da: number, a: number) => PromiseLike<Risposta<T>>,
  opzioni?: { massimo?: number; perBlocco?: number }
): Promise<{ righe: T[]; troncato: boolean; error: { message: string } | null }> {
  const massimo = Math.max(1, opzioni?.massimo ?? RIGHE_MASSIME);
  const perBlocco = Math.max(1, Math.min(opzioni?.perBlocco ?? RIGHE_PER_BLOCCO, massimo));

  const righe: T[] = [];

  for (let da = 0; da < massimo; da += perBlocco) {
    const a = Math.min(da + perBlocco, massimo) - 1;
    const risposta = await blocco(da, a);

    if (risposta.error) {
      return { righe, troncato: false, error: risposta.error };
    }

    const arrivate = risposta.data ?? [];
    righe.push(...arrivate);

    // Meno righe di quante ne stavano in un blocco: l'elenco e' finito.
    if (arrivate.length < a - da + 1) {
      return { righe, troncato: false, error: null };
    }
  }

  // Si e' arrivati al tetto: potrebbero essercene altre.
  return { righe, troncato: true, error: null };
}
