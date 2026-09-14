import { submitMilestoneAction } from "@/app/mercado/actions";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const result = await submitMilestoneAction(formData);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/mercado/milestone/submit] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}