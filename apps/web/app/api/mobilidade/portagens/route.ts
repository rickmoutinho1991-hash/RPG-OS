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

  const transactions = [
    {
      transactionId: "tx-001",
      provider: "ViaVerde",
      licensePlate: "AA-11-BB",
      date: "2024-01-20T08:30:00Z",
      tollRoad: "A23",
      concession: "BRISA",
      entryPoint: "Abrantes",
      exitPoint: "Torres Novas",
      amount: 3.85,
      currency: "EUR",
      status: "CHARGED",
      paymentStatus: "FULLY_PAID",
      source: "PREPARED_ONLY",
      externalReference: "vv-tx-20240120-001",
      createdAt: "2024-01-20T08:30:00Z",
      updatedAt: "2024-01-20T08:30:00Z",
    },
  ];

  return NextResponse.json({
    transactions,
    status: "PREPARED_ONLY",
    message: "Hist\u00F3rico de transa\u00E7\u00F5;es de portagem requires official onboarding. Status: PREPARED_ONLY",
  });
}