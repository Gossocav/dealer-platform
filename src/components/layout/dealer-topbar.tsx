"use client";

import { Bell, Menu, Search } from "lucide-react";

type DealerTopbarProps = {
  title: string;
  dealerName: string;
  avatarInitials: string;
  unreadNotifications: number;
  onOpenSidebar: () => void;
};

export function DealerTopbar({ title, dealerName, avatarInitials, unreadNotifications, onOpenSidebar }: DealerTopbarProps) {
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
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dashboard title</p>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Cerca veicolo, lead o cliente"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
            />
          </label>

          <button
            type="button"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-100"
            aria-label="Notifiche"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[11px] font-semibold text-white">
              {unreadNotifications}
            </span>
          </button>

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