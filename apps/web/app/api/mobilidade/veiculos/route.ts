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

  // Return PREPARED_ONLY status for vehicles
  const vehicles = [
    {
      vehicleId: "vv-001",
      licensePlate: "AA-11-BB",
      make: "Toyota",
      model: "Corolla",
      category: "Passeio",
      provider: "ViaVerde",
      status: "ATIVO",
      source: "PREPARED_ONLY",
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json({
    vehicles,
    status: "PREPARED_ONLY",
    message: "Consulta de ve\u00EDculos requires official onboarding. Status: PREPARED_ONLY",
  });
}