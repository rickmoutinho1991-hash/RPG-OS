"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { uploadMilestoneEvidence } from "@/lib/marketplace/evidence";
import { recordMilestonePayment, emitMilestoneWarranty } from "@/lib/marketplace/payments";
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

export interface AcceptQuoteInput {
  requestId: string;
  quoteId: string;
}

export interface SubmitMilestoneInput {
  contractId: string;
  milestoneId: string;
  evidence?: { deliverableId: string; hash: string; url?: string; description?: string }[];
}

export interface ApproveMilestoneInput {
  contractId: string;
  milestoneId: string;
  approve: boolean;
  note?: string;
}

export interface GetContractInput {
  contractId: string;
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

  if (!hasPermission(ctx.permissions, "marketplace.requests.create")) {
    return { error: "Sem permissão para criar pedidos no mercado" };
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

export async function acceptQuoteAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Não autenticado" };

  if (!hasPermission(ctx.permissions, "marketplace.requests.create")) {
    return { error: "Sem permissão para adjudicar propostas" };
  }

  const input: AcceptQuoteInput = {
    requestId: formData.get("requestId") as string,
    quoteId: formData.get("quoteId") as string,
  };

  if (!input.requestId || !input.quoteId) {
    return { error: "requestId e quoteId são obrigatórios" };
  }

  const supabase = createAdminClient();

  const { data: request, error: reqError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", input.requestId)
    .single();

  if (reqError || !request) return { error: "Pedido não encontrado" };

  if (request.client_id !== ctx.user.id) {
    return { error: "Apenas o dono do pedido pode aceitar propostas" };
  }

  if (!["PUBLISHED", "QUOTES_RECEIVED", "ADJUDICATING"].includes(request.status)) {
    return { error: "Pedido não está em estado elegível para adjudicação" };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("service_quotes")
    .select("*")
    .eq("id", input.quoteId)
    .eq("request_id", input.requestId)
    .single();

  if (quoteError || !quote) return { error: "Proposta não encontrada" };

  if (quote.status !== "SENT" && quote.status !== "VIEWED") {
    return { error: "Proposta não está em estado elegível para aceitação" };
  }

  try {
    const marketplaceFlow = new MarketplaceFlow();
    const requestFlow = new ServicesRequestFlow();

    const acceptedResult = marketplaceFlow.acceptQuote(
      {
        id: quote.id,
        requestId: quote.request_id,
        providerId: quote.provider_id,
        items: [],
        subtotalCents: quote.subtotal_cents,
        taxCents: quote.tax_cents,
        totalCents: quote.total_cents,
        currency: quote.currency,
        validUntil: quote.valid_until,
        terms: quote.terms,
        warrantyMonths: quote.warranty_months,
        estimatedStartDate: quote.estimated_start_date,
        estimatedDurationDays: quote.estimated_duration_days,
        responseToQuestions: quote.response_to_questions,
        status: quote.status as any,
        sentAt: quote.sent_at,
        viewedAt: quote.viewed_at,
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
      },
      { id: request.id, clientId: request.client_id },
      ctx.user.id
    );

    const { error: quoteUpdateError } = await supabase
      .from("service_quotes")
      .update({ status: acceptedResult.entity.status, updated_at: acceptedResult.entity.updatedAt })
      .eq("id", input.quoteId);

    if (quoteUpdateError) throw quoteUpdateError;

    const { data: otherQuotes } = await supabase
      .from("service_quotes")
      .select("id, request_id, provider_id, status, created_at, updated_at")
      .eq("request_id", input.requestId)
      .neq("id", input.quoteId)
      .in("status", ["SENT", "VIEWED"]);

    for (const q of otherQuotes ?? []) {
      const rejectedResult = marketplaceFlow.rejectQuote(
        {
          id: q.id,
          requestId: q.request_id,
          providerId: q.provider_id,
          items: [],
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          currency: "EUR",
          validUntil: "",
          status: q.status as any,
          createdAt: q.created_at,
          updatedAt: q.updated_at,
        },
        { id: request.id, clientId: request.client_id },
        ctx.user.id
      );
      await supabase
        .from("service_quotes")
        .update({ status: rejectedResult.entity.status, updated_at: rejectedResult.entity.updatedAt })
        .eq("id", q.id);
    }

    const convertedResult = marketplaceFlow.convertToContract(acceptedResult.entity);

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .insert({
        id: crypto.randomUUID(),
        request_id: request.id,
        client_id: request.client_id,
        provider_id: quote.provider_id,
        adjudicated_quote_id: quote.id,
        status: "DRAFT",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (contractError) throw contractError;

    const { data: quoteItems } = await supabase
      .from("service_quote_items")
      .select("*")
      .eq("quote_id", quote.id);

    const milestones = (quoteItems ?? []).map((item, idx) => ({
      id: crypto.randomUUID(),
      contract_id: contract.id,
      title: item.description,
      description: `Entrega: ${item.description}`,
      due_date: quote.estimated_start_date ? new Date(new Date(quote.estimated_start_date).getTime() + (idx + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : null,
      amount_cents: Math.round(item.total_cents / (quoteItems?.length ?? 1)),
      status: "PENDING" as const,
      require_evidence: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (milestones.length > 0) {
      const { error: milestonesError } = await supabase
        .from("contract_milestones")
        .insert(milestones);
      if (milestonesError) throw milestonesError;
    }

    await supabase
      .from("service_requests")
      .update({ status: "CONTRACTED", updated_at: new Date().toISOString() })
      .eq("id", input.requestId);

    revalidatePath("/mercado");
    revalidatePath(`/mercado/pedidos/${input.requestId}`);
    revalidatePath(`/mercado/contratos/${contract.id}`);

    return { success: true, contractId: contract.id };
  } catch (err) {
    console.error("[acceptQuoteAction] Erro:", err);
    return { error: "Erro ao aceitar proposta" };
  }
}

export async function getContractAction(input: GetContractInput) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Não autenticado" };

  const supabase = createAdminClient();

  const { data: contract, error } = await supabase
    .from("contracts")
    .select(`
      *,
      contract_milestones (*)
    `)
    .eq("id", input.contractId)
    .single();

  if (error || !contract) return { error: "Contrato não encontrado" };

  if (contract.client_id !== ctx.user.id && contract.provider_id !== ctx.user.id) {
    return { error: "Acesso negado" };
  }

  const { data: request } = await supabase
    .from("service_requests")
    .select("title, description, client_id, category_id")
    .eq("id", contract.request_id)
    .single();

  const milestones: any[] =
    (contract.contract_milestones?.sort((a: any, b: any) =>
      a.created_at.localeCompare(b.created_at),
    ) ?? []) as any[];

  const milestoneIds = milestones.map((m) => m.id);

  let evidenceRows: any[] = [];
  let paymentRows: any[] = [];
  let warrantyRows: any[] = [];

  try {
    const { data } = await supabase
      .from("evidence")
      .select("id, related_entity_id, title, category, status, mime_type, size_bytes, created_at")
      .eq("related_entity_type", "MILESTONE")
      .in("related_entity_id", milestoneIds.length > 0 ? milestoneIds : [""]);
    evidenceRows = data ?? [];
  } catch (err) {
    console.error("[getContractAction] Falha a ler evidências:", err);
  }

  try {
    const { data } = await supabase
      .from("marketplace_milestone_payments")
      .select("id, milestone_id, amount_cents, currency, fee_bps, fee_cents, net_cents, paid_at")
      .eq("contract_id", input.contractId);
    paymentRows = data ?? [];
  } catch (err) {
    console.error("[getContractAction] Falha a ler pagamentos:", err);
  }

  try {
    const { data } = await supabase
      .from("warranties")
      .select("id, warranty_period_months, start_date, end_date, coverage, status")
      .eq("order_id", input.contractId);
    warrantyRows = data ?? [];
  } catch (err) {
    console.error("[getContractAction] Falha a ler garantias:", err);
  }

  return {
    contract: {
      ...contract,
      milestones,
      request,
      evidence: evidenceRows,
      payments: paymentRows,
      warranties: warrantyRows,
    },
  };
}

export async function submitMilestoneAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Não autenticado" };

  const input: SubmitMilestoneInput = {
    contractId: formData.get("contractId") as string,
    milestoneId: formData.get("milestoneId") as string,
    evidence: formData.get("evidence") ? JSON.parse(formData.get("evidence") as string) : undefined,
  };

  if (!input.contractId || !input.milestoneId) {
    return { error: "contractId e milestoneId são obrigatórios" };
  }

  const supabase = createAdminClient();

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", input.contractId)
    .single();

  if (!contract) return { error: "Contrato não encontrado" };

  if (contract.provider_id !== ctx.user.id) {
    return { error: "Apenas o prestador pode marcar milestones como concluídos" };
  }

  const { data: milestone } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("id", input.milestoneId)
    .eq("contract_id", input.contractId)
    .single();

  if (!milestone) return { error: "Milestone não encontrado" };

  if (milestone.status !== "PENDING" && milestone.status !== "IN_PROGRESS") {
    return { error: "Milestone não está em estado elegível para submissão" };
  }

  try {
    if (milestone.require_evidence) {
      const rawFile = formData.get("file");
      const file =
        rawFile instanceof File
          ? {
              name: rawFile.name ?? null,
              type: rawFile.type ?? null,
              size: rawFile.size ?? null,
              buffer: new Uint8Array(await rawFile.arrayBuffer()),
            }
          : null;

      if (!file) {
        return { error: "Evidência do milestone é obrigatória (PDF, JPG, PNG ou WEBP, máx. 15 MB)" };
      }

      const partyIds =
        contract.provider_id === ctx.user.id ? [contract.provider_id, contract.client_id] : [contract.client_id, contract.provider_id];

      const upload = await uploadMilestoneEvidence({
        milestoneId: milestone.id,
        providerId: ctx.user.id,
        partyIds,
        file,
        milestoneTitle: milestone.title ?? "Milestone",
      });
      if (!upload.ok) return { error: upload.error };
    }

    const { error: updateError } = await supabase
      .from("contract_milestones")
      .update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.milestoneId);

    if (updateError) throw updateError;

    revalidatePath(`/mercado/contratos/${input.contractId}`);
    return { success: true };
  } catch (err) {
    console.error("[submitMilestoneAction] Erro:", err);
    return { error: "Erro ao submeter milestone" };
  }
}

export async function approveMilestoneAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: "Não autenticado" };

  const input: ApproveMilestoneInput = {
    contractId: formData.get("contractId") as string,
    milestoneId: formData.get("milestoneId") as string,
    approve: formData.get("approve") === "true",
    note: formData.get("note") as string || undefined,
  };

  if (!input.contractId || !input.milestoneId) {
    return { error: "contractId e milestoneId são obrigatórios" };
  }

  if (!input.approve && !input.note?.trim()) {
    return { error: "Nota é obrigatória ao devolver milestone" };
  }

  const supabase = createAdminClient();

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", input.contractId)
    .single();

  if (!contract) return { error: "Contrato não encontrado" };

  if (contract.client_id !== ctx.user.id) {
    return { error: "Apenas o dono do contrato pode aprovar milestones" };
  }

  const { data: milestone } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("id", input.milestoneId)
    .eq("contract_id", input.contractId)
    .single();

  if (!milestone) return { error: "Milestone não encontrado" };

  if (milestone.status !== "SUBMITTED") {
    return { error: "Milestone não está em estado elegível para aprovação" };
  }

  try {
    const newStatus = input.approve ? "APPROVED" : "REJECTED";
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (input.approve) {
      updateData.approved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("contract_milestones")
      .update(updateData)
      .eq("id", input.milestoneId);

    if (updateError) throw updateError;

    if (input.approve) {
      try {
        await recordMilestonePayment(
          {
            id: contract.id,
            client_id: contract.client_id,
            provider_id: contract.provider_id,
            adjudicated_quote_id: contract.adjudicated_quote_id,
            status: contract.status,
          },
          { id: milestone.id, contract_id: contract.id, title: milestone.title ?? "Milestone", amount_cents: milestone.amount_cents ?? 0 },
          ctx.user.id,
        );
      } catch (err) {
        console.error("[approveMilestoneAction] Falha no registo de pagamento:", err);
      }

      const { data: allMilestones } = await supabase
        .from("contract_milestones")
        .select("status")
        .eq("contract_id", input.contractId);

      const allApproved = allMilestones?.every(m => m.status === "APPROVED") ?? false;
      if (allApproved) {
        const { error: completeError } = await supabase
          .from("contracts")
          .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
          .eq("id", input.contractId);
        if (completeError) throw completeError;

        const { data: quote } = await supabase
          .from("service_quotes")
          .select("warranty_months, terms")
          .eq("id", contract.adjudicated_quote_id)
          .maybeSingle();

        try {
          await emitMilestoneWarranty(
            {
              id: contract.id,
              client_id: contract.client_id,
              provider_id: contract.provider_id,
              adjudicated_quote_id: contract.adjudicated_quote_id,
              status: "COMPLETED",
            },
            quote ? { warranty_months: quote.warranty_months, terms: quote.terms } : null,
            ctx.user.id,
          );
        } catch (err) {
          console.error("[approveMilestoneAction] Falha na emissão de garantia:", err);
        }
      }
    }

    revalidatePath(`/mercado/contratos/${input.contractId}`);
    revalidatePath("/mercado");
    return { success: true };
  } catch (err) {
    console.error("[approveMilestoneAction] Erro:", err);
    return { error: "Erro ao aprovar milestone" };
  }
}