"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { ServicesRequestFlow, MarketplaceFlow, hasPermission } from "@rpg/core";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export interface CreateRequestInput {
  title: string;
  description: string;
  categoryId: string;
  budgetType: "FIXED" | "RANGE" | "NEGOTIABLE";
  budgetAmountCents?: number;
  budgetMinCents?: number;
  budgetMaxCents?: number;
  budgetCurrency: string;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  desiredStartDate?: string;
  desiredEndDate?: string;
}

export interface SubmitQuoteInput {
  requestId: string;
  items: {
    description: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    taxRate: number;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  validUntil: string;
  terms?: string;
  warrantyMonths?: number;
  estimatedStartDate?: string;
  estimatedDurationDays?: number;
  responseToQuestions?: string;
}

function validateCreateRequest(input: CreateRequestInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.title?.trim()) {
    errors.push("Título é obrigatório");
  } else if (input.title.length > 200) {
    errors.push("Título não pode exceder 200 caracteres");
  }

  if (!input.description?.trim()) {
    errors.push("Descrição é obrigatória");
  } else if (input.description.length > 5000) {
    errors.push("Descrição não pode exceder 5000 caracteres");
  }

  if (!input.categoryId) {
    errors.push("Categoria é obrigatória");
  }

  if (!input.budgetType || !["FIXED", "RANGE", "NEGOTIABLE"].includes(input.budgetType)) {
    errors.push("Tipo de orçamento inválido");
  }

  if (input.budgetType === "FIXED" && (!input.budgetAmountCents || input.budgetAmountCents <= 0)) {
    errors.push("Orçamento fixo requer valor em cêntimos > 0");
  }

  if (input.budgetType === "RANGE") {
    if (!input.budgetMinCents || input.budgetMinCents <= 0) {
      errors.push("Orçamento mínimo requer valor em cêntimos > 0");
    }
    if (!input.budgetMaxCents || input.budgetMaxCents <= 0) {
      errors.push("Orçamento máximo requer valor em cêntimos > 0");
    }
    if (input.budgetMinCents && input.budgetMaxCents && input.budgetMaxCents < input.budgetMinCents) {
      errors.push("Orçamento máximo deve ser >= orçamento mínimo");
    }
  }

  if (input.urgency && !["LOW", "MEDIUM", "HIGH", "URGENT"].includes(input.urgency)) {
    errors.push("Urgência inválida");
  }

  if (input.desiredStartDate && isNaN(Date.parse(input.desiredStartDate))) {
    errors.push("Data de início pretendida inválida");
  }

  if (input.desiredEndDate && isNaN(Date.parse(input.desiredEndDate))) {
    errors.push("Data de fim pretendida inválida");
  }

  return { valid: errors.length === 0, errors };
}

function validateSubmitQuote(input: SubmitQuoteInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.requestId) {
    errors.push("ID do pedido é obrigatório");
  }

  if (!input.items || input.items.length === 0) {
    errors.push("Pelo menos um item é obrigatório");
  } else {
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      if (!item.description?.trim()) {
        errors.push(`Item ${i + 1}: descrição obrigatória`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`Item ${i + 1}: quantidade deve ser inteiro > 0`);
      }
      if (!item.unit?.trim()) {
        errors.push(`Item ${i + 1}: unidade obrigatória`);
      }
      if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
        errors.push(`Item ${i + 1}: preço unitário em cêntimos deve ser inteiro >= 0`);
      }
      if (!Number.isInteger(item.taxRate) || item.taxRate < 0 || item.taxRate > 100) {
        errors.push(`Item ${i + 1}: taxa de IVA deve ser entre 0 e 100`);
      }
    }
  }

  if (!Number.isInteger(input.subtotalCents) || input.subtotalCents < 0) {
    errors.push("Subtotal em cêntimos deve ser inteiro >= 0");
  }
  if (!Number.isInteger(input.taxCents) || input.taxCents < 0) {
    errors.push("IVA em cêntimos deve ser inteiro >= 0");
  }
  if (!Number.isInteger(input.totalCents) || input.totalCents < 0) {
    errors.push("Total em cêntimos deve ser inteiro >= 0");
  }
  if (input.subtotalCents + input.taxCents !== input.totalCents) {
    errors.push("Subtotal + IVA deve igualar total");
  }

  if (!input.currency?.trim()) {
    errors.push("Moeda é obrigatória");
  }

  if (!input.validUntil || isNaN(Date.parse(input.validUntil))) {
    errors.push("Data de validade obrigatória e válida");
  }

  if (input.warrantyMonths !== undefined && (!Number.isInteger(input.warrantyMonths) || input.warrantyMonths <= 0)) {
    errors.push("Meses de garantia deve ser inteiro > 0");
  }

  return { valid: errors.length === 0, errors };
}

export async function createRequestAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { error: "Não autenticado" };
  }

  const input: CreateRequestInput = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    categoryId: formData.get("categoryId") as string,
    budgetType: formData.get("budgetType") as "FIXED" | "RANGE" | "NEGOTIABLE",
    budgetAmountCents: formData.get("budgetAmountCents") ? parseInt(formData.get("budgetAmountCents") as string) : undefined,
    budgetMinCents: formData.get("budgetMinCents") ? parseInt(formData.get("budgetMinCents") as string) : undefined,
    budgetMaxCents: formData.get("budgetMaxCents") ? parseInt(formData.get("budgetMaxCents") as string) : undefined,
    budgetCurrency: formData.get("budgetCurrency") as string,
    urgency: formData.get("urgency") as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined,
    desiredStartDate: formData.get("desiredStartDate") as string || undefined,
    desiredEndDate: formData.get("desiredEndDate") as string || undefined,
  };

  const validation = validateCreateRequest(input);
  if (!validation.valid) {
    return { error: validation.errors.join("; ") };
  }

  try {
    const flow = new ServicesRequestFlow();
    const result = flow.createRequest({
      clientId: ctx.user.id,
      kind: "SERVICE_REQUEST",
      categoryId: input.categoryId,
      title: input.title.trim(),
      description: input.description.trim(),
      budget: {
        type: input.budgetType,
        amountCents: input.budgetAmountCents,
        minCents: input.budgetMinCents,
        maxCents: input.budgetMaxCents,
        currency: input.budgetCurrency,
      },
      urgency: input.urgency,
      desiredStartDate: input.desiredStartDate,
      desiredEndDate: input.desiredEndDate,
    });

    const supabase = createAdminClient();
    const { error: insertError } = await supabase
      .from("service_requests")
      .insert({
        id: result.entity.id,
        client_id: result.entity.clientId,
        category_id: result.entity.categoryId,
        title: result.entity.title,
        description: result.entity.description,
        budget_type: result.entity.budget.type,
        budget_amount_cents: result.entity.budget.amountCents,
        budget_min_cents: result.entity.budget.minCents,
        budget_max_cents: result.entity.budget.maxCents,
        budget_currency: result.entity.budget.currency,
        urgency: result.entity.urgency,
        desired_start_date: result.entity.desiredStartDate,
        desired_end_date: result.entity.desiredEndDate,
        location_service_mode: "BOTH",
        status: result.entity.status,
        moderation_status: "APPROVED",
        created_at: result.entity.createdAt,
        updated_at: result.entity.updatedAt,
      });

    if (insertError) throw insertError;

    revalidatePath("/mercado");
    redirect(`/mercado/pedidos/${result.entity.id}`);
  } catch (err) {
    console.error("[createRequestAction] Erro:", err);
    return { error: "Erro ao criar pedido. Tente novamente." };
  }
}

export async function publishRequestAction(requestId: string) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { error: "Não autenticado" };
  }

  const supabase = createAdminClient();
  const { data: request, error: fetchError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .eq("client_id", ctx.user.id)
    .single();

  if (fetchError || !request) {
    return { error: "Pedido não encontrado ou sem permissão" };
  }

  if (request.status !== "DRAFT") {
    return { error: "Só é possível publicar pedidos em rascunho" };
  }

  try {
    const flow = new ServicesRequestFlow();
    const result = flow.publishRequest(
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
      ctx.user.id
    );

    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        status: result.entity.status,
        published_at: result.entity.publishedAt,
        updated_at: result.entity.updatedAt,
      })
      .eq("id", requestId);

    if (updateError) throw updateError;

    revalidatePath("/mercado");
    revalidatePath(`/mercado/pedidos/${requestId}`);
    return { success: true };
  } catch (err) {
    console.error("[publishRequestAction] Erro:", err);
    return { error: "Erro ao publicar pedido" };
  }
}

export async function submitQuoteAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { error: "Não autenticado" };
  }

  if (!hasPermission(ctx.permissions, "marketplace.quotes.create")) {
    return { error: "Sem permissão para criar propostas" };
  }

  const itemsJson = formData.get("items") as string;
  let items: SubmitQuoteInput["items"];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { error: "Items inválidos" };
  }

  const input: SubmitQuoteInput = {
    requestId: formData.get("requestId") as string,
    items,
    subtotalCents: parseInt(formData.get("subtotalCents") as string),
    taxCents: parseInt(formData.get("taxCents") as string),
    totalCents: parseInt(formData.get("totalCents") as string),
    currency: formData.get("currency") as string,
    validUntil: formData.get("validUntil") as string,
    terms: formData.get("terms") as string || undefined,
    warrantyMonths: formData.get("warrantyMonths") ? parseInt(formData.get("warrantyMonths") as string) : undefined,
    estimatedStartDate: formData.get("estimatedStartDate") as string || undefined,
    estimatedDurationDays: formData.get("estimatedDurationDays") ? parseInt(formData.get("estimatedDurationDays") as string) : undefined,
    responseToQuestions: formData.get("responseToQuestions") as string || undefined,
  };

  const validation = validateSubmitQuote(input);
  if (!validation.valid) {
    return { error: validation.errors.join("; ") };
  }

  const supabase = createAdminClient();

  const { data: request, error: reqError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", input.requestId)
    .single();

  if (reqError || !request) {
    return { error: "Pedido não encontrado" };
  }

  if (!["PUBLISHED", "QUOTES_RECEIVED"].includes(request.status)) {
    return { error: "Só é possível cotar pedidos publicados" };
  }

  try {
    const requestFlow = new ServicesRequestFlow();
    const marketplaceFlow = new MarketplaceFlow();

    const quote = {
      id: crypto.randomUUID(),
      requestId: input.requestId,
      providerId: ctx.user.id,
      items: items.map((item, idx) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        taxRate: item.taxRate,
        totalCents: item.unitPriceCents * item.quantity,
      })),
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      currency: input.currency,
      validUntil: input.validUntil,
      terms: input.terms,
      warrantyMonths: input.warrantyMonths,
      estimatedStartDate: input.estimatedStartDate,
      estimatedDurationDays: input.estimatedDurationDays,
      responseToQuestions: input.responseToQuestions,
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
      .eq("id", input.requestId);

    if (reqUpdateError) throw reqUpdateError;

    revalidatePath("/mercado");
    revalidatePath(`/mercado/pedidos/${input.requestId}`);
    return { success: true, quoteId: sentResult.entity.id };
  } catch (err) {
    console.error("[submitQuoteAction] Erro:", err);
    return { error: "Erro ao submeter proposta" };
  }
}