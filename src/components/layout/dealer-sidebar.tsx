"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  FolderOpen,
  BarChart3,
  CalendarDays,
  Car,
  Gauge,
  Hourglass,
  Inbox,
  LogOut,
  Mail,
  PlusSquare,
  CheckSquare,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DEMO_FULL_VERSION_MESSAGE } from "@/lib/demo-access";
import { pianoComprende, type FunzioneDiPiano } from "@/lib/funzioni-per-piano";
import { usePianoInVigore } from "@/lib/use-piano-in-vigore";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Se c'e', la voce compare solo a chi ha un piano che apre la funzione. */
  funzione?: FunzioneDiPiano;
};

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Veicoli", href: "/veicoli", icon: Car },
  { label: "Inserisci Veicolo", href: "/veicoli/nuovo", icon: PlusSquare },
  // Le vetture sparite dal sito, in attesa di sapere com'e' andata. Sta qui
  // accanto al parco auto perche' e' lavoro sul parco auto, non un rapporto.
  { label: "Da chiudere", href: "/veicoli/da-chiudere", icon: CheckSquare },
  { label: "Lead", href: "/lead", icon: Inbox },
  { label: "Clienti", href: "/clienti", icon: Users },
  { label: "Appuntamenti", href: "/agenda", icon: CalendarDays },
  { label: "Email", href: "/email", icon: Mail },
  { label: "Statistiche", href: "/statistiche", icon: BarChart3 },
  // Le vendite stanno accanto alle statistiche e non dentro: si aprono
  // apposta, non di passaggio, e sono la pagina su cui il titolare fa i
  // conti a fine mese.
  { label: "Vendite", href: "/vendite", icon: Receipt, funzione: "vendite" },
  // La giacenza sta dopo le vendite perche' e' la stessa domanda vista
  // dall'altra parte: li' cosa e' uscito, qui cosa non esce.
  { label: "Giacenza", href: "/giacenza", icon: Hourglass, funzione: "giacenza" },
  // Le perizie stanno fuori dal parco auto di proposito: quasi sempre
  // riguardano un'auto che non e' ancora sua, e cercarle dentro "Veicoli"
  // vorrebbe dire cercarle dove non ci sono.
  { label: "Perizie", href: "/perizie", icon: ClipboardCheck, funzione: "perizia" },
  // L'archivio documenti non ha soglia di piano: e' di tutti, Base compreso.
  { label: "Documenti", href: "/documenti", icon: FolderOpen },
  { label: "Il mio piano", href: "/abbonamento", icon: ShieldCheck },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings },
  { label: "Logout", href: "/login", icon: LogOut },
];

// Inserire un veicolo e' il gesto centrale della prova: il resto della
// piattaforma lo consente gia' alla demo fino a 10 veicoli (DEMO_LIMITS.vehicles
// lato app, resolve_dealer_listing_cap lato database), e la pagina Veicoli ha
// sempre avuto il pulsante "Nuovo Veicolo". Tenerlo tra le voci bloccate
// contraddiceva tutto il resto e faceva sembrare la demo di sola lettura.
const demoEnabledItems: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Veicoli", href: "/veicoli", icon: Car },
  { label: "Inserisci Veicolo", href: "/veicoli/nuovo", icon: PlusSquare },
  { label: "Lead", href: "/lead", icon: Inbox },
  { label: "Marketplace", href: "/auto", icon: Car },
  { label: "Report", href: "/statistiche", icon: BarChart3 },
  { label: "Scegli il tuo piano", href: "/abbonamento", icon: ShieldCheck },
  { label: "Logout", href: "/login", icon: LogOut },
];

const demoLockedItems: SidebarItem[] = [
  { label: "Clienti", href: "/clienti", icon: Users },
  { label: "Appuntamenti", href: "/agenda", icon: CalendarDays },
  { label: "Email", href: "/email", icon: Mail },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings },
];

type DealerSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  isDemo?: boolean;
};

export function DealerSidebar({ isOpen, onClose, isDemo = false }: DealerSidebarProps) {
  const pathname = usePathname();
  const { planCode, caricamento: caricamentoPiano } = usePianoInVigore();

  // Finche' il piano non e' noto la voce non compare. Mostrarla e poi
  // toglierla farebbe lampeggiare un menu che si accorcia sotto il dito, ed e'
  // il difetto peggiore dei due: chi ha il piano vede comparire la voce un
  // istante dopo, e non se ne accorge nemmeno.
  const visibleItems = (isDemo ? demoEnabledItems : sidebarItems).filter(
    (item) => !item.funzione || (!caricamentoPiano && pianoComprende(planCode, item.funzione))
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/45 transition-opacity lg:hidden ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={[
          "fixed left-0 top-[73px] z-50 h-[calc(100vh-73px)] w-[17rem] overflow-y-auto border-r border-slate-200/80",
          "bg-white/95 px-4 py-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] backdrop-blur",
          "transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold shadow-[0_6px_16px_-6px_rgba(76,130,247,0.8)]">
              KA
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide">KeyAuto</p>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">Dealer Console</p>
            </div>
          </div>
        </div>

        <nav className="mt-5 space-y-1.5">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(76,130,247,0.25)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
                onClick={onClose}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isDemo ? (
            <>
              {demoLockedItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={`${item.label}-locked`}
                    type="button"
                    onClick={() => globalThis.alert(DEMO_FULL_VERSION_MESSAGE)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-700">
                      Versione Completa
                    </span>
                  </button>
                );
              })}
            </>
          ) : null}
        </nav>
      </aside>
    </>
  );
}