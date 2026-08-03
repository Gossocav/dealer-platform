import { OG_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgCard } from "@/lib/og-card";

// L'anteprima di riserva del sito: vale per la home e per ogni pagina che non
// ne dichiara una propria (chi siamo, faq, piani, privacy...).
export const alt = "KeyAuto — il marketplace delle concessionarie verificate";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return renderOgCard({
    eyebrow: "Marketplace auto",
    title: "Trova la tua prossima auto",
    subtitle: "Veicoli nuovi, usati e km 0 dalle concessionarie verificate di tutta Italia.",
  });
}
