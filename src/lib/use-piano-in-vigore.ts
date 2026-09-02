"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Il piano in vigore per chi e' collegato adesso.
 *
 * Lo chiede al server perche' dal browser non e' deducibile: la colonna
 * `dealers.subscription_plan` direbbe "base" anche a una concessionaria Elite,
 * e la precedenza giusta (convertito, poi profilo demo, poi colonna vecchia) la
 * applica `resolveActivePlanCode` sul server.
 *
 * Finche' non ha risposta restituisce `caricamento: true`: chi decide se
 * mostrare una funzione riservata deve poter aspettare, invece di far
 * lampeggiare un bottone che poi sparisce.
 *
 * **La risposta si chiede una volta sola e si divide fra chi la usa.** Con la
 * divisione dei piani questo aggancio e' finito in dieci schermate, e le
 * schermate si sovrappongono: aprendo un veicolo lo chiedono insieme il menu e
 * la pagina, nel modulo di modifica idem. Erano due richieste identiche per
 * ogni apertura di pagina, e con cinquanta concessionarie sarebbero state
 * rumore inutile sul server. Ora la prima chiamata mette da parte la promessa
 * e le altre si attaccano a quella.
 *
 * **La risposta messa da parte scade dopo un minuto.** Un piano cambia mentre
 * la sessione e' aperta -- l'amministratore converte una concessionaria da
 * Base a Elite, oppure una prova arriva a scadenza -- e il token non cambia
 * per questo: tenendola per sempre, chi era gia' dentro continuava a vedere le
 * funzioni vecchie fino a uscire e rientrare. Un minuto lascia intatto il
 * motivo per cui la cache esiste (le schermate che si aprono insieme chiedono
 * a millisecondi di distanza) e chiude la finestra in cui il pannello mente.
 */

/** Quanto vale una risposta gia' avuta, in millisecondi. */
const DURATA_RISPOSTA_MS = 60_000;

/**
 * La risposta in corso o gia' arrivata, tenuta per token di sessione.
 *
 * La chiave e' il token e non un valore fisso di proposito: se l'utente esce e
 * rientra con un altro account, il token cambia e la risposta vecchia non
 * viene riusata. Un piano preso in prestito da un'altra sessione aprirebbe
 * funzioni che non spettano, ed e' l'errore piu' caro fra quelli possibili qui.
 */
let promessaInCorso: { token: string; risposta: Promise<string | null>; chiestaAlle: number } | null = null;

/**
 * Chiede il piano al server. **Solleva** se la richiesta non riesce, invece di
 * restituire null: chi chiama deve poter distinguere "il server ha risposto
 * che non c'e' nessun piano" da "non sono riuscito a chiedere". Le due cose si
 * assomigliano a schermo -- funzioni chiuse -- ma la prima si puo' mettere in
 * cache e la seconda no.
 */
async function chiediIlPiano(token: string): Promise<string | null> {
  const risposta = await fetch("/api/demo/plan-request", {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!risposta.ok) {
    throw new Error(`plan-request ha risposto ${risposta.status}`);
  }

  const payload = (await risposta.json().catch(() => ({}))) as { effectivePlanCode?: string | null };
  return payload.effectivePlanCode ?? null;
}

function piano(token: string): Promise<string | null> {
  const messaDaParte = promessaInCorso;

  if (messaDaParte?.token === token && Date.now() - messaDaParte.chiestaAlle < DURATA_RISPOSTA_MS) {
    return messaDaParte.risposta;
  }

  const risposta = chiediIlPiano(token).catch(() => {
    // Una richiesta fallita non resta in cache: al prossimo montaggio si
    // riprova, invece di ricordare per sempre "non lo so" -- che vorrebbe
    // dire funzioni chiuse fino al ricaricamento della pagina.
    if (promessaInCorso?.token === token) promessaInCorso = null;
    return null;
  });

  promessaInCorso = { token, risposta, chiestaAlle: Date.now() };
  return risposta;
}

/**
 * Da chiamare quando la sessione cambia o si esce: butta la risposta messa da
 * parte. Non serve alle schermate -- il token nella chiave e il minuto di
 * scadenza bastano -- ma esiste perche' i test possano ripartire puliti.
 */
export function dimenticaIlPianoInVigore() {
  promessaInCorso = null;
}

/**
 * La stessa lettura, senza React intorno.
 *
 * Serve ai test: la condivisione della risposta e' la cosa da provare, e
 * provarla montando due componenti richiederebbe un ambiente di resa che
 * questo progetto non ha. Le schermate continuano a usare `usePianoInVigore`.
 */
export function pianoPerProva(token: string): Promise<string | null> {
  return piano(token);
}

export function usePianoInVigore() {
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        if (alive) setCaricamento(false);
        return;
      }

      const codice = await piano(token);

      if (!alive) return;

      setPlanCode(codice);
      setCaricamento(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, []);

  return { planCode, caricamento };
}
