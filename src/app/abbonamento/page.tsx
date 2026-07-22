"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";

type PlanId = "base" | "pro" | "elite";

type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  features: string[];
  ctaLabel: string;
  recommended?: boolean;
  detailsHref: string;
  detailsLabel: string;
};

const plans: Plan[] = [
  {
    id: "base",
    name: "Piano Base",
    price: "€149",
    period: "/mese",
    ctaLabel: "Scegli Base",
    detailsHref: "/abbonamento/base",
    detailsLabel: "Scopri dettagli Base",
    features: [
      "Fino a 50 annunci veicolo attivi",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario",
      "Supporto via e-mail",
    ],
  },
  {
    id: "pro",
    name: "Piano Pro",
    price: "€399",
    period: "/mese",
    ctaLabel: "Scegli Pro",
    detailsHref: "/abbonamento/pro",
    detailsLabel: "Scopri dettagli Pro",
    recommended: true,
    features: [
      "Annunci veicolo attivi illimitati",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario avanzata",
      "CRM Lead avanzato",
      "Statistiche e KPI dettagliati",
      "Esportazione dati",
      "Supporto prioritario",
      "Maggiore visibilità sulla piattaforma",
    ],
  },
];

const demoPlans: Plan[] = [
  ...plans,
  {
    id: "elite",
    name: "Piano Elite",
    price: "€699",
    period: "/mese",
    ctaLabel: "Richiedi Elite",
    detailsHref: "/registrazione/elite",
    detailsLabel: "Scopri dettagli Elite",
    features: [
      "Annunci veicolo attivi illimitati",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario avanzata",
      "CRM Lead avanzato",
      "Statistiche e KPI dettagliati",
      "Esportazione dati",
      "Supporto prioritario",
      "Maggiore visibilità sulla piattaforma",
      "Visibilità sui social ufficiali KeyAuto",
      "Gestione campagna Google Ads",
      "Report mensile delle performance marketing",
    ],
  },
];

const PLAN_NAME_BY_ID: Record<PlanId, string> = {
  base: "Base",
  pro: "Pro",
  elite: "Elite",
};

export default function AbbonamentoPage() {
  const [loadingContext, setLoadingContext] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [requestedPlanCode, setRequestedPlanCode] = useState<PlanId | null>(null);
  const [activePlanCode, setActivePlanCode] = useState<PlanId | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState<PlanId | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let active = true;

    const loadContext = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          if (active) setLoadingContext(false);
          return;
        }

        const dealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
          activeDealerId: getActiveDealerId(),
        });

        if (!dealerId) {
          if (active) setLoadingContext(false);
          return;
        }

        const demoContext = await resolveDemoAccessContext(supabase, dealerId);

        if (!active) return;

        if (demoContext.isDemo) {
          setIsDemo(true);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const response = await fetch("/api/demo/plan-request", {
            headers: { authorization: `Bearer ${session.access_token}` },
          });

          if (response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              requestedPlanCode?: PlanId | null;
              activePlanCode?: PlanId | null;
            };

            if (active) {
              if (payload.requestedPlanCode) setRequestedPlanCode(payload.requestedPlanCode);
              if (payload.activePlanCode) setActivePlanCode(payload.activePlanCode);
            }
          }
        }
      } catch {
        // best effort - fall back to the static plan view
      } finally {
        if (active) setLoadingContext(false);
      }
    };

    void loadContext();

    return () => {
      active = false;
    };
  }, []);

  const requestPlan = async (planId: PlanId) => {
    setSubmittingPlan(planId);
    setFeedback(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setFeedback({ type: "error", message: "Sessione non valida. Effettua di nuovo il login." });
        return;
      }

      const response = await fetch("/api/demo/plan-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planCode: planId }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setFeedback({ type: "error", message: payload.error || "Invio richiesta non riuscito." });
        return;
      }

      setRequestedPlanCode(planId);
      setFeedback({ type: "success", message: `Richiesta inviata per il Piano ${PLAN_NAME_BY_ID[planId]}. Il nostro team la attivera a breve.` });
    } catch {
      setFeedback({ type: "error", message: "Errore di rete. Riprova." });
    } finally {
      setSubmittingPlan(null);
    }
  };

  if (loadingContext) {
    return (
      <DealerDashboardShell title="Il mio piano" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <p className="text-sm text-slate-500">Caricamento...</p>
        </div>
      </DealerDashboardShell>
    );
  }

  if (!isDemo && activePlanCode) {
    const activePlan = demoPlans.find((plan) => plan.id === activePlanCode);

    if (activePlan) {
      return (
        <DealerDashboardShell title="Il mio piano" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
          <section className="mx-auto w-full max-w-3xl rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-700">Il mio piano</p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Il tuo piano attivo</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Questo e il piano attualmente attivo sulla tua concessionaria.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                <ShieldCheck className="h-4 w-4" />
                Abbonamento sicuro
              </div>
            </div>

            <article className="relative mt-8 flex flex-col rounded-3xl border border-emerald-300 bg-gradient-to-b from-emerald-50 via-white to-white p-6 shadow-sm shadow-emerald-100 sm:p-7">
              <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                <Check className="h-3.5 w-3.5" />
                Attivo
              </div>

              <div>
                <h3 className="text-2xl font-semibold text-slate-900">{activePlan.name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <p className="text-3xl font-semibold text-slate-900">{activePlan.price}</p>
                  <p className="pb-1 text-sm font-medium text-slate-500">{activePlan.period}</p>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {activePlan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm text-slate-600">
                Per modificare il piano contatta il supporto KeyAuto.
              </p>
            </article>
          </section>
        </DealerDashboardShell>
      );
    }
  }

  const visiblePlans = isDemo ? demoPlans : plans;

  return (
    <DealerDashboardShell title="Il mio piano" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
      <section className="mx-auto w-full max-w-6xl rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-700">Piani Dealer</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
              {isDemo ? "Scegli il tuo piano" : "Scegli il piano piu adatto alla tua concessionaria"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              {isDemo
                ? "Sei in prova gratuita: scegli il piano che preferisci e invia la richiesta di attivazione al nostro team."
                : "Confronta i servizi inclusi e attiva il piano piu adatto alla fase di crescita del tuo business."}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Abbonamento sicuro
          </div>
        </div>

        {isDemo && requestedPlanCode ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Hai richiesto il <strong>Piano {PLAN_NAME_BY_ID[requestedPlanCode]}</strong>, in attesa di attivazione da parte del nostro team.
          </div>
        ) : null}

        {feedback ? (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className={`mt-8 grid grid-cols-1 gap-6 ${isDemo ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {visiblePlans.map((plan) => {
            const isRequested = isDemo && requestedPlanCode === plan.id;
            const isSubmitting = submittingPlan === plan.id;

            return (
              <article
                key={plan.id}
                className={[
                  "relative flex h-full flex-col rounded-3xl border p-6 shadow-sm sm:p-7",
                  isRequested
                    ? "border-emerald-300 bg-gradient-to-b from-emerald-50 via-white to-white shadow-emerald-100"
                    : plan.recommended
                      ? "border-blue-300 bg-gradient-to-b from-blue-50 via-white to-white shadow-blue-100"
                      : "border-slate-200 bg-slate-50/50",
                ].join(" ")}
              >
                {isRequested ? (
                  <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                    <Check className="h-3.5 w-3.5" />
                    Richiesto
                  </div>
                ) : plan.recommended ? (
                  <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                    Consigliato
                  </div>
                ) : null}

                <div>
                  <h3 className="text-2xl font-semibold text-slate-900">{plan.name}</h3>
                  <div className="mt-3 flex items-end gap-1">
                    <p className="text-3xl font-semibold text-slate-900">{plan.price}</p>
                    <p className="pb-1 text-sm font-medium text-slate-500">{plan.period}</p>
                  </div>
                </div>

                <ul className="mt-6 space-y-3 text-sm text-slate-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span
                        className={[
                          "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full",
                          plan.recommended ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700",
                        ].join(" ")}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isDemo ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void requestPlan(plan.id)}
                    className={[
                      "mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
                      isRequested
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-200"
                        : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-300",
                    ].join(" ")}
                  >
                    {isSubmitting ? "Invio in corso..." : isRequested ? "Richiesta inviata" : "Richiedi questo piano"}
                  </button>
                ) : (
                  <Link
                    href={plan.id === "base" ? "/registrazione/base" : "/registrazione/pro"}
                    className={[
                      "mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4",
                      plan.recommended
                        ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200"
                        : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-300",
                    ].join(" ")}
                  >
                    {plan.ctaLabel}
                  </Link>
                )}

                <Link
                  href={plan.detailsHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200"
                >
                  {plan.detailsLabel}
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </DealerDashboardShell>
  );
}
