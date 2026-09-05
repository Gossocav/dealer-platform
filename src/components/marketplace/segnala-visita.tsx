"use client";

import { useEffect } from "react";
import type { TipoDiVisita } from "@/lib/visite-annunci";

/**
 * Dice al server che questa pagina e' stata aperta. Non disegna niente.
 *
 * Sta nel browser e non nel server perche' le pagine degli annunci sono in
 * cache: il server le ricalcola al massimo una volta al minuto e serve a
 * tutti gli altri una copia gia' pronta, quindi un contatore messo la'
 * conterebbe i ricalcoli, non le persone.
 *
 * **Una volta per scheda e per sessione.** Chi ricarica la pagina, o torna
 * indietro e riapre la stessa automobile, non conta due volte: il segno resta
 * in `sessionStorage`, che vive quanto la scheda del browser e non e' un
 * cookie -- non segue nessuno, non viene mandato al server, e sparisce quando
 * la scheda si chiude.
 *
 * Se `sessionStorage` non e' disponibile (navigazione privata, impostazioni
 * severe) si segnala lo stesso: meglio contare una visita in piu' che
 * perderne una intera categoria di visitatori.
 */

type Props = {
  tipo: TipoDiVisita;
  id: string;
};

export function SegnalaVisita({ tipo, id }: Props) {
  useEffect(() => {
    if (!id) return;

    const segno = `visita:${tipo}:${id}`;

    try {
      if (window.sessionStorage.getItem(segno)) return;
      window.sessionStorage.setItem(segno, "1");
    } catch {
      // Niente memoria di sessione: si segnala comunque.
    }

    // `keepalive` fa arrivare la segnalazione anche se chi guarda cambia
    // pagina subito: senza, le visite piu' brevi -- che sono tante --
    // sparirebbero tutte.
    void fetch("/api/marketplace/visita", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo, id }),
      keepalive: true,
    }).catch(() => {
      // Un conteggio perso non e' un problema di chi sta guardando
      // un'automobile: non si mostra niente e non si ritenta.
    });
  }, [tipo, id]);

  return null;
}
