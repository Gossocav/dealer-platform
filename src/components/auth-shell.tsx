"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { TodayAppointmentsBadge } from "@/components/today-appointments-badge";
import { UserMenu } from "@/components/user-menu";
import { supabase } from "@/lib/supabaseClient";

type AuthShellProps = {
  children: React.ReactNode;
};

type AccountRoute = "/admin" | "/account/sospeso" | "/account/in-attesa" | "/dashboard";

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

const RESOLUTION_TIMEOUT_MS = 3000;
const RESOLUTION_ERROR_MESSAGE = "Impossibile verificare lo stato account. Esci e riprova.";

function isAccountRoute(value: unknown): value is AccountRoute {
  return value === "/admin" || value === "/account/sospeso" || value === "/account/in-attesa" || value === "/dashboard";
}

async function resolveAccountRouteWithTimeout(accessToken: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);

  try {
    const response = await fetch("/api/account/resolve-route", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`resolve-route-${response.status}`);
    }

    const payload = (await response.json()) as { route?: unknown; status?: unknown };

    if (!isAccountRoute(payload.route)) {
      throw new Error("resolve-route-invalid-payload");
    }

    return {
      route: payload.route,
      status: String(payload.status ?? "unknown"),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("resolve-route-timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
  const [resolvedRoute, setResolvedRoute] = useState<AccountRoute | null>(null);
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const forceLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  useEffect(() => {
    if (isPublicRoute) {
      return;
    }

    let mounted = true;

    const redirectUnauthenticated = () => {
      const next = encodeURIComponent(pathname || "/dashboard");

      if (isAdminRoute) {
        router.replace(`/admin/login?next=${next}`);
        return;
      }

      router.replace(`/login?next=${next}`);
    };

    const resolveAndApplyRoute = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      const hasUser = Boolean(user?.id);
      setChecked(true);
      setAuthenticated(hasUser);

      if (!hasUser) {
        setResolvedRoute(null);
        setIsResolvingRoute(false);
        setResolutionError(null);
        redirectUnauthenticated();
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = String(session?.access_token ?? "").trim();
      if (!accessToken) {
        setIsResolvingRoute(false);
        setResolvedRoute(null);
        setResolutionError(RESOLUTION_ERROR_MESSAGE);
        console.error("[auth-shell] missing access token for resolve-route");
        return;
      }

      setResolutionError(null);
      setIsResolvingRoute(true);
      setResolvedRoute(null);

      try {
        const result = await resolveAccountRouteWithTimeout(accessToken);
        if (!mounted) return;

        setResolvedRoute(result.route);
        setIsResolvingRoute(false);

        console.info("[auth-shell] route resolved", {
          route: result.route,
          status: result.status,
        });
      } catch (error) {
        if (!mounted) return;

        setIsResolvingRoute(false);
        setResolvedRoute(null);
        setResolutionError(RESOLUTION_ERROR_MESSAGE);

        console.error("[auth-shell] route resolution failed", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    };

    void resolveAndApplyRoute();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const hasUser = Boolean(session?.user);
      setChecked(true);
      setAuthenticated(hasUser);

      if (!hasUser) {
        setResolvedRoute(null);
        setIsResolvingRoute(false);
        setResolutionError(null);
      }

      if (event === "SIGNED_OUT") {
        redirectUnauthenticated();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        void resolveAndApplyRoute();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isAdminRoute, isPublicRoute, pathname, router]);

  useEffect(() => {
    if (isPublicRoute || !authenticated || !resolvedRoute) {
      return;
    }

    if (resolvedRoute === "/admin") {
      if (!isAdminRoute || isAdminLoginRoute) {
        router.replace("/admin");
      }
      return;
    }

    if (resolvedRoute === "/account/sospeso") {
      if (!isSuspendedRoute) {
        router.replace("/account/sospeso");
      }
      return;
    }

    if (resolvedRoute === "/account/in-attesa") {
      if (!isWaitingRoute) {
        router.replace("/account/in-attesa");
      }
      return;
    }

    if (resolvedRoute === "/dashboard") {
      if (isWaitingRoute || isSuspendedRoute || isAdminRoute) {
        router.replace("/dashboard");
      }
    }
  }, [authenticated, isAdminLoginRoute, isAdminRoute, isPublicRoute, isSuspendedRoute, isWaitingRoute, resolvedRoute, router]);

  const isPlatformAdmin = resolvedRoute === "/admin";
  const accountApproved = isPlatformAdmin || resolvedRoute === "/dashboard";

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

  if (resolutionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-700">{resolutionError}</p>
          <button
            type="button"
            onClick={() => void forceLogout()}
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (isResolvingRoute || !resolvedRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verifica account in corso...
      </div>
    );
  }

  if (
    (resolvedRoute === "/account/sospeso" && !isSuspendedRoute) ||
    (resolvedRoute === "/account/in-attesa" && !isWaitingRoute) ||
    (resolvedRoute === "/dashboard" && (isWaitingRoute || isSuspendedRoute || isAdminRoute)) ||
    (resolvedRoute === "/admin" && !isAdminRoute)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Reindirizzamento...
      </div>
    );
  }

  if (!accountApproved && resolvedRoute === "/account/in-attesa") {
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

  if (!accountApproved && resolvedRoute === "/account/sospeso") {
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
