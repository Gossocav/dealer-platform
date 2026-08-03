"use client";

import { trackWhatsAppContact } from "@/lib/measurement-events";

/**
 * Il bottone WhatsApp della scheda veicolo.
 *
 * Esiste come componente a se' solo per una ragione: la scheda veicolo e'
 * disegnata dal server e non puo' reagire a un tocco. E il tocco su WhatsApp
 * e' un contatto a tutti gli effetti -- in Italia, sulle auto, spesso il piu'
 * usato -- quindi vale quanto un modulo inviato.
 *
 * Il collegamento resta un normale collegamento: se la misurazione non c'e' o
 * non e' stata consentita, il bottone funziona identico.
 */
export function WhatsAppContactButton({
  href,
  vehicleLabel,
  vehicleId,
}: {
  href: string;
  vehicleLabel: string;
  vehicleId: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackWhatsAppContact({ veicolo: vehicleLabel, veicolo_id: vehicleId })}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(55,224,232,0.5)] transition hover:brightness-105"
    >
      WhatsApp
    </a>
  );
}
