"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkCurrentSession = async () => {
      const authClient = createSupabaseBrowserClient("local");
      const {
        data: { user },
      } = await authClient.auth.getUser();

      if (!mounted || !user) return;

      let isPlatformAdmin = isPlatformAdminRole(resolveUserRoleFromMetadata(user));
      if (!isPlatformAdmin) {
        const profile = await authClient.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
        if (!profile.error) {
          isPlatformAdmin = isPlatformAdminRole(profile.data?.role);
        }
      }

      if (isPlatformAdmin) {
        router.replace("/admin");
        router.refresh();
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    };

    void checkCurrentSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const authClient = createSupabaseBrowserClient(rememberMe ? "local" : "session");
    const { error } = await authClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message || "Accesso admin non riuscito.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setMessage("Sessione non valida dopo il login admin.");
      return;
    }

    let isPlatformAdmin = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

    if (!isPlatformAdmin) {
      const profile = await authClient.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
      if (!profile.error) {
        isPlatformAdmin = isPlatformAdminRole(profile.data?.role);
      }
    }

    if (!isPlatformAdmin) {
      setLoading(false);
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setLoading(false);
    router.replace("/admin");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.12),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-stretch gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">KA</span>
              <span suppressHydrationWarning>ADMIN ACCESS</span>
            </div>
            <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">Area Amministrazione KeyAuto</h1>
            <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg">
              Accesso riservato alla gestione della piattaforma, approvazioni dealer e controllo operativo.
            </p>
          </div>

          <div className="mt-10 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
            <p className="text-sm font-semibold text-white">Area riservata</p>
            <p className="mt-2 text-sm text-slate-300">Se il tuo account non ha ruolo admin/platform_owner puoi effettuare il login solo nell&apos;area amministrativa con credenziali autorizzate.</p>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Admin Login</p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">Accedi</h2>
              </div>
              <Link href="/login" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Login dealer
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
                  placeholder="Email"
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

              <label className="inline-flex items-center gap-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Ricordami
              </label>

              {message ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Accesso in corso..." : "Entra nell'area amministrativa"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
