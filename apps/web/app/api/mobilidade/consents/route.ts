import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return mock consents
  const consents = [
    {
      consentId: "consent-001",
      personId: ctx.user.id,
      providerId: "ViaVerde",
      scopes: ["mobility.read.profile", "mobility.read.vehicles", "mobility.read.tolls"],
      grantedAt: "2024-01-15T10:00:00Z",
      expiresAt: "2025-01-15T10:00:00Z",
      source: "PERSON",
    },
  ];

  return NextResponse.json(consents);
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { providerId, scopes } = body;

    if (!providerId || !scopes || !Array.isArray(scopes)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const consent = {
      consentId: `consent-${Date.now()}`,
      personId: ctx.user.id,
      providerId,
      scopes,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 31536000000).toISOString(),
      source: "PERSON",
    };

    return NextResponse.json(consent, { status: 201 });
  } catch (err) {
    console.error("[Mobilidade] Consent creation error:", err);
    return NextResponse.json({ error: "Failed to create consent" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const consentId = searchParams.get("consentId");

  if (!consentId) {
    return NextResponse.json({ error: "Missing consentId" }, { status: 400 });
  }

  return NextResponse.json({ success: true, revokedAt: new Date().toISOString() });
}