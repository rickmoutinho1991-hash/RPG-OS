import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ready",
    mobilidade: {
      providers: [
        {
          providerId: "ViaVerde",
          status: "PREPARED_ONLY",
          environment: "development",
          capabilities: [
            "READ_PROFILE",
            "READ_VEHICLES",
            "READ_TOLL_TRANSACTIONS",
            "READ_TOLL_DEBTS",
            "READ_PAYMENTS",
            "READ_INVOICES",
            "READ_RECEIPTS",
            "READ_DOCUMENTS",
            "READ_NOTIFICATIONS",
          ],
          lastSync: new Date().toISOString(),
          message: "Preparado para integra\u00E7\u00E3;o oficial",
        },
        {
          providerId: "CTTPortagens",
          status: "PREPARED_ONLY",
          environment: "development",
          capabilities: [
            "READ_PROFILE",
            "READ_VEHICLES",
            "READ_TOLL_TRANSACTIONS",
            "READ_TOLL_DEBTS",
            "READ_PAYMENTS",
            "READ_INVOICES",
            "READ_RECEIPTS",
            "READ_DOCUMENTS",
            "READ_NOTIFICATIONS",
          ],
          lastSync: new Date().toISOString(),
          message: "Preparado para integra\u00E7\u00E3;o oficial",
        },
      ],
      lastChecked: new Date().toISOString(),
    },
  });
}