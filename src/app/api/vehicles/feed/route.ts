import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    type?: string;
  };

  void body.type;

  const url = body.url?.trim();

  if (!url) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed obbligatorio",
      },
      { status: 400 },
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      {
        success: false,
        message: "URL feed non valido",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Feed valido, pronto per l'analisi",
  });
}
