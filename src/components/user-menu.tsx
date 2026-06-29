"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserMenuState = {
  email: string | null;
  open: boolean;
};

export function UserMenu() {
  const router = useRouter();
  const [state, setState] = useState<UserMenuState>({ email: null, open: false });

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setState((current) => ({ ...current, email: data.user?.email ?? null }));
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
    await supabase.auth.signOut();
    router.replace("/login");
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
