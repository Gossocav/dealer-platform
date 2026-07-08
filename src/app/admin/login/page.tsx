import { Suspense } from "react";
import { AdminLogin } from "@/components/admin-login";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AdminLogin />
    </Suspense>
  );
}
