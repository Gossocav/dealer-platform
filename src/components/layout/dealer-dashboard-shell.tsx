"use client";

import { useState, type ReactNode } from "react";
import { DealerSidebar } from "@/components/layout/dealer-sidebar";
import { DealerTopbar } from "@/components/layout/dealer-topbar";

type DealerDashboardShellProps = {
  title: string;
  dealerName: string;
  avatarInitials: string;
  unreadNotifications: number;
  children: ReactNode;
};

export function DealerDashboardShell({
  title,
  dealerName,
  avatarInitials,
  unreadNotifications,
  children,
}: DealerDashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[radial-gradient(circle_at_top_right,#e0f2fe_0%,#f8fafc_42%,#f8fafc_100%)] pb-8">
      <DealerSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="px-4 pt-4 sm:px-6 lg:ml-[17rem] lg:px-8 lg:pt-6">
        <DealerTopbar
          title={title}
          dealerName={dealerName}
          avatarInitials={avatarInitials}
          unreadNotifications={unreadNotifications}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <main className="mt-5 space-y-5">{children}</main>
      </div>
    </div>
  );
}