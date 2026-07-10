import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "La registrazione autonoma dealer e disattivata. Richiedi una demo per attivare l'accesso.",
    },
    { status: 403 }
  );
}
