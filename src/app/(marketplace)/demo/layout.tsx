import type { Metadata } from "next";
import { toAbsoluteUrl } from "@/lib/public-marketplace";

// La pagina demo e' un componente client e non puo' dichiarare metadata: senza
// questo layout si prendeva il titolo di ripiego del sito, che prima era
// "KeyAuto | Registrazione".
export const metadata: Metadata = {
  title: "Richiedi una demo",
  description:
    "Prova KeyAuto gratis: richiedi una demo e ricevi un accesso di prova al pannello concessionario, con pubblicazione annunci e gestione dei lead.",
  alternates: { canonical: toAbsoluteUrl("/demo") },
  openGraph: {
    title: "Richiedi una demo | KeyAuto",
    description: "Richiedi un accesso di prova al pannello concessionario KeyAuto.",
    url: toAbsoluteUrl("/demo"),
    type: "website",
  },
};

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
