"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isDealerAccountApproved, isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

function sanitizeNextPath(rawNext: string | null | undefined) {
  const value = String(rawNext ?? "").trim();

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost" || !parsed.pathname.startsWith("/")) {
      return "/dashboard";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);
  const accessReason = useMemo(() => String(searchParams.get("reason") ?? "").trim().toLowerCase(), [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (accessReason === "admin_only") {
      setMessage("Accesso non autorizzato: questa area e riservata ai platform owner.");
      setMessageType("error");
    }
  }, [accessReason]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setMessageType(null);

    const authClient = createSupabaseBrowserClient(rememberMe ? "local" : "session");
    const { error } = await authClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message || "Accesso non riuscito.");
      setMessageType("error");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setMessage("Sessione non valida dopo il login. Riprova.");
      setMessageType("error");
      return;
    }

    let isPlatformAdmin = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

    if (!isPlatformAdmin) {
      const profile = await authClient.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();

      if (!profile.error) {
        isPlatformAdmin = isPlatformAdminRole(profile.data?.role);
      }
    }

    if (isPlatformAdmin) {
      setLoading(false);
      router.replace("/admin");
      router.refresh();
      return;
    }

    let isApproved = false;
    try {
      isApproved = await isDealerAccountApproved(authClient, user.id);
    } catch {
      isApproved = false;
    }

    setLoading(false);

    router.replace(isApproved ? nextPath : "/account/in-attesa");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
        <section className="flex flex-col justify-between rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">DP</span>
              <span suppressHydrationWarning>DEALER PLATFORM</span>
            </div>
            <h1 className="mt-8 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">Accedi al gestionale della tua concessionaria.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Dashboard, veicoli, lead, clienti, agenda e notifiche in un&apos;unica esperienza sicura basata su Supabase Auth.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Accesso professionale</p>
              <p className="mt-2 text-sm text-slate-300">Entra con le tue credenziali e torna operativo in pochi secondi.</p>
            </div>
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Sicurezza Supabase</p>
              <p className="mt-2 text-sm text-slate-300">Sessione gestita in modo nativo con persistenza controllata dal remember me.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Login</p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">Accedi</h2>
              </div>
              <Link href="/registrazione" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Crea account
              </Link>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="nome@concessionaria.it"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                    className="absolute inset-y-0 right-0 inline-flex items-center justify-center px-4 text-slate-500 transition hover:text-slate-700"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7a12.12 12.12 0 0 1-4.35 5.09" />
                        <path d="M6.61 6.61A12.26 12.26 0 0 0 1 12c1.73 3.89 6 7 11 7a10.94 10.94 0 0 0 5.09-1.12" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="inline-flex items-center gap-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Ricordami
                </label>
                <Link href="/forgot-password" className="text-sm font-semibold text-blue-600 transition hover:text-blue-700">
                  Recupera password
                </Link>
              </div>

              {message ? (
                <div
                  className={`rounded-3xl border px-4 py-3 text-sm ${
                    messageType === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Accesso in corso..." : "Accedi"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
