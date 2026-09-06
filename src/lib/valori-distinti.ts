/**
 * Gli elenchi delle tendine, senza la stessa voce scritta in due modi.
 *
 * **Quale difetto risolve.** Segnalato dal titolare il 06/09/2026: nelle
 * tendine la stessa voce compariva due volte. Misurato in produzione, non e'
 * un problema estetico:
 *
 *     marche:   35 valori,  0 scritti in piu' modi
 *     modelli:  94 valori,  8 scritti in piu' modi
 *
 *     "C3" x11 e "c3" x2       "Kona" x1 e "kona" x7
 *     "Corsa" x4 e "corsa" x1  "C5 Aircross" x6 e "c5 aircross" x1
 *
 * Il filtro confrontava in modo esatto, quindi **qualunque delle due voci si
 * scegliesse si perdevano le altre auto**: chi sceglieva "Kona" ne trovava 1
 * invece di 8, chi sceglieva "C3" ne trovava 11 invece di 13.
 *
 * Le due parti vanno insieme. Unificare la tendina senza rendere il confronto
 * indifferente alle maiuscole peggiorerebbe le cose: chi sceglie "C3"
 * continuerebbe a vederne 11 su 13, e non avrebbe piu' nemmeno la voce "c3"
 * per trovare le altre due.
 */

/** La forma con cui due scritture si riconoscono uguali. */
function chiaveDiConfronto(testo: string) {
  return testo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * L'elenco per una tendina: una voce per valore, ordinata come si legge.
 *
 * Fra due scritture della stessa cosa vince **quella piu' usata nei dati**:
 * e' la forma che il concessionario ha scritto piu' spesso, quindi quella che
 * chi guarda si aspetta. A parita' si sceglie in modo stabile, altrimenti
 * l'elenco cambierebbe da una visita all'altra senza motivo.
 */
export function valoriDistinti(valori: Array<string | number | null | undefined>): string[] {
  const gruppi = new Map<string, Map<string, number>>();

  for (const valore of valori) {
    const testo = String(valore ?? "").trim();
    if (!testo) continue;

    const chiave = chiaveDiConfronto(testo);
    if (!gruppi.has(chiave)) gruppi.set(chiave, new Map());

    const scritture = gruppi.get(chiave)!;
    scritture.set(testo, (scritture.get(testo) ?? 0) + 1);
  }

  return [...gruppi.values()]
    .map(
      (scritture) =>
        [...scritture.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it-IT"))[0][0]
    )
    .sort((a, b) => a.localeCompare(b, "it-IT"));
}

/**
 * Prepara un valore per un confronto senza maiuscole, rendendo innocui i
 * caratteri jolly.
 *
 * `%` e `_` dentro `ilike` non sono testo: significano "qualsiasi cosa" e
 * "un carattere qualsiasi". Misurato sulla produzione: cercare il modello
 * `C%` restituisce 49 auto invece di nessuna, `C_` ne restituisce 15.
 * Protetti con la barra rovescia ne restituiscono zero, che e' la risposta
 * giusta -- nessun modello si chiama cosi'.
 *
 * Oggi nessun modello contiene quei caratteri, ma i nomi li scrivono le
 * concessionarie e nessuno glielo impedisce.
 */
export function perConfrontoSenzaMaiuscole(valore: string) {
  return valore.replace(/[\\%_]/g, (carattere) => `\\${carattere}`);
}
