"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveDealerIdForUser } from "@/lib/dealer-association";
import { supabase } from "@/lib/supabaseClient";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: "lead_new" | "vehicle_new" | "lead_stale" | "vehicle_draft_stale" | "vehicle_import" | "piano_pieno";
  read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * Quante non lette ce ne sono **in tutto**, chiesto al database.
   *
   * Prima si contavano fra le venti caricate, e il pallino non poteva quindi
   * superare venti nemmeno con trecentosettantatre notifiche non lette. Il
   * codice che scriveva "99+" non e' mai stato raggiunto.
   */
  const [nonLette, setNonLette] = useState<number | null>(null);
  /**
   * Un guasto non e' un elenco vuoto. Senza questo, una lettura fallita
   * lasciava la tendina con scritto "Nessuna notifica disponibile" -- che vuol
   * dire "non c'e' niente", ed e' un'altra cosa. Regola 2 di AGENTS.md.
   */
  const [guasto, setGuasto] = useState(false);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) return;

      setUserId(user.id);

      const currentDealerId = await resolveDealerIdForUser(user.id);

      if (!mounted) return;

      setDealerId(currentDealerId);

      if (!currentDealerId) return;

      // Creates stale notifications (24h/7d) if missing.
      await supabase.rpc("sync_stale_notifications");

      await loadNotifications(currentDealerId, user.id);
    };

    const loadNotifications = async (targetDealerId: string, targetUserId: string) => {
      setLoading(true);

      const elenco = supabase
        .from("notifications")
        .select("id, title, message, type, read, created_at")
        .eq("dealer_id", targetDealerId)
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Il conteggio si chiede al database, non si ricava dalle venti righe.
      const conteggio = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("dealer_id", targetDealerId)
        .eq("user_id", targetUserId)
        .eq("read", false);

      const [{ data, error }, { count, error: erroreConteggio }] = await Promise.all([elenco, conteggio]);

      setLoading(false);

      if (error) {
        // Non si svuota l'elenco: chi lo guarda leggerebbe "non c'e' niente"
        // davanti a un guasto.
        setGuasto(true);
        return;
      }

      setGuasto(false);
      setItems((data ?? []) as NotificationItem[]);
      // Se il conteggio non riesce, resta ignoto: zero direbbe "nessuna non
      // letta", che e' una cosa diversa.
      setNonLette(erroreConteggio ? null : count ?? 0);
    };

    void bootstrap();

    const channel = supabase
      .channel("notifications-navbar")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        if (dealerId && userId) {
          void loadNotifications(dealerId, userId);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [dealerId, userId]);

  const markAllAsRead = async () => {
    if (!dealerId || !userId || !nonLette) return;

    // Tutte quelle non lette, non solo le venti caricate: con
    // trecentosettantatre notifiche il pulsante ne segnava venti e il pallino
    // restava acceso, senza che si capisse perche'.
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("dealer_id", dealerId)
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return;

    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setNonLette(0);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        aria-label="Apri centro notifiche"
      >
        <span className="text-lg leading-none">🔔</span>
        {nonLette !== null && nonLette > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {nonLette > 99 ? "99+" : nonLette}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Centro Notifiche</p>
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
              disabled={!nonLette}
            >
              Segna tutte come lette
            </button>
          </div>

          {loading ? <p className="py-8 text-center text-sm text-slate-500">Caricamento notifiche...</p> : null}

          {!loading && guasto ? (
            <p className="py-8 text-center text-sm text-amber-700">
              Non sono riuscito a leggere le notifiche. Riprova fra poco.
            </p>
          ) : null}

          {!loading && !guasto && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nessuna notifica disponibile.</p>
          ) : null}

          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <li
                key={item.id}
                className={`rounded-2xl border p-3 ${item.read ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50"}`}
              >
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                <p className="mt-2 text-[11px] text-slate-500">{formatDateTime(item.created_at)}</p>
              </li>
            ))}
          </ul>

          {!loading && !guasto && nonLette !== null && nonLette > items.length ? (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Ne mostro 20 delle {nonLette} non lette.
            </p>
          ) : null}

          <div className="mt-3 border-t border-slate-200 pt-3">
            <Link href="/dashboard" className="text-xs font-semibold text-slate-700 transition hover:text-slate-900">
              Chiudi
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
