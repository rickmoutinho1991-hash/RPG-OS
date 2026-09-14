import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { ServicesRequestFlow } from "@rpg/core";

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const categoryId = formData.get("categoryId") as string;
  const budgetType = formData.get("budgetType") as "FIXED" | "RANGE" | "NEGOTIABLE";
  const budgetAmountCents = formData.get("budgetAmountCents") ? parseInt(formData.get("budgetAmountCents") as string) : undefined;
  const budgetMinCents = formData.get("budgetMinCents") ? parseInt(formData.get("budgetMinCents") as string) : undefined;
  const budgetMaxCents = formData.get("budgetMaxCents") ? parseInt(formData.get("budgetMaxCents") as string) : undefined;
  const budgetCurrency = formData.get("budgetCurrency") as string;
  const urgency = formData.get("urgency") as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
  const desiredStartDate = formData.get("desiredStartDate") as string | null;
  const desiredEndDate = formData.get("desiredEndDate") as string | null;

  const errors: string[] = [];

  if (!title?.trim()) errors.push("Título obrigatório");
  else if (title.length > 200) errors.push("Título não pode exceder 200 caracteres");

  if (!description?.trim()) errors.push("Descrição obrigatória");
  else if (description.length > 5000) errors.push("Descrição não pode exceder 5000 caracteres");

  if (!categoryId) errors.push("Categoria obrigatória");

  if (!budgetType || !["FIXED", "RANGE", "NEGOTIABLE"].includes(budgetType)) {
    errors.push("Tipo de orçamento inválido");
  }

  if (budgetType === "FIXED" && (!budgetAmountCents || budgetAmountCents <= 0)) {
    errors.push("Orçamento fixo requer valor em cêntimos > 0");
  }

  if (budgetType === "RANGE") {
    if (!budgetMinCents || budgetMinCents <= 0) {
      errors.push("Orçamento mínimo requer valor em cêntimos > 0");
    }
    if (!budgetMaxCents || budgetMaxCents <= 0) {
      errors.push("Orçamento máximo requer valor em cêntimos > 0");
    }
    if (budgetMinCents && budgetMaxCents && budgetMaxCents < budgetMinCents) {
      errors.push("Orçamento máximo deve ser >= orçamento mínimo");
    }
  }

  if (urgency && !["LOW", "MEDIUM", "HIGH", "URGENT"].includes(urgency)) {
    errors.push("Urgência inválida");
  }

  if (desiredStartDate && isNaN(Date.parse(desiredStartDate))) {
    errors.push("Data de início pretendida inválida");
  }

  if (desiredEndDate && isNaN(Date.parse(desiredEndDate))) {
    errors.push("Data de fim pretendida inválida");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  try {
    const flow = new ServicesRequestFlow();
    const result = flow.createRequest({
      clientId: ctx.user.id,
      kind: "SERVICE_REQUEST",
      categoryId,
      title: title.trim(),
      description: description.trim(),
      budget: {
        type: budgetType,
        amountCents: budgetAmountCents,
        minCents: budgetMinCents,
        maxCents: budgetMaxCents,
        currency: budgetCurrency,
      },
      urgency,
      desiredStartDate: desiredStartDate || undefined,
      desiredEndDate: desiredEndDate || undefined,
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

    return NextResponse.json({ success: true, requestId: result.entity.id });
  } catch (err) {
    console.error("[API/mercado/pedido] Erro:", err);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}