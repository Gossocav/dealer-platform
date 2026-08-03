import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthShell } from "@/components/auth-shell";
import { getAppBaseUrl } from "@/lib/public-marketplace";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Questo e' il ripiego che prende ogni pagina che non dichiara un titolo suo.
// Era "KeyAuto | Registrazione": lo mostravano davvero, su Google e nella
// linguetta del browser, l'elenco concessionarie, la richiesta demo e ogni
// pagina del gestionale.
//
// Il template aggiunge "| KeyAuto" ai titoli che non ce l'hanno gia', cosi'
// ogni pagina si presenta allo stesso modo senza doverlo ripetere a mano.
// Chi vuole un titolo intero usa `title: { absolute: "..." }`.
export const metadata: Metadata = {
  // Senza questo, un'immagine di anteprima indicata come percorso relativo
  // fa fallire la build invece di diventare un indirizzo completo.
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "KeyAuto | Il marketplace delle concessionarie verificate",
    template: "%s | KeyAuto",
  },
  description:
    "KeyAuto: il marketplace auto con concessionarie verificate. Esplora veicoli nuovi, usati e km 0 in tutta Italia.",
  // X non copia da solo l'anteprima Open Graph, ma senza carta dichiarata la
  // mostrerebbe comunque piccola e di lato invece che a tutta larghezza.
  twitter: {
    card: "summary_large_image",
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
