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

  const payments = [
    {
      paymentId: "pay-001",
      amount: 8.45,
      currency: "EUR",
      date: "2024-02-10T14:30:00Z",
      status: "COMPLETED",
      paymentMethodType: "MB_WAY",
      reference: "MB-12345678",
      provider: "ViaVerde",
      source: "PREPARED_ONLY",
      receiptDocumentReference: "rec-20240210-001",
      createdAt: "2024-02-10T14:30:00Z",
      updatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json({
    payments,
    status: "PREPARED_ONLY",
    message: "Consulta de pagamentos requires official onboarding. Status: PREPARED_ONLY",
  });
}