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
  "/account/sospeso",
  "/account/in-attesa",
];

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

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
