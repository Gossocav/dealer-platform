import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";

  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const upstream = await fetch(rawUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}