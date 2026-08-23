"use client";

import { ArrowLeft, Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";

type DealerTopbarProps = {
  title: string;
  dealerName: string;
  avatarInitials: string;
  onOpenSidebar: () => void;
};

/**
 * Da dove si torna quando non c'e' una pagina precedente in questa scheda del
 * browser: la sezione che contiene quella aperta. Da "/veicoli/abc" si torna
 * a "/veicoli", da "/lead/123" a "/lead".
 */
function sezioneContenitore(pathname: string) {
  const pezzi = pathname.split("/").filter(Boolean);
  if (pezzi.length <= 1) return "/dashboard";
  return `/${pezzi[0]}`;
}

export function DealerTopbar({ title, dealerName, avatarInitials, onOpenSidebar }: DealerTopbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Sulla dashboard non si torna indietro: e' il punto di partenza.
  const mostraIndietro = pathname !== "/dashboard";

  const tornaIndietro = () => {
    // Se si e' arrivati qui navigando, si torna esattamente dove si era --
    // con la pagina dell'elenco e i filtri che si erano scelti. Se invece la
    // scheda del browser e' stata aperta su questo indirizzo (un link
    // ricevuto, un segnalibro) una pagina precedente non esiste, e si sale
    // alla sezione che la contiene.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(sezioneContenitore(pathname));
  };

  return (
    <header className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-100 lg:hidden"
            aria-label="Apri menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {mostraIndietro ? (
            <button
              type="button"
              onClick={tornaIndietro}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              aria-label="Torna alla pagina precedente"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Indietro</span>
            </button>
          ) : null}
          {/* Sopra il titolo compariva un segnaposto in inglese rimasto dal
              disegno iniziale, mostrato su ogni pagina del pannello. */}
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        </div>

        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          {/* Qui c'era un campo di ricerca che non cercava niente: nessun
              comportamento collegato, si poteva solo scriverci dentro e
              premere invio senza che succedesse nulla. Tolto -- un comando
              che non fa quello che promette e' peggio di un comando che non
              c'e'. Se serve davvero, va costruito. */}

          {/* E qui c'era un campanello finto, con accanto un numero scritto a
              mano nel codice e nessuna azione al clic. Questo legge le
              notifiche vere e si apre: esisteva gia', scritto e funzionante,
              e non era mai stato collegato a niente. */}
          <NotificationBell />

          <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-1.5 sm:flex">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">{avatarInitials}</span>
            <div className="leading-tight">
              <p className="text-xs text-slate-500">Concessionaria</p>
              <p className="text-sm font-semibold text-slate-900">{dealerName}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}