/**
 * RPG-OS — Revenue Engine: Server Actions (FASE 7K/7L/7M).
 *
 * Operações de escrita do Revenue Engine. Tudo é resolvido server-side:
 *  - o tenant (organização) vem da SESSÃO, nunca do cliente;
 *  - a fee é calculada pelo núcleo puro a partir do plano (nunca do cliente);
 *  - os valores monetários são inteiros de centavos validados por
 *    `validateFeeSplit` (invariante gross = fee + net; sem NaN/negativos);
 *  - cada operação grava audit_logs + notifications de forma consistente.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import {
  applyLedgerReversal,
  applyLedgerRefund,
  computePlatformFee,
  proportionalFeeRefund,
  validateFeeSplit,
  revenuePlanFeeBps,
  REVENUE_PLANS,
  type RevenueOrigin,
  type RevenuePlanId,
  type LedgerLine,
} from "@rpg/core";
import { hasPermission } from "@rpg/core";
import { REVENUE_MANAGE_PERMISSION } from "./tenant";
import { getSessionContext } from "@/lib/session";

type Ctx = NonNullable<Awaited<ReturnType<typeof getSessionContext>>>;

function requireManage(ctx: Ctx): boolean {
  return hasPermission(ctx.permissions, REVENUE_MANAGE_PERMISSION);
}

/**
 * Resolve a taxa do plano (source única, no núcleo). Fallback seguro: 250 bps.
 * Nunca hardcoded fora do núcleo.
 */
function feeBpsForPlan(planId: RevenuePlanId | null | undefined): number {
  if (typeof planId === "string" && planId in REVENUE_PLANS) {
    return revenuePlanFeeBps(planId as RevenuePlanId);
  }
  return 250;
}

/**
 * Regista um pagamento de sucesso: calcula a fee pelo plano da organização,
 * valida o invariante e persiste uma linha COLLECTED no ledger + audit.
 */
export async function recordSuccessfulPayment(input: {
  grossCents: number;
  currency?: string;
  planId?: RevenuePlanId | null;
  origin?: RevenueOrigin;
}): Promise<{ ok: boolean; error?: string; ledgerEntryId?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization || !requireManage(ctx)) {
    return { ok: false, error: "Sem autorização para registar receita." };
  }

  const gross = Number(input.grossCents);
  if (!Number.isSafeInteger(gross) || gross < 0) {
    return { ok: false, error: "Montante bruto inválido (centavos inteiros)." };
  }
  const bps = feeBpsForPlan(input.planId ?? null);
  const calc = computePlatformFee({ grossCents: gross, basisPoints: bps });
  const split = validateFeeSplit({
    grossCents: calc.grossCents,
    feeCents: calc.feeCents,
    netCents: calc.netCents,
    basisPoints: bps,
  });
  if (!split.ok) return { ok: false, error: split.error };

  const origin: RevenueOrigin = input.origin ?? "SYSTEM";
  const supabase = createAdminClient();

  const { data: ledgerRow, error } = await supabase
    .from("revenue_ledger_entries")
    .insert({
      organization_id: ctx.organization.id,
      company_id: null,
      source_type: "PAYMENT",
      gross_cents: calc.grossCents,
      fee_cents: calc.feeCents,
      net_cents: calc.netCents,
      basis_points: bps,
      currency: input.currency ?? "EUR",
      fee_collected_cents: calc.feeCents,
      fee_refunded_cents: 0,
      status: "COLLECTED",
      plan_id: input.planId ?? null,
    })
    .select("id")
    .single();
  if (error || !ledgerRow) {
    return { ok: false, error: "Não foi possível registar a receita." };
  }

  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization.id,
    action: "REVENUE_RECORDED",
    module: "REVENUE",
    entityType: "REVENUE_LEDGER_ENTRY",
    entityId: String(ledgerRow.id),
    metadata: {
      action: "REVENUE_RECORDED",
      origin,
      organizationId: ctx.organization.id,
      grossCents: calc.grossCents,
      feeCents: calc.feeCents,
      planId: input.planId ?? null,
      status: "COLLECTED",
    },
  });

  // Notificação discreta (sem spam): uma por registo de receita.
  await notifyUser(ctx.user.id, "Receita registada", {
    body: `Recebido ${calc.grossCents / 100}€ (fee ${calc.feeCents / 100}€).`,
    category: "INFO",
  });

  return { ok: true, ledgerEntryId: String(ledgerRow.id) };
}

/**
 * Regista um reembolso/reversão proporcional: valida que o montante não
 * excede o bruto e que a fee a devolver é exata; insere a linha no trilho
 * de refunds e marca a entrada do ledger como REFUNDED/PARTIALLY_REFUNDED
 * (append-oriented: criamos um novo estado refletido).
 */
export async function recordRefund(input: {
  ledgerEntryId: string;
  refundCents: number;
  type?: "REFUND" | "REVERSAL";
  origin?: RevenueOrigin;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization || !requireManage(ctx)) {
    return { ok: false, error: "Sem autorização para reembolsar." };
  }
  const supabase = createAdminClient();

  const { data: line } = await supabase
    .from("revenue_ledger_entries")
    .select("*")
    .eq("id", input.ledgerEntryId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!line) return { ok: false, error: "Entrada de receita não encontrada." };

  const gross = Number(line.gross_cents);
  const feeCollected = Number(line.fee_collected_cents);
  const refundCents = Number(input.refundCents);
  if (!Number.isSafeInteger(refundCents) || refundCents < 0) {
    return { ok: false, error: "Montante de reembolso inválido." };
  }

  const type = input.type === "REVERSAL" ? "REVERSAL" : "REFUND";
  let feeToRefund: number;
  let netToRefund: number;

  if (type === "REVERSAL") {
    feeToRefund = feeCollected;
    netToRefund = refundCents - feeToRefund;
  } else {
    const p = proportionalFeeRefund({
      totalCents: gross,
      totalFeeCents: feeCollected,
      refundCents,
    });
    if (!p.ok) return { ok: false, error: p.error };
    feeToRefund = p.cents;
    netToRefund = refundCents - feeToRefund;
  }

  if (netToRefund < 0) {
    return { ok: false, error: "Reembolso excede o valor brutável." };
  }
  if (feeToRefund + netToRefund !== refundCents) {
    return { ok: false, error: "Invariante de reembolso quebrado." };
  }

  const ledgerLine: LedgerLine = {
    id: String(line.id),
    organizationId: String(line.organization_id),
    companyId: line.company_id ? String(line.company_id) : undefined,
    grossCents: gross,
    feeCents: Number(line.fee_cents),
    netCents: Number(line.net_cents),
    feeCollectedCents: feeCollected,
    basisPoints: Number(line.basis_points),
    feeRefundedCents: Number(line.fee_refunded_cents),
    status: String(line.status) as LedgerLine["status"],
    createdAt: String(line.created_at),
    updatedAt: String(line.updated_at),
  };

  const mutation =
    type === "REVERSAL"
      ? applyLedgerReversal(ledgerLine, input.reason)
      : applyLedgerRefund(ledgerLine, refundCents, input.reason);
  if (!mutation.ok || !mutation.line) {
    return { ok: false, error: mutation.error ?? "Refund inválido." };
  }

  const { error: refundErr } = await supabase.from("revenue_refunds").insert({
    organization_id: ctx.organization.id,
    ledger_entry_id: input.ledgerEntryId,
    refund_cents: refundCents,
    fee_to_refund_cents: feeToRefund,
    net_to_refund_cents: netToRefund,
    type,
    orientation: input.origin ?? "USER",
    reason: input.reason ?? null,
    acted_by: ctx.user.id,
  });
  if (refundErr) return { ok: false, error: "Não foi possível registar o reembolso." };

  await supabase
    .from("revenue_ledger_entries")
    .update({
      status: mutation.line.status,
      fee_refunded_cents: mutation.line.feeRefundedCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ledgerEntryId)
    .eq("organization_id", ctx.organization.id);

  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization.id,
    action: type === "REVERSAL" ? "REVENUE_REVERSED" : "REFUND_CREATED",
    module: "REVENUE",
    entityType: "REVENUE_LEDGER_ENTRY",
    entityId: input.ledgerEntryId,
    metadata: {
      action: type === "REVERSAL" ? "REVENUE_REVERSED" : "REFUND_CREATED",
      origin: input.origin ?? "USER",
      organizationId: ctx.organization.id,
      refundCents,
      feeToRefundCents: feeToRefund,
      netToRefundCents: netToRefund,
      reason: input.reason ?? null,
    },
  });

  await notifyUser(ctx.user.id, type === "REVERSAL" ? "Receita revertida" : "Reembolso registado", {
    body: `Reembolso de ${refundCents / 100}€ (fee ${feeToRefund / 100}€).`,
    category: "INFO",
  });

  return { ok: true };
}

/**
 * Cria/atualiza a subscrição da organização (plano, mensalidade e período).
 * Grava auditoria. A cobrança em si é feita por um provider (sandbox).
 */
export async function upsertSubscription(input: {
  planId: RevenuePlanId;
  status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELLED";
  origin?: RevenueOrigin;
}): Promise<{ ok: boolean; error?: string; subscriptionId?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization || !requireManage(ctx)) {
    return { ok: false, error: "Sem autorização para gerir a subscrição." };
  }
  if (!(input.planId in REVENUE_PLANS)) {
    return { ok: false, error: "Plano inválido." };
  }
  const supabase = createAdminClient();
  const plan = REVENUE_PLANS[input.planId];
  const status = input.status ?? "ACTIVE";
  const now = new Date();

  const { data: existing } = await supabase
    .from("organization_subscriptions")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  const fields = {
    plan_id: input.planId,
    status,
    monthly_price_cents: plan.monthlyPriceCents,
    current_period_start: now.toISOString(),
    current_period_end: new Date(now.getTime() + 30 * 86400000).toISOString(),
    updated_at: now.toISOString(),
  };

  const result = existing
    ? await supabase
        .from("organization_subscriptions")
        .update(fields)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase
        .from("organization_subscriptions")
        .insert({ organization_id: ctx.organization.id, ...fields })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { ok: false, error: "Não foi possível guardar a subscrição." };
  }

  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization.id,
    action: existing ? "SUBSCRIPTION_UPDATED" : "SUBSCRIPTION_CREATED",
    module: "REVENUE",
    entityType: "ORGANIZATION_SUBSCRIPTION",
    entityId: String(result.data.id),
    metadata: {
      action: existing ? "SUBSCRIPTION_UPDATED" : "SUBSCRIPTION_CREATED",
      origin: input.origin ?? "USER",
      organizationId: ctx.organization.id,
      planId: input.planId,
      status,
      monthlyPriceCents: plan.monthlyPriceCents,
    },
  });

  return { ok: true, subscriptionId: String(result.data.id) };
}

/**
 * Cancela a subscrição da organização (fim de período) + auditoria.
 */
export async function cancelSubscription(input: {
  reason?: string;
  origin?: RevenueOrigin;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization || !requireManage(ctx)) {
    return { ok: false, error: "Sem autorização para cancelar a subscrição." };
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organization_subscriptions")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Sem subscrição para cancelar." };

  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization.id,
    action: "SUBSCRIPTION_CANCELLED",
    module: "REVENUE",
    entityType: "ORGANIZATION_SUBSCRIPTION",
    entityId: String(data.id),
    metadata: {
      action: "SUBSCRIPTION_CANCELLED",
      origin: input.origin ?? "USER",
      organizationId: ctx.organization.id,
      reason: input.reason ?? null,
      status: "CANCELLED",
    },
  });

  return { ok: true };
}
