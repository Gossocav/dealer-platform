"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AuthShellProps = {
  children: React.ReactNode;
};

const PUBLIC_OR_STATUS_ROUTES = [
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/registrazione",
  "/auto",
  "/ricerca",
  "/concessionarie",
  "/account/sospeso",
  "/account/in-attesa",
];

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isPublicOrStatusRoute = useMemo(
    () => PUBLIC_OR_STATUS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)),
    [pathname]
  );

  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (isPublicOrStatusRoute) {
      return;
    }

    let mounted = true;

    const ensureAuthenticated = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      const hasUser = Boolean(user?.id);
      setChecked(true);
      setAuthenticated(hasUser);

      if (!hasUser) {
        router.replace("/login");
      }
    };

    void ensureAuthenticated();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const hasUser = Boolean(session?.user);
      setChecked(true);
      setAuthenticated(hasUser);

      if (!hasUser || event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicOrStatusRoute, router]);

  if (isPublicOrStatusRoute) {
    return <>{children}</>;
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
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
