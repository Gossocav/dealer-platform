/**
 * La forma di un numero di telaio (VIN), in un posto solo.
 *
 * **Perche' serve.** Il 16/09/2026 in produzione due auto di una stessa
 * concessionaria -- una Nissan Micra e una Jeep Avenger -- portavano lo
 * stesso telaio: `12345`. Un segnaposto. Il telaio e' una chiave quanto la
 * targa: con quello si segna venduta una vettura (`auto-da-chiudere.ts`), si
 * riconosce un doppione nell'importazione da feed (`findDuplicateVehicleId`
 * cerca prima per telaio), e domani si paghera' una decodifica. Un telaio
 * finto scritto in archivio e' indistinguibile da uno vero, e "12345" su due
 * auto diverse fa credere che siano la stessa.
 *
 * La targa aveva la sua forma dal 15/09 (`src/lib/targa.ts`); il telaio no:
 * la casella "Telaio" della scheda accettava qualunque cosa, e il lettore
 * del blocco dei siti aveva la regola scritta dentro di se', in una riga.
 *
 * **La forma.** Diciassette caratteri, lettere e cifre, **senza I, O e Q**:
 * lo standard le esclude perche' si confondono con 1 e 0. Non si verifica la
 * cifra di controllo (la nona): vale per i veicoli nordamericani, e un
 * telaio europeo perfettamente vero la fallirebbe.
 */

const FORMA = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Maiuscolo, senza spazi, punti, trattini e sottolineature. */
export function normalizzaTelaio(valore: unknown): string {
  return String(valore ?? "").toUpperCase().replace(/[\s.\-_]/g, "");
}

export type EsitoTelaio =
  /** Il campo e' vuoto: e' un'assenza, non un errore. */
  | { stato: "vuoto" }
  | { stato: "valido"; telaio: string }
  /** Non ha la forma di un telaio: non si salva come telaio, si dice. */
  | { stato: "non-valido"; telaio: string; motivo: string };

/**
 * Che cosa e' stato scritto nella casella "Telaio". **Un campo vuoto non e'
 * un errore**: le auto importate dal sito il telaio quasi mai ce l'hanno, e
 * nessuno deve inventarsene uno per salvare la scheda.
 */
export function esitoTelaio(valore: unknown): EsitoTelaio {
  const telaio = normalizzaTelaio(valore);
  if (!telaio) return { stato: "vuoto" };
  if (FORMA.test(telaio) && !/^(.)\1{16}$/.test(telaio)) return { stato: "valido", telaio };

  const motivo =
    telaio.length !== 17
      ? `un telaio ha 17 caratteri, questo ne ha ${telaio.length}`
      : /[IOQ]/.test(telaio)
        ? "un telaio non usa le lettere I, O e Q"
        : "diciassette caratteri tutti uguali non sono un telaio";
  return { stato: "non-valido", telaio, motivo };
}

/** Vero solo per un telaio di forma riconosciuta. */
export function telaioValido(valore: unknown): boolean {
  return esitoTelaio(valore).stato === "valido";
}

/**
 * Il telaio come va scritto nell'archivio: normalizzato se valido, `null` se
 * vuoto. **Un telaio non valido non arriva mai qui**: chi salva si ferma
 * prima e lo dice.
 */
export function telaioDaSalvare(valore: unknown): string | null {
  const esito = esitoTelaio(valore);
  return esito.stato === "valido" ? esito.telaio : null;
}

/** Il messaggio da mettere sotto la casella. Null quando non c'e' niente da dire. */
export function messaggioTelaio(valore: unknown): string | null {
  const esito = esitoTelaio(valore);
  if (esito.stato !== "non-valido") return null;
  return `"${esito.telaio}" non sembra un numero di telaio: ${esito.motivo}.`;
}

/** Il nome dell'indice che impedisce due auto attive con lo stesso telaio (migration 20260916020000). */
export const INDICE_TELAIO_ATTIVO = "vehicles_un_telaio_attivo_per_concessionaria";

/** Come `messaggioTargaDoppia`, per il telaio. */
export function messaggioTelaioDoppio(errore: { code?: string | null; message?: string | null } | null | undefined): string | null {
  if (!errore || !String(errore.message ?? "").includes(INDICE_TELAIO_ATTIVO)) return null;
  return "Hai gia' un'auto attiva con questo numero di telaio: controlla in Gestione Veicoli prima di salvarne un'altra.";
}
