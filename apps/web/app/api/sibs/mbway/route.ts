import { NextResponse } from "next/server";
import { SibsPaymentGatewayAdapter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from '@rpg/core';
import { requireAuth } from "@/lib/auth/rbac";

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await requireAuth();
    } catch {
      return NextResponse.json(
        { error: "Não autorizado. Inicie sessão para solicitar pagamento." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { phoneNumber, amount, invoiceId, description } = body;

    if (!phoneNumber || !amount || !invoiceId) {
      return NextResponse.json(
        { error: "Telemóvel MBWay, montante e fatura são obrigatórios." },
        { status: 400 },
      );
    }

    const gateway = new SibsPaymentGatewayAdapter({ entityCode: "21550" });
    const result = await gateway.requestMbWayPayment({
      paymentId: `PAY-${Date.now()}`,
      phoneNumber: String(phoneNumber).replace(/\s/g, ""),
      amount: Number(amount),
      description: description || `Pagamento RPG-OS Fatura ${invoiceId}`,
    });

    const supabase = createAdminClient();
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      // Hardening: sem gateway real, o evento descreve tentativa indisponível,
      // nunca pagamento iniciado.
      action: "MBWAY_PAYMENT_UNAVAILABLE",
      module: "FINANCIAL",
      entity_type: "PAYMENT",
      entity_id: invoiceId,
      metadata: sanitizeAuditMetadata({ phoneNumber, amount, success: result.success }),
    });

    return NextResponse.json(result, { status: result.success ? 200 : 503 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro no processamento MBWay.",
      },
      { status: 500 },
    );
  }
}

