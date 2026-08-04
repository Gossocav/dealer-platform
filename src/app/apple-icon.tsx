import { ImageResponse } from "next/og";

/**
 * L'icona che iPhone e iPad usano quando qualcuno salva il sito sulla schermata
 * principale, e che compare in diversi punti quando un link viene condiviso.
 *
 * Mancava: /apple-touch-icon.png rispondeva 404, e in quel caso Apple ripiega
 * su uno screenshot della pagina, di solito illeggibile.
 *
 * E' disegnata qui invece di essere un file immagine per lo stesso motivo
 * delle anteprime social: un'immagine in piu' da tenere allineata ai colori
 * del sito e' una cosa che prima o poi diverge.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4c82f7, #1d4ed8)",
          color: "#ffffff",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        KA
      </div>
    ),
    size,
  );
}
