import { NextResponse } from "next/server";
import { SibsPaymentGatewayAdapter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from '@rpg/core';
import { requireAuth } from "@/lib/auth/rbac";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  const rlResult = rateLimit(request, 'payment');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  if (!rlResult.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: rateLimitHeaders });
  }

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

    const supabase = createAdminClient();

    // Hardening: validar que a fatura pertence ao ator (empresa OU cliente)
    // antes de qualquer tentativa de pagamento — impede IDOR sobre faturas
    // de outras organizações.
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, company_id, client_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Fatura não encontrada." },
        { status: 404 },
      );
    }

    const isOwned =
      invoice.client_id === user.id ||
      (Boolean(user.companyId) && invoice.company_id === user.companyId);
    if (!isOwned) {
      return NextResponse.json(
        { error: "Fatura não pertence a esta conta." },
        { status: 403 },
      );
    }

    const gateway = new SibsPaymentGatewayAdapter({ entityCode: "21550" });
    const result = await gateway.requestMbWayPayment({
      paymentId: `PAY-${Date.now()}`,
      phoneNumber: String(phoneNumber).replace(/\s/g, ""),
      amount: Number(amount),
      description: description || `Pagamento RPG-OS Fatura ${invoiceId}`,
    });

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

