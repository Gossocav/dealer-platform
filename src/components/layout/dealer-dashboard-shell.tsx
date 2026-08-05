"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DealerSidebar } from "@/components/layout/dealer-sidebar";
import { DealerTopbar } from "@/components/layout/dealer-topbar";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";

type DealerDashboardShellProps = {
  title: string;
  /**
   * Il nome da mostrare in alto a destra.
   *
   * Facoltativo, e quasi sempre da omettere: il guscio se lo va a prendere da
   * solo. Prima ogni pagina lo passava a mano, e tutte tranne Impostazioni
   * passavano la stringa "Dealer Console" -- cioe' il concessionario entrava
   * nel proprio pannello e leggeva un nome che non era il suo.
   *
   * Serve ancora a Impostazioni, che dopo il salvataggio ha il nome nuovo
   * prima che il guscio possa rileggerlo.
   */
  dealerName?: string;
  avatarInitials?: string;
  children: ReactNode;
};

/** Le iniziali dal nome: "Autogepy Spa" -> "AS". */
function toInitials(name: string) {
  const parole = name
    .split(/\s+/)
    .map((parola) => parola.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((parola) => parola.length > 0);

  if (parole.length === 0) {
    return "KA";
  }

  return parole
    .slice(0, 2)
    .map((parola) => parola[0]?.toUpperCase() ?? "")
    .join("");
}

type ShellDemoBanner = {
  isDemo: boolean;
  demoStatus: string | null;
  demoExpiresAt: string | null;
  daysRemaining: number;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

export function DealerDashboardShell({
  title,
  dealerName,
  avatarInitials,
  children,
}: DealerDashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [demoBanner, setDemoBanner] = useState<ShellDemoBanner | null>(null);
  const [resolvedDealerName, setResolvedDealerName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDemoContext = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user?.id) {
          if (active) setDemoBanner(null);
          return;
        }

        const dealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
          activeDealerId: getActiveDealerId(),
        });

        if (!dealerId) {
          if (active) setDemoBanner(null);
          return;
        }

        // Il nome vero della concessionaria, letto qui una volta per tutte le
        // pagine. Se la lettura fallisce si resta sul ripiego: un pannello
        // senza nome e' meglio di un pannello con il nome di nessuno.
        const { data: dealerRecord } = await supabase
          .from("dealers")
          .select("name, legal_name")
          .eq("id", dealerId)
          .maybeSingle<{ name: string | null; legal_name: string | null }>();

        if (active) {
          const nome = String(dealerRecord?.name ?? dealerRecord?.legal_name ?? "").trim();
          setResolvedDealerName(nome || null);
        }

        const demoContext = await resolveDemoAccessContext(supabase, dealerId);

        if (!active || !demoContext.isDemo) {
          if (active) setDemoBanner(null);
          return;
        }

        setDemoBanner({
          isDemo: true,
          demoStatus: demoContext.demoStatus,
          demoExpiresAt: demoContext.demoExpiresAt,
          daysRemaining: demoContext.daysRemaining,
        });
      } catch {
        if (active) setDemoBanner(null);
      }
    };

    void loadDemoContext();

    return () => {
      active = false;
    };
  }, []);

  // Quello che passa la pagina vince: Impostazioni, dopo il salvataggio, ha
  // il nome nuovo prima che il guscio possa rileggerlo dal database.
  const nomeMostrato = dealerName?.trim() || resolvedDealerName || "Concessionaria";

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] pb-8">
      <DealerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isDemo={Boolean(demoBanner?.isDemo)} />

      <div className="px-4 pt-4 sm:px-6 lg:ml-[17rem] lg:px-8 lg:pt-6">
        <DealerTopbar
          title={title}
          dealerName={nomeMostrato}
          avatarInitials={avatarInitials ?? toInitials(nomeMostrato)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <main className="mt-5 space-y-5">
          {demoBanner?.isDemo ? (
            <section
              className={`rounded-2xl border px-4 py-3 text-sm ${
                demoBanner.demoStatus === "revoked" || demoBanner.demoStatus === "expired"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : demoBanner.daysRemaining <= 2
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Versione Demo</p>
              <p className="mt-1 font-semibold">La tua prova gratuita e attiva</p>
              <p className="mt-1">
                Stato: {demoBanner.demoStatus ?? "active"} | Giorni rimanenti: {demoBanner.daysRemaining} | Scadenza: {formatDateTime(demoBanner.demoExpiresAt)}
              </p>
              <p className="mt-1">Stai utilizzando KeyAuto in modalita Demo. Alcune funzioni sono limitate durante il periodo di prova.</p>
              <div className="mt-2">
                <a
                  href="mailto:info@keyauto.it"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Attiva la versione completa
                </a>
              </div>
            </section>
          ) : null}

          {children}
        </main>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link href="/privacy" className="transition hover:text-slate-700">Informativa sulla privacy</Link>
          <span className="mx-2 text-slate-300">·</span>
          <Link href="/termini-concessionari" className="transition hover:text-slate-700">Condizioni Generali concessionari</Link>
        </footer>
      </div>
    </div>
  );
}