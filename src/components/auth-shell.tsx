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

const PUBLIC_ROUTES = ["/", "/login", "/forgot-password", "/registrazione", "/auto", "/ricerca", "/concessionarie"];

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/veicoli", label: "Veicoli" },
  { href: "/lead", label: "Lead" },
  { href: "/agenda", label: "Agenda" },
  { href: "/profilo", label: "Profilo" },
];

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = useMemo(() => PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)), [pathname]);
  const [checked, setChecked] = useState(isPublicRoute);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Le route pubbliche non richiedono alcun controllo autenticazione.
    // Non chiamiamo supabase.auth.getUser() per evitare chiamate Supabase
    // non necessarie che potrebbero restituire 401 su sessioni anonime.
    if (isPublicRoute) {
      setChecked(true);
      return;
    }

    let mounted = true;

    const syncAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      const hasUser = Boolean(user);
      setAuthenticated(hasUser);
      setChecked(true);

      if (!hasUser) {
        const next = encodeURIComponent(pathname || "/dashboard");
        router.replace(`/login?next=${next}`);
        return;
      }

      if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/registrazione") {
        const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
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

      if (event === "SIGNED_OUT") {
        const next = encodeURIComponent(pathname || "/dashboard");
        router.replace(`/login?next=${next}`);
        return;
      }

      if (hasUser && (pathname === "/login" || pathname === "/forgot-password" || pathname === "/registrazione")) {
        const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
        router.replace(next);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicRoute, pathname, router]);

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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <Link href="/dashboard" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-slate-900">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white" suppressHydrationWarning>DP</span>
            <span suppressHydrationWarning>DEALER PLATFORM</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            {NAV_ITEMS.map((item) => (
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
