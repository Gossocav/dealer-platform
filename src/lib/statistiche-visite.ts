/**
 * I conti delle visite, per il pannello amministrativo.
 *
 * Puro: entrano le righe cosi' come stanno nel database, esce quello che il
 * pannello disegna. Nessuna rete, nessuna data presa dall'orologio -- il
 * giorno di riferimento si passa da fuori, altrimenti i test direbbero cose
 * diverse a seconda di quando si eseguono.
 *
 * **Il giorno e' quello italiano**, come lo scrive il database
 * (`Europe/Rome`): qui si confrontano stringhe "AAAA-MM-GG" gia' calcolate
 * di la', senza rimetterci mano.
 */

export type RigaDiVisita = {
  dealer_id: string;
  vehicle_id: string | null;
  view_day: string;
  views_count: number;
};

export type ConcessionariaDaContare = {
  id: string;
  nome: string;
};

export type VisitePerConcessionaria = {
  dealerId: string;
  nome: string;
  oggi: number;
  ultimi7: number;
  ultimi30: number;
  /** Le visite alle schede delle automobili, negli ultimi 30 giorni. */
  annunci30: number;
  /** Le visite alla pagina della concessionaria, negli ultimi 30 giorni. */
  pagina30: number;
  /** Le richieste ricevute negli ultimi 30 giorni. */
  contatti30: number;
  /**
   * Quante visite servono per una richiesta. **Null quando non e'
   * calcolabile**: senza contatti non e' "zero", e' un numero che non
   * esiste ancora -- e mostrarlo come zero direbbe una cosa falsa.
   */
  visitePerContatto: number | null;
};

/** Sposta una data "AAAA-MM-GG" indietro di N giorni, restando in quel formato. */
export function giornoMenoGiorni(giorno: string, giorni: number): string {
  // Mezzogiorno UTC: cosi' nessun cambio di ora legale puo' far scivolare il
  // risultato al giorno prima o dopo.
  const base = new Date(`${giorno}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - giorni);
  return base.toISOString().slice(0, 10);
}

/**
 * Il quadro di ogni concessionaria.
 *
 * Le concessionarie senza nessuna visita compaiono lo stesso, con zero: sono
 * la risposta a "come sta andando questa?", e farle sparire dall'elenco
 * sembrerebbe che non esistano invece che dire che non le guarda nessuno.
 */
export function visitePerConcessionaria(params: {
  righe: readonly RigaDiVisita[];
  concessionarie: readonly ConcessionariaDaContare[];
  contattiPerDealer: Readonly<Record<string, number>>;
  oggi: string;
}): VisitePerConcessionaria[] {
  const { righe, concessionarie, contattiPerDealer, oggi } = params;

  const da7 = giornoMenoGiorni(oggi, 6);
  const da30 = giornoMenoGiorni(oggi, 29);

  const quadri = new Map<string, VisitePerConcessionaria>();

  for (const concessionaria of concessionarie) {
    quadri.set(concessionaria.id, {
      dealerId: concessionaria.id,
      nome: concessionaria.nome,
      oggi: 0,
      ultimi7: 0,
      ultimi30: 0,
      annunci30: 0,
      pagina30: 0,
      contatti30: contattiPerDealer[concessionaria.id] ?? 0,
      visitePerContatto: null,
    });
  }

  for (const riga of righe) {
    const quadro = quadri.get(riga.dealer_id);
    // Una riga di una concessionaria che non e' nell'elenco -- cancellata, o
    // filtrata via -- non si conta da nessuna parte.
    if (!quadro) continue;

    const quante = Number(riga.views_count) || 0;

    if (riga.view_day === oggi) quadro.oggi += quante;
    if (riga.view_day >= da7) quadro.ultimi7 += quante;
    if (riga.view_day >= da30) {
      quadro.ultimi30 += quante;
      if (riga.vehicle_id) quadro.annunci30 += quante;
      else quadro.pagina30 += quante;
    }
  }

  for (const quadro of quadri.values()) {
    quadro.visitePerContatto =
      quadro.contatti30 > 0 ? Math.round(quadro.ultimi30 / quadro.contatti30) : null;
  }

  return Array.from(quadri.values()).sort((a, b) => b.ultimi30 - a.ultimi30 || a.nome.localeCompare(b.nome));
}

export type AnnuncioPiuVisto = {
  vehicleId: string;
  visite: number;
};

/**
 * Le automobili piu' viste di una concessionaria negli ultimi 30 giorni.
 *
 * Serve la risposta a "quali auto tirano e quali sono ferme", che e' la
 * seconda meta' della domanda del titolare.
 */
export function annunciPiuVisti(params: {
  righe: readonly RigaDiVisita[];
  dealerId: string;
  oggi: string;
  quanti?: number;
}): AnnuncioPiuVisto[] {
  const da30 = giornoMenoGiorni(params.oggi, 29);
  const somme = new Map<string, number>();

  for (const riga of params.righe) {
    if (riga.dealer_id !== params.dealerId) continue;
    if (!riga.vehicle_id) continue;
    if (riga.view_day < da30) continue;

    somme.set(riga.vehicle_id, (somme.get(riga.vehicle_id) ?? 0) + (Number(riga.views_count) || 0));
  }

  return Array.from(somme, ([vehicleId, visite]) => ({ vehicleId, visite }))
    .sort((a, b) => b.visite - a.visite)
    .slice(0, params.quanti ?? 10);
}

/**
 * L'andamento giorno per giorno di tutta la piattaforma, dal piu' vecchio al
 * piu' recente. I giorni senza visite valgono zero e ci sono lo stesso: un
 * grafico che salta i giorni vuoti fa sembrare continuo un andamento che ha
 * dei buchi.
 */
export function andamentoGiornaliero(params: {
  righe: readonly RigaDiVisita[];
  oggi: string;
  giorni?: number;
}): Array<{ giorno: string; visite: number }> {
  const quanti = params.giorni ?? 30;
  const somme = new Map<string, number>();

  for (const riga of params.righe) {
    somme.set(riga.view_day, (somme.get(riga.view_day) ?? 0) + (Number(riga.views_count) || 0));
  }

  const andamento: Array<{ giorno: string; visite: number }> = [];
  for (let indietro = quanti - 1; indietro >= 0; indietro -= 1) {
    const giorno = giornoMenoGiorni(params.oggi, indietro);
    andamento.push({ giorno, visite: somme.get(giorno) ?? 0 });
  }

  return andamento;
}
