/**
 * I numeri della copia delle foto, in un posto solo.
 *
 * Non stanno nel database, apposta: un vincolo che ripete un valore di
 * prodotto rifiuta la scrittura il giorno che il valore cambia (AGENTS.md, la
 * durata della prova). Sono una proposta costruita su una misura sola, e
 * hanno un appuntamento per essere riletti contro il tasso vero: la tabella
 * sta in `supabase/MIGRAZIONI.md`, "L'appuntamento: i numeri si rileggono
 * contro il tasso vero". Chi cambia un numero qui lo cambia anche li'.
 */
export const SOGLIE_COPIA_FOTO = {
  /** Foto al massimo in una galleria: lo stesso tetto del resto dell'importazione. */
  fotoPerVeicolo: 20,

  /**
   * Foto copiate che la sincronizzazione puo' togliere a una concessionaria in
   * una chiamata (una chiamata rilegge al massimo un lotto di schede di quella
   * concessionaria; il lavoro periodico ne fa piu' d'una a giro). Oltre, la
   * galleria di quell'auto resta com'e' e il riepilogo lo dice.
   * E' la rete per un cambio di nomi dei file da parte di DealerK: tutte le
   * copie cambierebbero identita' insieme, e senza tetto verrebbero buttate in
   * un giro solo. Una galleria vera ne ha al massimo 20, quindi una
   * concessionaria che rinnova le foto di due auto nella stessa chiamata vede
   * la seconda rimandata alla chiamata dopo: rimandata, non persa.
   */
  copieTolteMassimePerGiro: 20,

  /** Regola 3: quante sentinelle si interrogano, e quante devono rispondere per dire "sano". */
  sentinelle: 10,
  sentinelleSane: 9,

  /**
   * Regola 4, il freno di giro: dopo almeno `frenoTentativiMinimi` tentativi su
   * un server, se falliscono piu' di `frenoQuota` e almeno `frenoFalliteMinime`
   * foto nuove, su quel server ci si ferma.
   */
  frenoTentativiMinimi: 20,
  frenoFalliteMinime: 10,
  frenoQuota: 0.05,

  /** Regola 5: distanza minima fra i due "non esiste", e morte al massimo in 24 ore per server. */
  oreFraIDueNonEsiste: 24,
  morteMassimeIn24Ore: 20,

  /** Regola 6: dopo quanti tentativi validi, e quanti giorni dal primo, una foto e' esaurita. */
  tentativiPerEsaurire: 16,
  giorniPerEsaurire: 7,

  /** Quante richieste alla volta verso il server delle foto, e la pausa fra l'una e l'altra. */
  richiesteInParallelo: 2,
  pausaFraRichiesteMs: 150,

  /**
   * La stessa impronta su almeno tante origini diverse dello stesso server e'
   * un segnaposto. **La larghezza invece non e' un criterio**, ed era nel piano:
   * "almeno 400 px, la soglia del lettore dei siti". La prova sui dati veri del
   * 25/09/2026 l'ha fatta cadere alla terza foto della coda: la copertina di
   * una Peugeot 208 in vetrina e' un'immagine da catalogo larga 220 px, vera e
   * voluta dal concessionario. Rifiutarla avrebbe lasciato proprio quella
   * copertina su DealerK. Contro i segnaposto restano le prove che su
   * un'immagine vera e piccola non sbagliano: il tipo, il percorso dopo i
   * rimbalzi, e questa.
   */
  originiPerSegnaposto: 3,

  /**
   * **Le morte sono spente** finche' la regola di lettura del pubblico non le
   * nasconde (serve una migration). Senza, una foto segnata morta resterebbe
   * visibile e rotta, e il segno sarebbe una bugia. Intanto le foto con due
   * "non esiste" su server sano aspettano, senza consumare tentativi.
   */
  morteAbilitate: false,

  /**
   * La data dell'appuntamento sui numeri (primo giro + 7 giorni). Da quel
   * giorno ogni riepilogo lo ricorda. Si scrive quando parte il primo giro, si
   * toglie quando la tabella in MIGRAZIONI.md e' compilata.
   */
  dataVerifica: null as string | null,
} as const;
