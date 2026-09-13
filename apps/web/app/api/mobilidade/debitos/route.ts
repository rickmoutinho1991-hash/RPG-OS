import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get("connectionId");

  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
  }

  const debts = [
    {
      debtId: "debt-001",
      provider: "ViaVerde",
      licensePlate: "AA-11-BB",
      amount: 8.45,
      currency: "EUR",
      dueDate: "2024-02-15",
      status: "PENDING",
      paymentReference: "MB-12345678",
      entityReference: "12345",
      source: "PREPARED_ONLY",
      documentReference: "inv-202401-001",
      createdAt: "2024-01-25T10:00:00Z",
      updatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json({
    debts,
    status: "PREPARED_ONLY",
    message: "Consulta de d\u00E9bitos requires official onboarding. Status: PREPARED_ONLY",
  });
}