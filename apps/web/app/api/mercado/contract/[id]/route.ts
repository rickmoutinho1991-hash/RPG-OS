import { getContractAction } from "@/app/mercado/actions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getContractAction({ contractId: id });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/mercado/contract/[id]] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}