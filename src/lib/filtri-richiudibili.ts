/**
 * Il pulsante che apre i filtri sul telefono, e come si contano quelli
 * attivi.
 *
 * **Il difetto, misurato il 20/09/2026 a 390x844.** Sulla pagina di una
 * concessionaria la ricerca avanzata era **aperta**: tredici campi, e la
 * prima automobile cominciava a **1.737 pixel** -- due schermate di filtri
 * prima di vedere una macchina. Su `/ricerca` andava peggio, sedici campi e
 * la prima auto a **2.090px**.
 *
 * Chi apre la pagina di un concessionario vuole **vedere** le sue auto, non
 * filtrarle: filtrare viene dopo, e solo per alcuni. Su schermo largo lo
 * spazio c'e' e i filtri restano aperti come prima.
 *
 * Sta in un file suo perche' le due pagine sono costruite in modi diversi --
 * `/ricerca` e' un modulo del server, la pagina della concessionaria un
 * componente del browser -- e l'unica cosa che possono condividere davvero
 * e' **come si scrive il pulsante**. Se la dicitura vivesse in due posti,
 * fra un mese direbbero due cose diverse.
 */

/** "Filtra", oppure "Filtra · 2 attivi". */
export function etichettaFiltra(quantiAttivi: number): string {
  if (quantiAttivi <= 0) return "Filtra";
  return `Filtra · ${quantiAttivi} ${quantiAttivi === 1 ? "attivo" : "attivi"}`;
}

/**
 * Quanti filtri sono impostati.
 *
 * **L'ordinamento non conta**, e non e' un dettaglio: ha sempre un valore --
 * "piu' recenti" quando nessuno ha scelto niente -- quindi contarlo farebbe
 * dire "1 attivo" a chi non ha toccato niente, e il riquadro si aprirebbe
 * da solo su ogni pagina. Chi chiama passa solo i campi che filtrano.
 */
export function contaFiltriImpostati(valori: ReadonlyArray<string | null | undefined>): number {
  return valori.filter((valore) => String(valore ?? "").trim() !== "").length;
}

/**
 * Se il riquadro parte aperto.
 *
 * Chi arriva **con dei filtri gia' impostati** -- da un collegamento
 * ricevuto, o tornando indietro nel browser -- deve vederli: altrimenti
 * legge "12 auto" su una concessionaria che ne ha 135 e non capisce
 * perche'. Il riquadro chiuso nasconderebbe l'unica spiegazione.
 */
export function filtriDaMostrareSubito(quantiAttivi: number): boolean {
  return quantiAttivi > 0;
}
