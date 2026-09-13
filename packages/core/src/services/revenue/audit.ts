/**
 * RPG-OS — Revenue audit actions & notificação (FASE 7L/7M).
 *
 * Nomes canónicos de ações de auditoria e de notificações do Revenue Engine,
 * para que a camada de integração (Server Actions) os persista de forma
 * consistente e a página /auditoria os apresente de forma legível.
 */

/** Ações de auditoria do Revenue Engine (a gravar em audit_logs.action). */
export const REVENUE_AUDIT_ACTIONS = [
  "PAYMENT_CREATED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PLATFORM_FEE_CALCULATED",
  "REVENUE_RECORDED",
  "REVENUE_COLLECTED",
  "REFUND_CREATED",
  "REVENUE_REVERSED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_CANCELLED",
  "SUBSCRIPTION_UPDATED",
  "FEE_CONFIG_CHANGED",
  "SUBSCRIPTION_STATUS_CHANGED",
  "SUBSCRIPTION_PROPOSED",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_UPGRADED",
  "SUBSCRIPTION_DOWNGRADED",
  "SUBSCRIPTION_PAUSED",
  "SUBSCRIPTION_RESUMED",
  "SUBSCRIPTION_RENEWED",
  "PRICING_CHANGED",
  "COMMISSION_RATE_CHANGED",
  "BILLING_PERIOD_SETTLED",
  "SUB_METRIC_EXPORTED",
] as const;

export type RevenueAuditAction = (typeof REVENUE_AUDIT_ACTIONS)[number];

/** Origem identificável da operação (audit_logs metadata.orientation). */
export const REVENUE_ORIGINS = ["USER", "ADMIN", "SYSTEM", "AUTOMATION"] as const;
export type RevenueOrigin = (typeof REVENUE_ORIGINS)[number];

export function isRevenueAuditAction(value: unknown): value is RevenueAuditAction {
  return (
    typeof value === "string" &&
    (REVENUE_AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}

/** Categorias de notificação usadas pelo Revenue Engine. */
export const REVENUE_NOTIFICATION_CATEGORIES = [
  "PAYMENT",
  "REVENUE",
  "SUBSCRIPTION",
  "REFUND",
] as const;

export type RevenueNotificationCategory =
  (typeof REVENUE_NOTIFICATION_CATEGORIES)[number];

/** Metadados estruturados para gravar no audit_logs. */
export interface RevenueAuditMetadata {
  action: RevenueAuditAction;
  organizationId?: string | null;
  companyId?: string | null;
  transactionId?: string | null;
  origin: RevenueOrigin;
  grossCents?: number;
  feeCents?: number;
  refundCents?: number;
  planId?: string | null;
  status?: string | null;
  reason?: string | null;
}
