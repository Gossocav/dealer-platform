/**
 * L'immagine che compare quando un link di KeyAuto viene incollato in
 * WhatsApp, Facebook, Instagram o in un annuncio a pagamento.
 *
 * Prima non ce n'era nessuna: un annuncio condiviso appariva come un
 * rettangolo grigio con due righe di testo. Su un marketplace di auto, dove la
 * foto e' il prodotto, quel rettangolo grigio e' la differenza fra un clic e
 * uno scorrimento.
 *
 * Le immagini si disegnano qui e non si prendono direttamente dalla galleria
 * del veicolo perche' le foto stanno in un archivio privato: gli indirizzi
 * sono firmati e scadono dopo un'ora, mentre un'anteprima social viene
 * richiesta anche mesi dopo la condivisione. Quello che si condivide e' un
 * indirizzo stabile del nostro sito, che al momento della richiesta va a
 * prendersi la foto.
 */
import { ImageResponse } from "next/og";

// La misura che si aspettano tutte le piattaforme: sotto i 1200x630 l'anteprima
// viene mostrata piccola e di lato invece che a tutta larghezza.
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

type OgCardInput = {
  /** La riga piccola in alto: "Scheda veicolo", "Concessionaria"... */
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  /** Foto da mostrare a destra. Se manca o non si carica, la scheda resta di solo testo. */
  photoUrl?: string | null;
};

const COLORS = {
  background: "#070a14",
  panel: "#0f172a",
  accent: "#37e0e8",
  text: "#ffffff",
  muted: "#94a3b8",
};

/**
 * La foto viene scaricata qui invece che lasciata a un tag immagine: se
 * l'archivio non risponde vogliamo una scheda senza foto, non un'anteprima
 * rotta. Un errore qui diventerebbe un rettangolo grigio, cioe' esattamente
 * il problema che stiamo risolvendo.
 */
async function loadPhoto(photoUrl: string | null | undefined) {
  if (!photoUrl) {
    return null;
  }

  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function renderOgCard({ eyebrow, title, subtitle, photoUrl }: OgCardInput) {
  const photo = await loadPhoto(photoUrl);
  const photoSrc = photo ? (photo as unknown as string) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: COLORS.background,
          color: COLORS.text,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
            width: photoSrc ? 640 : 1200,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: 20,
                background: "linear-gradient(135deg, #4c82f7, #1d4ed8)",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              KA
            </div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4 }}>KEYAUTO</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 6, color: COLORS.accent }}>
              {eyebrow.toUpperCase()}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: photoSrc ? 56 : 72,
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: COLORS.muted, lineHeight: 1.3 }}>
                {subtitle}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", fontSize: 24, color: COLORS.muted }}>
            Concessionarie verificate · Km e storico certificati
          </div>
        </div>

        {photoSrc ? (
          <div style={{ display: "flex", width: 560, height: "100%", background: COLORS.panel }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt="" width={560} height={630} style={{ objectFit: "cover" }} />
          </div>
        ) : null}
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
