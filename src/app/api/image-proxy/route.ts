import { NextRequest, NextResponse } from "next/server";
import { assertHostPubblico, IndirizzoNonAmmesso } from "@/lib/ssrf-protection";
import { accettaWebp, larghezzaFotoRichiesta, motivoFotoIntera, qualitaFotoRichiesta, rimpicciolisciFoto } from "@/lib/foto-misure";

export const runtime = "nodejs";

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 10_000;


/**
 * Il messaggio vero del primo fallimento, scritto nei log del server.
 *
 * L'intestazione `x-foto-esito` dice la categoria, non il messaggio: e' letta
 * da chiunque, e un errore per esteso porta dentro i percorsi del server. Ma
 * senza il messaggio, capire perche' le foto arrivavano intere ha richiesto di
 * ricostruire il pacchetto pubblicato e provarlo pezzo per pezzo -- il
 * 04/09/2026 mancava `libvips-cpp.so.8.18.6`, e quel nome sarebbe bastato.
 *
 * **Una volta per processo**, non a ogni foto: quando si rompe si rompe per
 * tutte, e migliaia di righe identiche nascondono il resto invece di aiutare.
 */
let giaSegnalato = false;

function segnalaUnaVolta(errore: unknown) {
  if (giaSegnalato) return;
  giaSegnalato = true;
  console.error("image-proxy: la foto e stata consegnata intera.", errore);
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? null : buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  const larghezza = larghezzaFotoRichiesta(request.nextUrl.searchParams.get("w"));
  const qualita = qualitaFotoRichiesta(request.nextUrl.searchParams.get("q"));

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  try {
    // Chi chiede l'immagine puo' avere bisogno di un formato preciso: il
    // generatore delle anteprime social legge solo JPEG e PNG.
    const acceptRichiesto = request.headers.get("accept")?.trim() ?? "";

    let currentUrl = target;
    let response: Response | null = null;

    // Follow redirects manually so each hop's host is re-validated: a public
    // URL that 3xx-redirects to an internal address cannot bypass the check.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertHostPubblico(currentUrl.hostname);

      const hopResponse = await fetch(currentUrl, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DealerPlatform/1.0)",
          // Si inoltra la preferenza di chi ha chiesto l'immagine, quando
          // c'e'. Prima era fissa e comprendeva webp: chi aveva bisogno di un
          // JPEG -- il generatore delle anteprime social, che altri formati
          // non li legge -- si vedeva servire webp comunque, senza poterlo
          // chiedere diversamente.
          Accept: acceptRichiesto || "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (hopResponse.status >= 300 && hopResponse.status < 400) {
        const location = hopResponse.headers.get("location");
        await hopResponse.body?.cancel().catch(() => {});

        if (!location) {
          return new NextResponse("Image fetch failed", { status: 404 });
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return new NextResponse("Image fetch failed", { status: 404 });
        }

        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          return new NextResponse("Invalid redirect", { status: 400 });
        }

        currentUrl = nextUrl;
        continue;
      }

      response = hopResponse;
      break;
    }

    if (!response) {
      return new NextResponse("Too many redirects", { status: 502 });
    }

    if (!response.ok) {
      return new NextResponse("Image fetch failed", { status: 404 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.toLowerCase().startsWith("image/")) {
      await response.body?.cancel().catch(() => {});
      return new NextResponse("Invalid content type", { status: 415 });
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => {});
      return new NextResponse("Image too large", { status: 413 });
    }

    const buffer = await readCapped(response, MAX_IMAGE_BYTES);
    if (!buffer) {
      return new NextResponse("Image too large", { status: 413 });
    }

    const webp = accettaWebp(acceptRichiesto);

    let corpo = buffer;
    let tipo = contentType;
    // Perche' la foto e' stata consegnata cosi'. Si legge dall'esterno con una
    // richiesta sola: senza, una foto intera e una rimpicciolita si
    // distinguono solo pesandole, e il motivo si puo' solo indovinare.
    let esito = larghezza ? "ridimensionata" : "senza-misura-chiesta";

    if (larghezza) {
      try {
        corpo = await rimpicciolisciFoto(buffer, larghezza, qualita, webp);
        if (webp) {
          tipo = "image/webp";
        }
      } catch (errore) {
        // Un formato che la libreria non sa leggere -- l'HEIC dei telefoni
        // Apple, per esempio -- si consegna come e' arrivato: la foto intera
        // e' comunque meglio di un buco nella pagina.
        corpo = buffer;
        tipo = contentType;
        esito = `intera:${motivoFotoIntera(errore)}`;
        segnalaUnaVolta(errore);
      }
    }

    return new NextResponse(new Uint8Array(corpo), {
      status: 200,
      headers: {
        "Content-Type": tipo,
        // Un mese sulla rete di consegna quando il ridimensionamento e'
        // riuscito: la stessa foto nella stessa misura non si ricalcola due
        // volte. Gli indirizzi delle foto importate portano un nome diverso a
        // ogni file, quindi una foto sostituita arriva con un indirizzo nuovo e
        // non resta impigliata qui.
        //
        // Cinque minuti quando invece e' fallito: conservare per un mese una
        // foto intera vorrebbe dire continuare a servirla intera per un mese
        // anche dopo aver riparato il guasto.
        "Cache-Control": esito.startsWith("intera:")
          ? "public, max-age=300, s-maxage=300"
          : "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
        // La risposta cambia col formato che il browser dichiara di sapere
        // leggere: senza questo, la rete di consegna servirebbe il webp anche
        // a chi ha chiesto un JPEG.
        Vary: "Accept",
        "X-Foto-Esito": esito,
      },
    });
  } catch (error) {
    if (error instanceof IndirizzoNonAmmesso) {
      // Le stesse due risposte di prima, con gli stessi messaggi: un
      // indirizzo che non si risolve e' una richiesta sbagliata (400), uno
      // che punta dove non si va e' un divieto (403). La distinzione la
      // porta il motivo, non il testo: confrontare messaggi si romperebbe
      // alla prima riscrittura.
      const stato = error.motivo === "host-non-consentito" ? 403 : 400;
      return new NextResponse(error.message, { status: stato });
    }

    return new NextResponse("Proxy error", { status: 500 });
  }
}
