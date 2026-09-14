import { acceptQuoteAction } from "@/app/mercado/actions";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const result = await acceptQuoteAction(formData);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/mercado/accept-quote] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}