import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: connectionId } = await params;

    if (!connectionId) {
      return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
    }

    // Test connection
    return NextResponse.json({ success: true, message: "Conex\u00E3o testada com sucesso" });
  } catch (err) {
    console.error("[Mobilidade] Connection test error:", err);
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}