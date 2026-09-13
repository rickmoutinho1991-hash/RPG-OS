import { NextResponse } from "next/server";
import { AtTaxAuthorityAdapter } from "@rpg/core";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nif = String(body.nif || "").replace(/\s/g, "");

    const adapter = new AtTaxAuthorityAdapter();
    const result = await adapter.validateTaxNumber({ taxNumber: nif });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro na validação local do NIF.",
      },
      { status: 400 },
    );
  }
}
