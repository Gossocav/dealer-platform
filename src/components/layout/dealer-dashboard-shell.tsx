"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DealerSidebar } from "@/components/layout/dealer-sidebar";
import { DealerTopbar } from "@/components/layout/dealer-topbar";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";
import type { DemoModules } from "@/lib/demo-profiles";

type DealerDashboardShellProps = {
  title: string;
  dealerName: string;
  avatarInitials: string;
  unreadNotifications: number;
  children: ReactNode;
};

type ShellDemoBanner = {
  isDemo: boolean;
  demoStatus: string | null;
  demoExpiresAt: string | null;
  daysRemaining: number;
  modules: DemoModules;
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
  unreadNotifications,
  children,
}: DealerDashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [demoBanner, setDemoBanner] = useState<ShellDemoBanner | null>(null);

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
          modules: demoContext.modules,
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

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[radial-gradient(circle_at_top_right,#e0f2fe_0%,#f8fafc_42%,#f8fafc_100%)] pb-8">
      <DealerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isDemo={Boolean(demoBanner?.isDemo)} demoModules={demoBanner?.modules ?? null} />

      <div className="px-4 pt-4 sm:px-6 lg:ml-[17rem] lg:px-8 lg:pt-6">
        <DealerTopbar
          title={title}
          dealerName={dealerName}
          avatarInitials={avatarInitials}
          unreadNotifications={unreadNotifications}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <main className="mt-5 space-y-5">
          {demoBanner?.isDemo ? (
            <section
              className={`rounded-2xl border px-4 py-3 text-sm ${
                demoBanner.demoStatus === "revoked" || demoBanner.demoStatus === "expired" || demoBanner.demoStatus === "suspended"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : demoBanner.daysRemaining <= 2
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-sky-200 bg-sky-50 text-sky-800"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Versione Demo</p>
              <p className="mt-1 font-semibold">
                {demoBanner.demoStatus === "expired" ? "La Demo è scaduta. Contatta l’amministratore per proseguire."
                  : demoBanner.demoStatus === "suspended" ? "La Demo è temporaneamente sospesa. Contatta l’amministratore."
                    : demoBanner.demoStatus === "revoked" ? "L’accesso Demo è stato revocato."
                      : "La tua prova gratuita è attiva"}
              </p>
              <p className="mt-1">Stato: {demoBanner.demoStatus ?? "active"} | Giorni rimanenti: {demoBanner.daysRemaining} | Scadenza: {formatDateTime(demoBanner.demoExpiresAt)}</p>
              {demoBanner.demoStatus === "active" ? <p className="mt-1">Stai utilizzando Dealer Platform in modalità Demo. Alcune funzioni sono limitate durante il periodo di prova.</p> : null}
              <div className="mt-2">
                <a
                  href="mailto:support@dealerplatform.it"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Attiva la versione completa
                </a>
              </div>
            </section>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
