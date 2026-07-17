"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveDealerId, setActiveDealerId } from "@/lib/active-tenant";
import { supabase } from "@/lib/supabaseClient";

type DealerMembershipRow = {
  dealer_id: string | null;
  created_at: string | null;
};

type DealerOptionRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
};

type DealerOption = {
  id: string;
  label: string;
};

type UserMenuState = {
  email: string | null;
  open: boolean;
  dealerOptions: DealerOption[];
  activeDealerId: string | null;
};

export function UserMenu() {
  const router = useRouter();
  const [state, setState] = useState<UserMenuState>({
    email: null,
    open: false,
    dealerOptions: [],
    activeDealerId: null,
  });

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      const user = data.user;
      const userId = user?.id;

      setState((current) => ({ ...current, email: user?.email ?? null }));

      if (!userId) {
        setState((current) => ({ ...current, dealerOptions: [], activeDealerId: null }));
        setActiveDealerId(null);
        return;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("dealer_users")
        .select("dealer_id, created_at")
        .eq("profile_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .returns<DealerMembershipRow[]>();

      if (membershipsError) {
        setState((current) => ({ ...current, dealerOptions: [], activeDealerId: null }));
        setActiveDealerId(null);
        return;
      }

      const membershipIds = Array.from(
        new Set(
          (memberships ?? [])
            .map((row) => String(row.dealer_id ?? "").trim())
            .filter((dealerId) => dealerId.length > 0)
        )
      );

      if (membershipIds.length === 0) {
        setState((current) => ({ ...current, dealerOptions: [], activeDealerId: null }));
        setActiveDealerId(null);
        return;
      }

      const { data: dealerRows } = await supabase
        .from("dealers")
        .select("id, name, legal_name")
        .in("id", membershipIds)
        .returns<DealerOptionRow[]>();

      const labelsByDealerId = new Map(
        (dealerRows ?? []).map((dealer) => [dealer.id, String(dealer.name ?? dealer.legal_name ?? dealer.id).trim() || dealer.id])
      );

      const dealerOptions: DealerOption[] = membershipIds.map((id) => ({
        id,
        label: labelsByDealerId.get(id) ?? id,
      }));

      const storedActiveDealerId = getActiveDealerId();
      let nextActiveDealerId =
        storedActiveDealerId && membershipIds.includes(storedActiveDealerId) ? storedActiveDealerId : null;

      if (!nextActiveDealerId && membershipIds.length === 1) {
        nextActiveDealerId = membershipIds[0];
      }

      setActiveDealerId(nextActiveDealerId);
      setState((current) => ({
        ...current,
        dealerOptions,
        activeDealerId: nextActiveDealerId,
      }));
    };

    void loadUser();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setState((current) => ({
        ...current,
        email: session?.user.email ?? null,
        open: event === "SIGNED_OUT" ? false : current.open,
      }));
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    setState((current) => ({ ...current, open: false }));
    setActiveDealerId(null);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const handleActiveDealerChange = (value: string) => {
    const nextActiveDealerId = value.trim() || null;
    setActiveDealerId(nextActiveDealerId);
    setState((current) => ({
      ...current,
      activeDealerId: nextActiveDealerId,
      open: false,
    }));
    router.refresh();
  };

  const initials = state.email ? state.email.slice(0, 2).toUpperCase() : "DL";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setState((current) => ({ ...current, open: !current.open }))}
        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={state.open}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{state.email ?? "Account"}</span>
      </button>

      {state.open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Menu utente</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{state.email ?? "Account autenticato"}</p>
          {state.dealerOptions.length > 1 ? (
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Concessionaria attiva</span>
              <select
                value={state.activeDealerId ?? ""}
                onChange={(event) => handleActiveDealerChange(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="">Seleziona concessionaria</option>
                {state.dealerOptions.map((dealerOption) => (
                  <option key={dealerOption.id} value={dealerOption.id}>
                    {dealerOption.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
