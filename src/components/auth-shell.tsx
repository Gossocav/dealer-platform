"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type AuthShellProps = {
  children: React.ReactNode;
};

const PUBLIC_OR_STATUS_ROUTES = [
  "/",
  "/demo",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/registrazione",
  "/auto",
  "/ricerca",
  "/concessionarie",
  "/come-funziona",
  "/per-chi-compra",
  "/per-le-concessionarie",
  "/faq",
  "/privacy",
  "/termini",
  "/termini-concessionari",
  "/consenso-marketing",
  "/account/sospeso",
  "/account/in-attesa",
];

export function AuthShell({ children }: AuthShellProps) {
  // Il ripiego su "/" non e' cautela generica, e' la correzione di un difetto
  // osservato: in produzione la home serviva a Google -- e a chiunque non
  // esegua JavaScript -- la scritta "Verifica autenticazione..." al posto
  // della pagina.
  //
  // Il motivo: quando il percorso arriva vuoto, il confronto qui sotto
  // fallisce su *ogni* voce dell'elenco delle route pubbliche ("" non e' "/",
  // e "" non comincia per "//"), quindi la radice viene scambiata per una
  // pagina protetta. Le altre route non se ne accorgono, perche' il loro
  // percorso coincide con la propria voce: e' per questo che falliva solo la
  // home.
  // **Sonda temporanea, 21/09/2026 -- e il giro per toglierla e' scritto
  // prima di metterla, non dopo.**
  //
  // La home serve 63 caratteri -- questo segnaposto -- a chi non esegue
  // JavaScript, ma **solo nelle copie ricostruite a runtime**: quella
  // costruita alla pubblicazione e' giusta e dura cinque minuti. Una scheda
  // auto, con lo stesso meccanismo, si ricostruisce benissimo: l'unica cosa
  // che distingue la home e' che il suo percorso e' la radice, cioe'
  // esattamente cio' su cui girava il difetto del 2026 (`""` che non e'
  // `"/"`). Il ripiego qui sotto copre il vuoto; se alla ricostruzione
  // arriva un **terzo valore**, non lo copre -- e non si sa quale sia.
  //
  // Invece di dedurlo, lo si fa dire alla pagina: il valore grezzo finisce
  // nel segnaposto come attributo, quindi resta scritto **dentro la copia
  // sbagliata**, che e' l'oggetto che poi si legge. Non serve un'intestazione
  // e non servono i log: una pagina statica non puo' scrivere intestazioni al
  // momento della ricostruzione, e i log di quella ricostruzione potrebbero
  // non arrivare mai.
  //
  // **COME SI TOGLIE, quando avra' risposto:**
  // 1. si legge il valore: `curl -s https://www.keyauto.it/ | grep -o
  //    'data-percorso-grezzo="[^"]*"'` su una copia con `age` maggiore di
  //    300 (cioe' ricostruita, non quella della pubblicazione);
  // 2. si scrive il valore trovato in `supabase/MIGRAZIONI.md`, accanto alla
  //    diagnosi della home;
  // 3. si toglie `percorsoGrezzo`, si rimette `const pathname =
  //    usePathname() || "/";` su una riga sola, e si toglie l'attributo dal
  //    segnaposto piu' sotto;
  // 4. i due guardiani che pretendono quella riga
  //    (`auth-shell-public-routes.test.ts`, `home-in-cache.test.ts`) tornano
  //    verdi da soli: guardano la proprieta', non la forma.
  const percorsoGrezzo = usePathname();
  const pathname = percorsoGrezzo || "/";
  const router = useRouter();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  const isPublicOrStatusRoute = useMemo(
    () => PUBLIC_OR_STATUS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)),
    [pathname]
  );

  const routeKind = isPublicOrStatusRoute ? "public" : isAdminRoute ? "admin" : "protected";

  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [checkedRouteKind, setCheckedRouteKind] = useState(routeKind);

  // AuthShell stays mounted for the whole app, so checked/authenticated
  // persist across client-side route changes. Without this, navigating from
  // a public route (e.g. /admin/login) straight into a protected one would
  // reuse whatever authenticated value was left over from the last
  // protected route this session visited, painting that page's real content
  // for a frame before the fresh check (in the effect below) corrects it.
  // Resetting during render, rather than inside the effect, means React
  // discards the stale render before it ever commits/paints.
  if (routeKind !== checkedRouteKind) {
    setCheckedRouteKind(routeKind);
    setChecked(false);
    setAuthenticated(false);
  }

  useEffect(() => {
    if (isPublicOrStatusRoute) {
      return;
    }

    let mounted = true;

    const resolveAdminAuthorization = async (userId: string, metadataRole: string | null | undefined) => {
      let isAuthorized = isPlatformAdminRole(metadataRole);

      if (!isAuthorized) {
        const profile = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle<{ role: string | null }>();
        if (!profile.error) {
          isAuthorized = isPlatformAdminRole(profile.data?.role);
        }
      }

      return isAuthorized;
    };

    const ensureAuthenticated = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user?.id) {
        setChecked(true);
        setAuthenticated(false);
        router.replace(isAdminRoute ? "/admin/login" : "/login");
        return;
      }

      if (isAdminRoute) {
        const isAuthorized = await resolveAdminAuthorization(user.id, resolveUserRoleFromMetadata(user));
        if (!mounted) return;

        if (!isAuthorized) {
          setChecked(true);
          setAuthenticated(false);
          router.replace("/dashboard");
          return;
        }
      }

      setChecked(true);
      setAuthenticated(true);
    };

    void ensureAuthenticated();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Only react to an actual sign-out here. This listener also fires for
      // unrelated events (token refresh, tab focus, etc.) using a possibly
      // stale cached session/JWT -- re-running the admin authorization check
      // on every one of those caused a flash-then-revert bug where a
      // correctly authorized admin view would immediately bounce back to
      // /dashboard. The one-time check in ensureAuthenticated() above (which
      // always uses a fresh auth.getUser() call) is the sole authority for
      // whether this page view is authenticated/authorized.
      const hasUser = Boolean(session?.user);

      if (!hasUser || event === "SIGNED_OUT") {
        setChecked(true);
        setAuthenticated(false);
        router.replace(isAdminRoute ? "/admin/login" : "/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isAdminRoute, isPublicOrStatusRoute, router]);

  if (isPublicOrStatusRoute) {
    return <>{children}</>;
  }

  if (!checked) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"
        data-percorso-grezzo={percorsoGrezzo === "" ? "(stringa vuota)" : String(percorsoGrezzo)}
      >
        Verifica autenticazione...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Reindirizzamento...
      </div>
    );
  }

  return <>{children}</>;
}
