"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DealerSidebar } from "@/components/layout/dealer-sidebar";
import { DealerTopbar } from "@/components/layout/dealer-topbar";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { resolveDemoAccessContext } from "@/lib/demo-access";
import { GIORNI_DI_PREAVVISO_PASSWORD, giorniAllaScadenzaPassword } from "@/lib/password-rules";
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

/**
 * Quanto manca alla scadenza della password di chi sta guardando.
 *
 * `null` finche' non si sa: prima che la risposta arrivi non si blocca
 * niente, altrimenti il gestionale sbatterebbe in faccia un avviso a ogni
 * apertura di pagina per il decimo di secondo in cui la risposta e' in volo.
 */
type ShellPassword = { giorniRimasti: number } | null;

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
  const [password, setPassword] = useState<ShellPassword>(null);

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

        // La password scade dopo tre mesi, e la data dell'ultimo cambio la
        // tiene il server dentro l'account: qui si legge soltanto. Un account
        // nato prima di questa regola non ce l'ha, e allora la si fa scrivere
        // adesso -- i tre mesi partono dal primo ingresso, invece di buttare
        // fuori tutti quanti il giorno in cui la regola entra in vigore.
        try {
          const metadati = (user.app_metadata ?? {}) as Record<string, unknown>;
          let cambiataIl = typeof metadati.password_changed_at === "string" ? metadati.password_changed_at : null;

          if (!cambiataIl) {
            const { data: sessione } = await supabase.auth.getSession();
            const token = sessione.session?.access_token;

            if (token) {
              const risposta = await fetch("/api/account/password-aggiornata", {
                method: "POST",
                headers: { authorization: `Bearer ${token}` },
              });
              const esito = (await risposta.json().catch(() => ({}))) as { passwordChangedAt?: string };
              cambiataIl = esito.passwordChangedAt ?? null;
            }
          }

          const giorni = giorniAllaScadenzaPassword(cambiataIl);
          if (active && giorni !== null) setPassword({ giorniRimasti: giorni });
        } catch {
          // Non sapere quando scade non deve chiudere il gestionale: si
          // riprova alla prossima apertura di pagina.
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

  const passwordScaduta = password !== null && password.giorniRimasti <= 0;
  const passwordInScadenza =
    password !== null && password.giorniRimasti > 0 && password.giorniRimasti <= GIORNI_DI_PREAVVISO_PASSWORD;

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] pb-8">
      {/* Il menu, la barra e il pie' di pagina sono comandi: su carta non
          servono, e mangerebbero mezzo foglio a ogni stampa. */}
      <div className="no-print">
        <DealerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} isDemo={Boolean(demoBanner?.isDemo)} />
      </div>

      <div className="px-4 pt-4 sm:px-6 lg:ml-[17rem] lg:px-8 lg:pt-6 print:ml-0 print:p-0">
        <div className="no-print">
          <DealerTopbar
            title={title}
            dealerName={nomeMostrato}
            avatarInitials={avatarInitials ?? toInitials(nomeMostrato)}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
        </div>

        <main className="mt-5 space-y-5 print:mt-0">
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

          {/* Password scaduta: si tiene il guscio -- barra, menu, nome della
              concessionaria -- e si sostituisce solo il contenuto. Una pagina
              bianca con un errore sembra un guasto; cosi' invece si vede dove
              si e' e cosa manca per rientrare. */}
          {passwordScaduta ? (
            <section className="rounded-3xl border border-amber-200 bg-white px-6 py-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Password scaduta</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">E&apos; ora di cambiare la password</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Per sicurezza la password si rinnova ogni tre mesi. Sceglila di nuovo e torni subito dentro: i tuoi
                dati, i veicoli e i clienti restano dove sono.
              </p>
              <Link
                href="/reset-password"
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Cambia la password
              </Link>
            </section>
          ) : (
            <>
              {passwordInScadenza ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">
                    La password scade fra {password?.giorniRimasti} {password?.giorniRimasti === 1 ? "giorno" : "giorni"}.
                  </p>
                  <p className="mt-1">
                    Puoi cambiarla adesso da{" "}
                    <Link href="/reset-password" className="font-semibold underline">
                      questa pagina
                    </Link>
                    , senza aspettare che scada.
                  </p>
                </section>
              ) : null}

              {children}
            </>
          )}
        </main>

        <footer className="no-print mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link href="/privacy" className="transition hover:text-slate-700">Informativa sulla privacy</Link>
          <span className="mx-2 text-slate-300">·</span>
          <Link href="/termini-concessionari" className="transition hover:text-slate-700">Condizioni Generali concessionari</Link>
        </footer>
      </div>
    </div>
  );
}