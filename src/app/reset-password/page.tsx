"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REGOLE_PASSWORD } from "@/lib/password-rules";
import { supabase } from "@/lib/supabaseClient";

/**
 * Pagina di atterraggio del link inviato all'attivazione di una demo, e del
 * recupero password. Ricalca l'impaginazione del login: chi ci arriva sta
 * entrando per la prima volta e deve riconoscere subito dove si trova.
 */

type LinkState = "checking" | "valid" | "missing";

// Le regole non si riscrivono qui: le stesse le legge il guscio del
// gestionale per sapere quando la password e' scaduta, e due elenchi diversi
// vorrebbero dire una password buona da una parte e no dall'altra.
const RULES = REGOLE_PASSWORD;

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [linkState, setLinkState] = useState<LinkState>("checking");

  // Il link crea una sessione temporanea. Senza, updateUser fallirebbe con un
  // errore tecnico incomprensibile: meglio dirlo subito e indicare la via
  // d'uscita, invece di far compilare un modulo destinato a non funzionare.
  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setLinkState(session?.user ? "valid" : "missing");
      }
    };

    void check();

    return () => {
      mounted = false;
    };
  }, []);

  const checks = useMemo(() => RULES.map((rule) => ({ ...rule, ok: rule.verifica(password) })), [password]);
  const allRulesOk = checks.every((rule) => rule.ok);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!allRulesOk) {
      setMessage("La password non rispetta ancora tutti i requisiti indicati sotto.");
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Le due password non coincidono.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage(null);
    setMessageType(null);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setMessage(error.message || "Impossibile salvare la password.");
      setMessageType("error");
      return;
    }

    // La data del cambio serve alla scadenza dei tre mesi, e la scrive il
    // server: qui si chiede soltanto di timbrarla. Se non riesce non si dice
    // niente a chi sta entrando -- la password **e' stata cambiata**, e
    // fermarlo adesso vorrebbe dire raccontargli un guasto che non c'e'.
    try {
      const { data: sessione } = await supabase.auth.getSession();
      const token = sessione.session?.access_token;

      if (token) {
        await fetch("/api/account/password-aggiornata", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // registrata al prossimo ingresso, dal guscio del gestionale
    }

    setDone(true);
    setMessage("Password creata. Ora puoi entrare nella piattaforma.");
    setMessageType("success");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
        <section className="flex flex-col justify-between rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">KA</span>
              <span suppressHydrationWarning>KEYAUTO</span>
            </div>
            <h1 className="mt-8 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Un ultimo passaggio e sei dentro.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Scegli la password con cui accederai al gestionale della tua concessionaria. La usi tu, e puoi
              cambiarla quando vuoi.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Solo tua</p>
              <p className="mt-2 text-sm text-slate-300">Nessuno di KeyAuto puo vederla: viene salvata cifrata.</p>
            </div>
            <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold text-white">Serve ogni volta</p>
              <p className="mt-2 text-sm text-slate-300">Insieme alla tua email, e quello che ti fa entrare.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Primo accesso</p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">Crea la tua password</h2>
              </div>
              <Link
                href="/login"
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Accedi
              </Link>
            </div>

            {linkState === "missing" ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Questo link non e piu valido: i link di accesso scadono dopo un po&apos; e si possono usare una
                  volta sola. Richiedine uno nuovo, arriva sulla stessa email.
                </div>
                <Link
                  href="/forgot-password"
                  className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Richiedi un nuovo link
                </Link>
              </div>
            ) : done ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  Password creata. Da adesso entri con la tua email e questa password.
                </div>
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Vai all&apos;accesso
                </Link>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
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
                      autoComplete="new-password"
                      className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="Scegli la tua password"
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

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="confirm-password">
                    Ripeti la password
                  </label>
                  <input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="Scrivila una seconda volta"
                  />
                </div>

                {/* I requisiti si vedono mentre si scrive: scoprirli da un
                    errore dopo l'invio e' il modo piu' rapido per far
                    rinunciare qualcuno al primo accesso. */}
                <ul className="grid gap-2 rounded-3xl bg-slate-50 px-4 py-3 sm:grid-cols-2">
                  {checks.map((rule) => (
                    <li
                      key={rule.chiave}
                      className={`flex items-center gap-2 text-sm ${rule.ok ? "text-emerald-700" : "text-slate-500"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white ${
                          rule.ok ? "bg-emerald-600" : "bg-slate-300"
                        }`}
                      >
                        {rule.ok ? "✓" : ""}
                      </span>
                      {rule.etichetta}
                    </li>
                  ))}
                </ul>

                {message ? (
                  <div
                    className={`rounded-3xl border px-4 py-3 text-sm ${
                      messageType === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {message}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading || linkState === "checking"}
                  className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Salvataggio..." : "Crea password ed entra"}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
