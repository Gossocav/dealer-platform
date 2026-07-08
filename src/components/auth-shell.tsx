"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { TodayAppointmentsBadge } from "@/components/today-appointments-badge";
import { UserMenu } from "@/components/user-menu";
import { getDealerAccessResult, isPlatformAdminRole, resolveUserRoleFromMetadata, type DealerAccessState } from "@/lib/account-approval";
import { supabase } from "@/lib/supabaseClient";

type AuthShellProps = {
  children: React.ReactNode;
};

const PUBLIC_ROUTES = ["/", "/login", "/forgot-password", "/reset-password", "/registrazione", "/auto", "/ricerca", "/concessionarie"];

const DEALER_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/veicoli", label: "Veicoli" },
  { href: "/lead", label: "Lead" },
  { href: "/agenda", label: "Agenda" },
  { href: "/profilo", label: "Profilo" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Pannello Admin" },
  { href: "/admin/dealer-approval", label: "Approvazione Dealer" },
  { href: "/admin/dealers", label: "Gestione Dealer" },
];

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

function resolvePrimaryDealerRoute(state: DealerAccessState) {
  if (state === "suspended" || state === "cancelled") {
    return "/account/sospeso" as const;
  }

  if (state === "pending_review" || state === "rejected") {
    return "/account/in-attesa" as const;
  }

  if (state === "approved") {
    return "/dashboard" as const;
  }

  return null;
}

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = useMemo(
    () => [...PUBLIC_ROUTES, "/admin/login"].some((route) => pathname === route || pathname.startsWith(`${route}/`)),
    [pathname]
  );
  const isAdminRoute = useMemo(() => pathname === "/admin" || pathname.startsWith("/admin/"), [pathname]);
  const isAdminLoginRoute = pathname === "/admin/login";
  const isWaitingRoute = useMemo(() => pathname === "/account/in-attesa" || pathname.startsWith("/account/in-attesa/"), [pathname]);
  const isSuspendedRoute = useMemo(() => pathname === "/account/sospeso" || pathname.startsWith("/account/sospeso/"), [pathname]);
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [accountApproved, setAccountApproved] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [dealerStateResolved, setDealerStateResolved] = useState(false);
  const [dealerTargetRoute, setDealerTargetRoute] = useState<"/account/sospeso" | "/account/in-attesa" | "/dashboard" | null>(null);
  const [dealerResolutionError, setDealerResolutionError] = useState<string | null>(null);
  const lastDealerStateRef = useRef<DealerAccessState>("unknown");

  useEffect(() => {
    // Le route pubbliche non richiedono alcun controllo autenticazione.
    // Non chiamiamo supabase.auth.getUser() per evitare chiamate Supabase
    // non necessarie che potrebbero restituire 401 su sessioni anonime.
    if (isPublicRoute) return;

    let mounted = true;

    const resolvePlatformAdminFromProfile = async (userId: string) => {
      const profile = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle<{ role: string | null }>();

      if (profile.error) {
        return false;
      }

      return isPlatformAdminRole(profile.data?.role);
    };

    const syncAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      const userId = user?.id ?? null;
      const hasUser = Boolean(userId);
      setAuthenticated(hasUser);
      setChecked(true);
      setDealerStateResolved(false);
      setDealerTargetRoute(null);
      setDealerResolutionError(null);

      if (!userId) {
        const next = encodeURIComponent(pathname || "/dashboard");
        if (isAdminRoute) {
          router.replace(`/admin/login?next=${next}`);
          return;
        }

        router.replace(`/login?next=${next}`);
        return;
      }

      let platformAdmin = isPlatformAdminRole(resolveUserRoleFromMetadata(user));
      if (!platformAdmin) {
        platformAdmin = await resolvePlatformAdminFromProfile(userId);
      }

      setIsPlatformAdmin(platformAdmin);

      if (platformAdmin) {
        setAccountApproved(true);
        setDealerStateResolved(true);
        setDealerTargetRoute("/dashboard");
        console.info("[auth-shell] dealer resolution skipped for platform admin", {
          profile_id: userId,
          route: "/admin",
        });

        if (!isAdminRoute || isAdminLoginRoute) {
          router.replace("/admin");
        }

        return;
      }

      if (isAdminRoute) {
        router.replace("/login");
        return;
      }

      let dealerState: DealerAccessState = "unknown";
      try {
        const result = await getDealerAccessResult(supabase, userId);
        dealerState = result.state;
        console.info("[auth-shell] dealer state read", {
          source: "syncAuth",
          profile_id: userId,
          dealer_id: result.dealerId,
          state: result.state,
          dealer_status: result.dealerStatus,
          membership_status: result.membershipStatus,
        });
      } catch {
        dealerState = "unknown";
        console.error("[auth-shell] dealer state read failed", {
          source: "syncAuth",
          profile_id: userId,
        });
      }

      if (dealerState === "unknown" && lastDealerStateRef.current !== "unknown") {
        dealerState = lastDealerStateRef.current;
      } else {
        lastDealerStateRef.current = dealerState;
      }

      const dealerTargetRoute = resolvePrimaryDealerRoute(dealerState);
      const approved = dealerState === "approved";

      setAccountApproved(approved);
      if (!dealerTargetRoute) {
        if (lastDealerStateRef.current !== "unknown") {
          const fallbackRoute = resolvePrimaryDealerRoute(lastDealerStateRef.current);
          setDealerTargetRoute(fallbackRoute);
          setDealerStateResolved(true);
          setDealerResolutionError("Stato account temporaneamente non disponibile. Riprova.");
          console.error("[auth-shell] unresolved dealer state - using last known", {
            source: "syncAuth",
            profile_id: userId,
            state: dealerState,
            last_known_state: lastDealerStateRef.current,
            route: fallbackRoute,
            reason: "current state unresolved",
          });
          return;
        }

        setDealerStateResolved(true);
        setDealerTargetRoute(null);
        setDealerResolutionError("Impossibile verificare lo stato account. Riprova.");
        console.error("[auth-shell] unresolved dealer state with no fallback", {
          source: "syncAuth",
          profile_id: userId,
          state: dealerState,
          reason: "no last known state available",
        });
        return;
      }

      setDealerStateResolved(true);
      setDealerTargetRoute(dealerTargetRoute);
      console.info("[auth-shell] dealer route selected", {
        source: "syncAuth",
        profile_id: userId,
        state: dealerState,
        route: dealerTargetRoute,
      });

      if (dealerTargetRoute === "/account/sospeso" && !isSuspendedRoute) {
        router.replace(dealerTargetRoute);
        return;
      }

      if (dealerTargetRoute === "/account/in-attesa" && !isWaitingRoute) {
        router.replace(dealerTargetRoute);
        return;
      }

      if (dealerTargetRoute === "/dashboard" && (isWaitingRoute || isSuspendedRoute)) {
        router.replace(dealerTargetRoute);
        return;
      }

      if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/registrazione") {
        const next = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));
        router.replace(next);
      }
    };

    void syncAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const hasUser = Boolean(session?.user);
      setAuthenticated(hasUser);
      setChecked(true);

      if (!hasUser) {
        setAccountApproved(false);
        setIsPlatformAdmin(false);
        setDealerStateResolved(false);
        setDealerTargetRoute(null);
        setDealerResolutionError(null);
      }

      if (event === "SIGNED_OUT") {
        const next = encodeURIComponent(pathname || "/dashboard");
        if (isAdminRoute) {
          router.replace(`/admin/login?next=${next}`);
          return;
        }

        router.replace(`/login?next=${next}`);
        return;
      }

      if (hasUser && session?.user) {
        void (async () => {
          let platformAdmin = isPlatformAdminRole(resolveUserRoleFromMetadata(session.user));
          if (!platformAdmin) {
            platformAdmin = await resolvePlatformAdminFromProfile(session.user.id);
          }

          if (platformAdmin) {
            if (!mounted) return;
            setIsPlatformAdmin(true);
            setAccountApproved(true);
            setDealerStateResolved(true);
            setDealerTargetRoute("/dashboard");
            setDealerResolutionError(null);
            console.info("[auth-shell] dealer resolution skipped for platform admin", {
              source: "onAuthStateChange",
              profile_id: session.user.id,
              route: "/admin",
            });

            if (!isAdminRoute || isAdminLoginRoute) {
              router.replace("/admin");
            }

            return;
          }

          setIsPlatformAdmin(false);

          if (isAdminRoute) {
            router.replace("/login");
            return;
          }

          let dealerState: DealerAccessState = "unknown";
          try {
            const result = await getDealerAccessResult(supabase, session.user.id);
            dealerState = result.state;
            console.info("[auth-shell] dealer state read", {
              source: "onAuthStateChange",
              profile_id: session.user.id,
              dealer_id: result.dealerId,
              state: result.state,
              dealer_status: result.dealerStatus,
              membership_status: result.membershipStatus,
            });
          } catch {
            dealerState = "unknown";
            console.error("[auth-shell] dealer state read failed", {
              source: "onAuthStateChange",
              profile_id: session.user.id,
            });
          }

          if (dealerState === "unknown" && lastDealerStateRef.current !== "unknown") {
            dealerState = lastDealerStateRef.current;
          } else {
            lastDealerStateRef.current = dealerState;
          }

          const dealerTargetRoute = resolvePrimaryDealerRoute(dealerState);
          const approved = dealerState === "approved";

          if (!mounted) return;
          setAccountApproved(approved);
          if (!dealerTargetRoute) {
            if (lastDealerStateRef.current !== "unknown") {
              const fallbackRoute = resolvePrimaryDealerRoute(lastDealerStateRef.current);
              setDealerTargetRoute(fallbackRoute);
              setDealerStateResolved(true);
              setDealerResolutionError("Stato account temporaneamente non disponibile. Riprova.");
              console.error("[auth-shell] unresolved dealer state - using last known", {
                source: "onAuthStateChange",
                profile_id: session.user.id,
                state: dealerState,
                last_known_state: lastDealerStateRef.current,
                route: fallbackRoute,
                reason: "current state unresolved",
              });
              return;
            }

            setDealerStateResolved(true);
            setDealerTargetRoute(null);
            setDealerResolutionError("Impossibile verificare lo stato account. Riprova.");
            console.error("[auth-shell] unresolved dealer state with no fallback", {
              source: "onAuthStateChange",
              profile_id: session.user.id,
              state: dealerState,
              reason: "no last known state available",
            });
            return;
          }

          setDealerStateResolved(true);
          setDealerTargetRoute(dealerTargetRoute);
          setDealerResolutionError(null);
          console.info("[auth-shell] dealer route selected", {
            source: "onAuthStateChange",
            profile_id: session.user.id,
            state: dealerState,
            route: dealerTargetRoute,
          });

          if (dealerTargetRoute === "/account/sospeso" && !isSuspendedRoute) {
            router.replace(dealerTargetRoute);
            return;
          }

          if (dealerTargetRoute === "/account/in-attesa" && !isWaitingRoute) {
            router.replace(dealerTargetRoute);
            return;
          }

          if (dealerTargetRoute === "/dashboard" && (isWaitingRoute || isSuspendedRoute)) {
            router.replace(dealerTargetRoute);
            return;
          }
        })();
      }

      if (hasUser && (pathname === "/login" || pathname === "/forgot-password" || pathname === "/registrazione" || pathname === "/admin/login")) {
        const next = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));
        router.replace(next);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isAdminLoginRoute, isAdminRoute, isPublicRoute, isSuspendedRoute, isWaitingRoute, pathname, router]);

  if (!checked && !isPublicRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verifica autenticazione...
      </div>
    );
  }

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Reindirizzamento...
      </div>
    );
  }

  if (!isPlatformAdmin && !dealerStateResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verifica account in corso...
      </div>
    );
  }

  if (!isPlatformAdmin && dealerResolutionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-600">
        {dealerResolutionError}
      </div>
    );
  }

  if (
    !isPlatformAdmin &&
    dealerStateResolved &&
    (
      (dealerTargetRoute === "/account/sospeso" && isWaitingRoute) ||
      (dealerTargetRoute === "/account/in-attesa" && isSuspendedRoute) ||
      (dealerTargetRoute === "/dashboard" && (isWaitingRoute || isSuspendedRoute))
    )
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verifica account in corso...
      </div>
    );
  }

  if (!accountApproved && !isWaitingRoute && !isSuspendedRoute && !isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Reindirizzamento...
      </div>
    );
  }

  if (!accountApproved && isWaitingRoute && !isPlatformAdmin) {
    return (
      <>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
            <Link href="/account/in-attesa" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-slate-900">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white" suppressHydrationWarning>DP</span>
              <span suppressHydrationWarning>DEALER PLATFORM</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </>
    );
  }

  if (!accountApproved && isSuspendedRoute && !isPlatformAdmin) {
    return (
      <>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
            <Link href="/account/sospeso" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-slate-900">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white" suppressHydrationWarning>DP</span>
              <span suppressHydrationWarning>DEALER PLATFORM</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <Link href={isPlatformAdmin ? "/admin" : "/dashboard"} className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-slate-900">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white" suppressHydrationWarning>DP</span>
            <span suppressHydrationWarning>DEALER PLATFORM</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            {(isPlatformAdmin ? ADMIN_NAV_ITEMS : DEALER_NAV_ITEMS).map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                {item.label}
              </Link>
            ))}
            <TodayAppointmentsBadge />
            <NotificationBell />
            <UserMenu />
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
