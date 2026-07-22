"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Car,
  Gauge,
  Inbox,
  LogOut,
  Mail,
  PlusSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DEMO_FULL_VERSION_MESSAGE } from "@/lib/demo-access";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Veicoli", href: "/veicoli", icon: Car },
  { label: "Inserisci Veicolo", href: "/veicoli/nuovo", icon: PlusSquare },
  { label: "Lead", href: "/lead", icon: Inbox },
  { label: "Clienti", href: "/clienti", icon: Users },
  { label: "Appuntamenti", href: "/agenda", icon: CalendarDays },
  { label: "Email", href: "/email", icon: Mail },
  { label: "Statistiche", href: "/statistiche", icon: BarChart3 },
  { label: "Il mio piano", href: "/abbonamento", icon: ShieldCheck },
  { label: "Impostazioni", href: "/impostazioni", icon: Settings },
  { label: "Logout", href: "/login", icon: LogOut },
];

const demoEnabledItems: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Veicoli", href: "/veicoli", icon: Car },
  { label: "Lead", href: "/lead", icon: Inbox },
  { label: "Marketplace", href: "/auto", icon: Car },
  { label: "Report", href: "/statistiche", icon: BarChart3 },
  { label: "Scegli il tuo piano", href: "/abbonamento", icon: ShieldCheck },
  { label: "Logout", href: "/login", icon: LogOut },
];

const demoLockedItems: SidebarItem[] = [
  { label: "Inserisci Veicolo", href: "/veicoli/nuovo", icon: PlusSquare },
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
  const visibleItems = isDemo ? demoEnabledItems : sidebarItems;

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