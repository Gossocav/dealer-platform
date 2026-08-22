"use client";

import { useEffect, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";
import { AdminShell } from "@/components/layout/admin-shell";

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  dealerName: string | null;
  createdAt: string;
  emailConfirmed: boolean;
  isAdmin: boolean;
  isSelf: boolean;
};

type PageState = {
  loading: boolean;
  authorized: boolean;
  error: string | null;
  notice: string | null;
  users: AdminUserRow[];
};

function displayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "-";
}

function formatDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "-";

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/**
 * Legge lo stato senza toccare React, cosi' l'effetto e il ricaricamento
 * dopo una cancellazione condividono la stessa logica.
 */
async function fetchAccounts(notice: string | null = null): Promise<PageState> {
  const empty = { loading: false, users: [] as AdminUserRow[] };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ...empty, authorized: false, error: userError?.message || "Utente non autenticato.", notice: null };
  }

  let canAccess = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

  if (!canAccess) {
    const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
    if (!profile.error) {
      canAccess = isPlatformAdminRole(profile.data?.role);
    }
  }

  if (!canAccess) {
    return { ...empty, authorized: false, error: null, notice: null };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return { ...empty, authorized: true, error: sessionError?.message || "Sessione non valida.", notice: null };
  }

  const response = await fetch("/api/admin/users", {
    method: "GET",
    cache: "no-store",
    headers: { authorization: `Bearer ${session.access_token}` },
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; users?: AdminUserRow[] };

  if (!response.ok) {
    if (response.status === 403) {
      return { ...empty, authorized: false, error: null, notice: null };
    }

    return { ...empty, authorized: true, error: payload.error || "Impossibile caricare gli account.", notice: null };
  }

  return { loading: false, authorized: true, error: null, notice, users: payload.users ?? [] };
}

export default function AdminUsersPage() {
  const [state, setState] = useState<PageState>({
    loading: true,
    authorized: false,
    error: null,
    notice: null,
    users: [],
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const next = await fetchAccounts();
      if (mounted) setState(next);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const removeUser = async (target: AdminUserRow) => {
    const confirmed = window.confirm(
      `Cancellare definitivamente l'account ${target.email}?\n\nSparira' anche il suo profilo. L'operazione non si puo' annullare.`,
    );

    if (!confirmed) return;

    setDeletingId(target.id);
    setState((current) => ({ ...current, error: null, notice: null }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setState((current) => ({ ...current, error: "Sessione non valida." }));
      setDeletingId(null);
      return;
    }

    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId: target.id }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setDeletingId(null);

    if (!response.ok) {
      setState((current) => ({ ...current, error: payload.error || "Impossibile cancellare l'account." }));
      return;
    }

    setState(await fetchAccounts(`Account ${target.email} cancellato.`));
  };

  if (state.loading) {
    return (
      <AdminShell title="Account">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Caricamento account...
        </div>
      </AdminShell>
    );
  }

  if (!state.authorized) {
    return (
      <AdminShell title="Accesso negato">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
          Questa sezione e riservata agli account amministrativi.
        </div>
      </AdminShell>
    );
  }

  const adminCount = state.users.filter((user) => user.isAdmin).length;

  return (
    <AdminShell title="Account" description="Chi puo entrare nella piattaforma, con il ruolo e la concessionaria di appartenenza.">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm text-slate-600">
            Account che possono accedere alla piattaforma:{" "}
            <span className="font-semibold text-slate-900">{state.users.length}</span>
            {adminCount > 0 ? <span className="text-slate-500"> · di cui {adminCount} amministratori</span> : null}
          </p>
      </section>

        {state.notice ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-sm">
            {state.notice}
          </section>
        ) : null}

        {state.error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm">
            {state.error}
          </section>
        ) : null}

        {state.users.length === 0 && !state.error ? (
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600 shadow-sm">
            Nessun account presente.
          </section>
        ) : (
          <section className="space-y-4">
            {state.users.map((user) => (
              <article key={user.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold break-all text-slate-900">{user.email}</h2>
                      {user.isAdmin ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                          Amministratore
                        </span>
                      ) : null}
                      {user.isSelf ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          Sei tu
                        </span>
                      ) : null}
                      {!user.emailConfirmed ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Email da confermare
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-slate-600">
                      Ruolo: <span className="font-medium text-slate-800">{displayText(user.role)}</span>
                      {" · "}
                      Concessionaria: <span className="font-medium text-slate-800">{displayText(user.dealerName)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Creato il {formatDate(user.createdAt)}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void removeUser(user)}
                    disabled={user.isSelf || deletingId === user.id}
                    title={user.isSelf ? "Non puoi cancellare l'account con cui sei entrato" : undefined}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
                  >
                    {deletingId === user.id ? "Cancellazione..." : "Cancella"}
                  </button>
                </div>

                {!user.emailConfirmed ? (
                  <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    Questo account non ha confermato l&apos;email: al momento non riesce ad accedere e vedrebbe
                    &ldquo;credenziali non valide&rdquo;. Si sblocca inviandogli il link di impostazione password.
                  </p>
                ) : null}
              </article>
            ))}
          </section>
        )}
    </AdminShell>
  );
}
