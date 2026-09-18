/**
 * Il regime IVA di una vettura, scritto come si legge.
 *
 * **Il vuoto e' un valore e va detto.** `vat_regime` ammette "esposta",
 * "margine" oppure niente, e "niente" significa **"nessuno l'ha dichiarato"**,
 * non "regime del margine". La differenza non e' teorica: al 18/09/2026 su
 * Autogepy il campo e' vuoto su 117 auto su 122, e tradurre quell'assenza in
 * "margine" inventerebbe un dato fiscale su quasi tutto il parco. E' lo stesso
 * difetto della colonna che `vat_regime` ha sostituito: un si'/no che non
 * sapeva dire "non lo so".
 *
 * Per un compratore con partita IVA la differenza su una vettura da
 * trentacinquemila euro e' settemila euro.
 */
export type RegimeIva = "esposta" | "margine";

export function leggiRegimeIva(valore: unknown): RegimeIva | null {
  const testo = String(valore ?? "").trim().toLowerCase();
  return testo === "esposta" || testo === "margine" ? testo : null;
}

/**
 * Come si mostra nel gestionale: il valore, oppure il trattino **con il
 * perche'**. Un trattino muto si legge come guasto, o peggio come "no".
 *
 * `daUnSito` cambia la ragione dell'assenza, e sono due cose diverse: su
 * un'auto che arriva da un sito il dato manca perche' il sito non lo dichiara;
 * su una scritta a mano manca perche' non c'e' ancora il posto dove scriverlo.
 */
export function regimeIvaDaMostrare(valore: unknown, daUnSito: boolean): { testo: string; perche: string | null } {
  const regime = leggiRegimeIva(valore);
  if (regime === "esposta") return { testo: "IVA esposta", perche: null };
  if (regime === "margine") return { testo: "Regime del margine", perche: null };
  return {
    testo: "—",
    perche: daUnSito ? "il tuo sito non lo dichiara" : "non e' ancora stato indicato",
  };
}
