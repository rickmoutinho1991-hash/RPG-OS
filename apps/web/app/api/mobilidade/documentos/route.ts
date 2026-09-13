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

  const documents = [
    {
      documentId: "doc-001",
      provider: "ViaVerde",
      documentType: "INVOICE",
      title: "Fatura Via Verde Janeiro 2024",
      description: "Fatura de portagens do m\u00EAs de janeiro",
      issueDate: "2024-01-25",
      externalReference: "inv-202401-001",
      status: "PREPARED_ONLY",
      createdAt: "2024-01-25T10:00:00Z",
      updatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json({
    documents,
    status: "PREPARED_ONLY",
    message: "Consulta de documentos requires official onboarding. Status: PREPARED_ONLY",
  });
}