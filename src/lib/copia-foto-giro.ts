/**
 * Un giro di copia delle foto, senza rete e senza database: le operazioni vere
 * le passa chi chiama (`src/app/api/cron/copia-foto/route.ts`), cosi' il giro
 * si prova con operazioni finte.
 *
 * "Un giro" e' **una chiamata** della rotta: il freno e le sentinelle valgono
 * per quella chiamata. Il lavoro periodico ne fa piu' d'una, e passa a tutte
 * l'ora in cui e' cominciato (`iniziatoIl`): una foto gia' provata in questo
 * lavoro non si riprova nella chiamata dopo, altrimenti le foto fallite
 * verrebbero martellate finche' il lavoro non finisce.
 */
import {
  eNuovaPerIlFreno,
  frenoScattato,
  ordinaCoda,
  scritturaDopoIlFallimento,
  serverDellaFoto,
  type FotoInCoda,
  type RisultatoTentativo,
  type Scrittura,
  type VerdettoSentinelle,
  verdettoSentinelle,
} from "@/lib/copia-foto";
import { SOGLIE_COPIA_FOTO } from "@/lib/copia-foto-soglie";

export type OperazioniDelGiro = {
  /** Scarica, verifica e salva nel nostro archivio; non scrive la riga. */
  copia: (foto: FotoInCoda) => Promise<RisultatoTentativo | { tipo: "archivio"; motivo: string }>;
  /** Scrive la riga della foto copiata, solo se l'origine e' ancora quella: false vuol dire "superata". */
  segnaCopiata: (foto: FotoInCoda, copia: Extract<RisultatoTentativo, { tipo: "copiata" }>, adesso: Date) => Promise<boolean>;
  /** Scrive la riga di una foto non copiata, solo se l'origine e' ancora quella. */
  scrivi: (foto: FotoInCoda, valori: Scrittura) => Promise<void>;
  /** Le sentinelle di un server: foto gia' copiate, interrogate fuori dalla memoria di Cloudflare. */
  sentinelle: (server: string) => Promise<ReadonlyArray<{ ok: boolean; dallaMemoria: boolean }>>;
  /** Quante foto di quel server sono state dichiarate morte nelle ultime 24 ore. */
  morteRecenti: (server: string) => Promise<number>;
  /** Il tempo per questo giro e' finito? */
  scaduto: () => boolean;
  /** La pausa fra una richiesta e l'altra verso il server delle foto. */
  pausa: () => Promise<void>;
};

export type EsitoServer = {
  tentativi: number;
  copiate: number;
  superate: number;
  nonEsiste: number;
  nonRaggiunte: number;
  nonEraLaFoto: number;
  archivio: number;
  /** Perche' ci si e' fermati su questo server, o null. */
  fermata: null | "il-server-chiede-di-fermarsi" | "freno";
  sentinelle: VerdettoSentinelle | "non-interrogate";
  giroValido: boolean;
  morte: number;
  /** Foto con due "non esiste" su server sano che aspettano: tetto pieno, o morte spente. */
  inAttesa: number;
  motivi: string[];
};

export type EsitoGiro = {
  coda: number;
  provate: number;
  finitoIlTempo: boolean;
  server: Record<string, EsitoServer>;
};

function nuovoEsitoServer(): EsitoServer {
  return {
    tentativi: 0,
    copiate: 0,
    superate: 0,
    nonEsiste: 0,
    nonRaggiunte: 0,
    nonEraLaFoto: 0,
    archivio: 0,
    fermata: null,
    sentinelle: "non-interrogate",
    giroValido: true,
    morte: 0,
    inAttesa: 0,
    motivi: [],
  };
}

export async function eseguiGiro(
  foto: readonly FotoInCoda[],
  operazioni: OperazioniDelGiro,
  opzioni: { adesso: Date; iniziatoIl: Date | null },
): Promise<EsitoGiro> {
  // Una foto gia' provata in questo lavoro non si riprova nella stessa corsa.
  const daProvare = ordinaCoda(foto).filter(
    (f) => !opzioni.iniziatoIl || !f.copia_ultimo_tentativo || new Date(f.copia_ultimo_tentativo) < opzioni.iniziatoIl,
  );

  const server: Record<string, EsitoServer> = {};
  const fallite: Record<string, Array<{ foto: FotoInCoda; risultato: Exclude<RisultatoTentativo, { tipo: "copiata" }> }>> = {};
  const nuoveFallite: Record<string, { tutte: number; nonEsiste: number }> = {};
  let provate = 0;
  let finitoIlTempo = false;
  let indice = 0;

  const lavoratore = async () => {
    while (indice < daProvare.length) {
      if (operazioni.scaduto()) {
        finitoIlTempo = true;
        return;
      }
      const f = daProvare[indice];
      indice += 1;
      const host = serverDellaFoto(f.origine_url);
      const esito = (server[host] ??= nuovoEsitoServer());
      if (esito.fermata) continue;

      const risultato = await operazioni.copia(f);
      provate += 1;

      if (risultato.tipo === "archivio") {
        // Il guasto e' nostro, non dell'origine: nessun tentativo consumato.
        esito.archivio += 1;
        if (esito.motivi.length < 5) esito.motivi.push(`archivio: ${risultato.motivo}`);
        await operazioni.scrivi(f, { copia_ultimo_tentativo: opzioni.adesso.toISOString() });
        await operazioni.pausa();
        continue;
      }

      esito.tentativi += 1;

      if (risultato.tipo === "copiata") {
        if (await operazioni.segnaCopiata(f, risultato, opzioni.adesso)) esito.copiate += 1;
        else esito.superate += 1;
        await operazioni.pausa();
        continue;
      }

      (fallite[host] ??= []).push({ foto: f, risultato });
      if (risultato.tipo === "non-esiste") esito.nonEsiste += 1;
      if (risultato.tipo === "non-raggiunta") esito.nonRaggiunte += 1;
      if (risultato.tipo === "non-era-la-foto") esito.nonEraLaFoto += 1;
      if (risultato.tipo !== "fermati" && esito.motivi.length < 5) {
        esito.motivi.push(risultato.tipo === "non-esiste" ? `non esiste (${risultato.stato})` : `${risultato.tipo}: ${risultato.motivo}`);
      }

      if (risultato.tipo === "fermati") {
        // Il primo 429 ferma il server: e' una richiesta esplicita di smettere.
        esito.fermata = "il-server-chiede-di-fermarsi";
        esito.motivi.push(`il server ha chiesto di fermarsi (${risultato.stato})`);
      } else if (eNuovaPerIlFreno(f)) {
        const conti = (nuoveFallite[host] ??= { tutte: 0, nonEsiste: 0 });
        conti.tutte += 1;
        if (risultato.tipo === "non-esiste") conti.nonEsiste += 1;
        if (frenoScattato({ tentativi: esito.tentativi, fallimentiNuovi: conti.tutte })) esito.fermata = "freno";
      }

      await operazioni.pausa();
    }
  };

  await Promise.all(Array.from({ length: SOGLIE_COPIA_FOTO.richiesteInParallelo }, () => lavoratore()));

  // A fine giro, server per server: si decide se il giro vale, e si scrivono i fallimenti.
  for (const [host, esito] of Object.entries(server)) {
    const elenco = fallite[host] ?? [];
    if (elenco.some((x) => x.risultato.tipo === "non-esiste")) {
      esito.sentinelle = verdettoSentinelle(await operazioni.sentinelle(host));
    }

    const conti = nuoveFallite[host] ?? { tutte: 0, nonEsiste: 0 };
    // Su un server sano i "non esiste" non contano nel freno: le sentinelle
    // hanno gia' detto che risponde.
    const nuoveContate = esito.sentinelle === "sano" ? conti.tutte - conti.nonEsiste : conti.tutte;
    const frenoVero = frenoScattato({ tentativi: esito.tentativi, fallimentiNuovi: nuoveContate });
    if (esito.fermata === "freno" && !frenoVero) esito.fermata = null;
    if (frenoVero && !esito.fermata) esito.fermata = "freno";

    esito.giroValido = esito.fermata === null && esito.sentinelle !== "non-risponde";
    if (esito.fermata === "freno") esito.motivi.push("freno: troppe foto nuove fallite in questo giro");
    if (esito.sentinelle === "non-risponde") esito.motivi.push("le sentinelle dicono che il server non risponde");

    let postiMorte = SOGLIE_COPIA_FOTO.morteAbilitate
      ? Math.max(0, SOGLIE_COPIA_FOTO.morteMassimeIn24Ore - (await operazioni.morteRecenti(host)))
      : 0;

    for (const { foto: f, risultato } of elenco) {
      const { valori, mortaQui } = scritturaDopoIlFallimento(f, risultato, {
        giroValido: esito.giroValido,
        sentinelle: esito.sentinelle === "non-interrogate" ? "sconosciuto" : esito.sentinelle,
        adesso: opzioni.adesso,
        morteAbilitate: SOGLIE_COPIA_FOTO.morteAbilitate,
        postiMorteRestanti: postiMorte,
      });
      if (mortaQui) {
        esito.morte += 1;
        postiMorte -= 1;
      } else if (esito.giroValido && risultato.tipo === "non-esiste" && esito.sentinelle === "sano" && f.copia_primo_non_esiste) {
        esito.inAttesa += 1;
      }
      await operazioni.scrivi(f, valori);
    }
  }

  return { coda: foto.length, provate, finitoIlTempo, server };
}
