import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { ServicesRequestFlow, MarketplaceFlow } from "@rpg/core";

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const requestId = formData.get("requestId") as string;
  const itemsJson = formData.get("items") as string;
  const subtotalCents = parseInt(formData.get("subtotalCents") as string);
  const taxCents = parseInt(formData.get("taxCents") as string);
  const totalCents = parseInt(formData.get("totalCents") as string);
  const currency = formData.get("currency") as string;
  const validUntil = formData.get("validUntil") as string;
  const terms = formData.get("terms") as string | null;
  const warrantyMonths = formData.get("warrantyMonths") ? parseInt(formData.get("warrantyMonths") as string) : undefined;

  if (!requestId || !itemsJson || !subtotalCents || !taxCents || !totalCents || !currency || !validUntil) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  let items;
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return NextResponse.json({ error: "Items inválidos" }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Pelo menos um item é obrigatório" }, { status: 400 });
  }

  for (const item of items) {
    if (!item.description?.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 ||
        !item.unit?.trim() || !Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0 ||
        !Number.isInteger(item.taxRate) || item.taxRate < 0 || item.taxRate > 100) {
      return NextResponse.json({ error: "Item inválido" }, { status: 400 });
    }
  }

  if (subtotalCents + taxCents !== totalCents) {
    return NextResponse.json({ error: "Subtotal + IVA deve igualar total" }, { status: 400 });
  }

  if (isNaN(Date.parse(validUntil))) {
    return NextResponse.json({ error: "Data de validade inválida" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: request, error: reqError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (reqError || !request) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (!["PUBLISHED", "QUOTES_RECEIVED"].includes(request.status)) {
    return NextResponse.json({ error: "Só é possível cotar pedidos publicados" }, { status: 400 });
  }

  try {
    const marketplaceFlow = new MarketplaceFlow();
    const requestFlow = new ServicesRequestFlow();

    const quote = {
      id: crypto.randomUUID(),
      requestId,
      providerId: ctx.user.id,
      items: items.map((item: any, idx: number) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        taxRate: item.taxRate,
        totalCents: item.unitPriceCents * item.quantity,
      })),
      subtotalCents,
      taxCents,
      totalCents,
      currency,
      validUntil,
      terms: terms || undefined,
      warrantyMonths,
      estimatedStartDate: undefined,
      estimatedDurationDays: undefined,
      responseToQuestions: undefined,
      status: "DRAFT" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const sentResult = marketplaceFlow.markQuoteSent(quote, ctx.user.id);

    const { error: quoteInsertError } = await supabase
      .from("service_quotes")
      .insert({
        id: sentResult.entity.id,
        request_id: sentResult.entity.requestId,
        provider_id: sentResult.entity.providerId,
        subtotal_cents: sentResult.entity.subtotalCents,
        tax_cents: sentResult.entity.taxCents,
        total_cents: sentResult.entity.totalCents,
        currency: sentResult.entity.currency,
        valid_until: sentResult.entity.validUntil,
        terms: sentResult.entity.terms,
        warranty_months: sentResult.entity.warrantyMonths,
        estimated_start_date: sentResult.entity.estimatedStartDate,
        estimated_duration_days: sentResult.entity.estimatedDurationDays,
        response_to_questions: sentResult.entity.responseToQuestions,
        status: sentResult.entity.status,
        sent_at: sentResult.entity.sentAt,
        created_at: sentResult.entity.createdAt,
        updated_at: sentResult.entity.updatedAt,
      });

    if (quoteInsertError) throw quoteInsertError;

    for (const item of sentResult.entity.items) {
      const { error: itemError } = await supabase
        .from("service_quote_items")
        .insert({
          id: item.id,
          quote_id: sentResult.entity.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_cents: item.unitPriceCents,
          tax_rate: item.taxRate,
          total_cents: item.totalCents,
        });
      if (itemError) throw itemError;
    }

    const addQuoteResult = requestFlow.addQuoteToRequest(
      {
        id: request.id,
        clientId: request.client_id,
        categoryId: request.category_id,
        title: request.title,
        description: request.description,
        budget: {
          type: request.budget_type,
          amountCents: request.budget_amount_cents,
          minCents: request.budget_min_cents,
          maxCents: request.budget_max_cents,
          currency: request.budget_currency,
        },
        urgency: request.urgency,
        desiredStartDate: request.desired_start_date,
        desiredEndDate: request.desired_end_date,
        location: { serviceMode: request.location_service_mode },
        attachments: [],
        status: request.status,
        quotes: [],
        moderation: { status: request.moderation_status },
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      },
      sentResult.entity
    );

    const { error: reqUpdateError } = await supabase
      .from("service_requests")
      .update({
        status: addQuoteResult.entity.status,
        updated_at: addQuoteResult.entity.updatedAt,
      })
      .eq("id", requestId);

    if (reqUpdateError) throw reqUpdateError;

    return NextResponse.json({ success: true, quoteId: sentResult.entity.id });
  } catch (err) {
    console.error("[API/mercado/quote] Erro:", err);
    return NextResponse.json({ error: "Erro ao submeter proposta" }, { status: 500 });
  }
}