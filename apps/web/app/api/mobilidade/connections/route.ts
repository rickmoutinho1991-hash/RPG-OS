import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { mobilityProviderRegistry } from "@/lib/services/mobility/provider";
import { registerDefaultMobilityProviders } from "@/lib/services/mobility/provider";

registerDefaultMobilityProviders();

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return mock connections for now (in real implementation, fetch from DB)
  const connections = [
    {
      id: "conn-vv-001",
      provider_id: "ViaVerde",
      environment: "development",
      status: "PREPARED_ONLY",
      scopes: ["mobility.read.profile", "mobility.read.vehicles", "mobility.read.tolls"],
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    {
      id: "conn-ctt-001",
      provider_id: "CTTPortagens",
      environment: "development",
      status: "PREPARED_ONLY",
      scopes: ["mobility.read.profile", "mobility.read.vehicles", "mobility.read.debts"],
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];

  return NextResponse.json(connections);
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { provider_id, environment, scopes } = body;

    if (!provider_id || !environment || !scopes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate provider
    const validProviders = ["ViaVerde", "CTTPortagens", "IMT"];
    if (!["ViaVerde", "CTTPortagens", "IMT"].includes(provider_id)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const validEnvironments = ["development", "sandbox", "production"];
    if (!validEnvironments.includes(environment)) {
      return NextResponse.json({ error: "Invalid environment" }, { status: 400 });
    }

    // Create connection
    const connection = {
      id: `conn-${provider_id.toLowerCase()}-${Date.now()}`,
      provider_id,
      environment,
      status: "PREPARED_ONLY",
      scopes,
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    return NextResponse.json(connection, { status: 201 });
  } catch (err) {
    console.error("[Mobilidade] Connection creation error:", err);
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}