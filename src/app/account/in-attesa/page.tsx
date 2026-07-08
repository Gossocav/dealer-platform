"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function toPlanLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "base") return "Base";
  if (normalized === "pro") return "Pro";

  return "-";
}

export default function AccountInAttesaPage() {
  const [planLabel, setPlanLabel] = useState("-");

  useEffect(() => {
    let mounted = true;

    const loadPlan = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!mounted || authError || !user) {
        return;
      }

      const membershipResult = await supabase
        .from("dealer_users")
        .select("dealer:dealers(subscription_plan)")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle<{ dealer: { subscription_plan: string | null } | Array<{ subscription_plan: string | null }> | null }>();

      if (membershipResult.error) {
        return;
      }

      const joinedDealer = Array.isArray(membershipResult.data?.dealer)
        ? membershipResult.data?.dealer[0] ?? null
        : membershipResult.data?.dealer ?? null;

      if (joinedDealer?.subscription_plan) {
        setPlanLabel(toPlanLabel(joinedDealer.subscription_plan));
        return;
      }

      const profileResult = await supabase
        .from("profiles")
        .select("dealer_id")
        .eq("id", user.id)
        .maybeSingle<{ dealer_id: string | null }>();

      const dealerId = String(profileResult.data?.dealer_id ?? "").trim();
      if (!dealerId) {
        return;
      }

      const dealerResult = await supabase
        .from("dealers")
        .select("subscription_plan")
        .eq("id", dealerId)
        .maybeSingle<{ subscription_plan: string | null }>();

      if (!dealerResult.error) {
        setPlanLabel(toPlanLabel(dealerResult.data?.subscription_plan));
      }
    };

    void loadPlan();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Verifica account</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Richiesta ricevuta</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Il tuo account concessionario e stato creato correttamente ed e attualmente in verifica.
        </p>
        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
          <p>
            Stato attuale: <span className="font-semibold text-slate-900">account in verifica</span>
          </p>
          <p>
            Piano scelto: <span className="font-semibold text-slate-900">{planLabel}</span>
          </p>
          <p>
            Tempi stimati di approvazione: <span className="font-semibold text-slate-900">1-2 giorni lavorativi</span>
          </p>
          <p>
            Assistenza: <a className="font-semibold text-blue-700 underline" href="mailto:support@dealerplatform.it">support@dealerplatform.it</a>
          </p>
        </div>
      </section>
    </main>
  );
}
