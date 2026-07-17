import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthShell } from "@/components/auth-shell";
import "./globals.css";

const appBaseUrl =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl),
  title: {
    default: "Dealer Platform",
    template: "%s | Dealer Platform",
  },
  description: "Piattaforma multi-tenant per concessionarie: marketplace pubblico e area dealer.",
  applicationName: "Dealer Platform",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
