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
  Wrench,
} from "lucide-react";

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
  { label: "Email", href: "/profilo", icon: Mail },
  { label: "Statistiche", href: "/statistiche", icon: BarChart3 },
  { label: "Abbonamento", href: "/profilo", icon: ShieldCheck },
  { label: "Impostazioni", href: "/profilo", icon: Settings },
  { label: "Logout", href: "/login", icon: LogOut },
];

type DealerSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DealerSidebar({ isOpen, onClose }: DealerSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/45 transition-opacity lg:hidden ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={[
          "fixed left-0 top-[73px] z-50 h-[calc(100vh-73px)] w-[17rem] border-r border-slate-200/80",
          "bg-white/95 px-4 py-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] backdrop-blur",
          "transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Marketplace</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/30">
              <Wrench className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold">Dealer Console</p>
          </div>
        </div>

        <nav className="mt-5 space-y-1.5">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.2)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
                onClick={onClose}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}