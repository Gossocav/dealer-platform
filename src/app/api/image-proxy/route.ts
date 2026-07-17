import { NextRequest, NextResponse } from "next/server";
import { fetchWithSsrfProtection, parseAndValidateExternalHttpUrl } from "@/lib/ssrf-protection";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 8_000;
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";

  if (!rawUrl) {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = parseAndValidateExternalHttpUrl(rawUrl);
  } catch (error) {
    console.warn("Image proxy invalid URL", { rawUrl, error });
    return new NextResponse("Invalid image url", { status: 400 });
  }

  try {
    const response = await fetchWithSsrfProtection(parsedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DealerPlatform/1.0)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return new NextResponse("Image fetch failed", { status: 404 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.toLowerCase().startsWith("image/")) {
      return new NextResponse("Invalid content type", { status: 415 });
    }

    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error("Image proxy fetch error", { url: parsedUrl.toString(), error });
    return new NextResponse("Proxy error", { status: 500 });
  }
}