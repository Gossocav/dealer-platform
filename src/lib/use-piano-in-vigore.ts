"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Il piano in vigore per chi e' collegato adesso.
 *
 * Lo chiede al server perche' dal browser non e' deducibile: la colonna
 * `dealers.subscription_plan` direbbe "base" anche a una concessionaria Elite,
 * e la precedenza giusta (convertito, poi profilo demo, poi colonna vecchia) la
 * applica `resolveActivePlanCode` sul server.
 *
 * Finche' non ha risposta restituisce `caricamento: true`: chi decide se
 * mostrare una funzione riservata deve poter aspettare, invece di far
 * lampeggiare un bottone che poi sparisce.
 */
export function usePianoInVigore() {
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        if (alive) setCaricamento(false);
        return;
      }

      const risposta = await fetch("/api/demo/plan-request", {
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!alive) return;

      if (risposta?.ok) {
        const payload = (await risposta.json().catch(() => ({}))) as { effectivePlanCode?: string | null };
        setPlanCode(payload.effectivePlanCode ?? null);
      }

      setCaricamento(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, []);

  return { planCode, caricamento };
}
