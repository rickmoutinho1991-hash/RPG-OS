/**
 * RPG-OS Fiscal Inbox - Caixa Fiscal (FASE 10J-I)
 *
 * Unified inbox for all fiscal and government communications.
 * Aggregates issued/received invoices, credit/debit notes, government notifications,
 * rejected submissions, pending items, reconciliation issues, VAT anomalies, SAF-T issues, deadlines.
 */

import type { Invoice, InvoiceType } from "../../types/invoice";
import type { GovernmentProviderId, GovernmentProviderStatus } from "./governmentIntegration";

/** Fiscal inbox item types */
export type FiscalInboxItemType =
  | "INVOICE_ISSUED"           // Fatura emitida
  | "INVOICE_RECEIVED"         // Fatura recebida (fornecedor)
  | "CREDIT_NOTE"              // Nota de crédito
  | "DEBIT_NOTE"               // Nota de débito
  | "GOVERNMENT_NOTIFICATION"  // Notificação da AT/e-Fatura/Segurança Social
  | "REJECTED_SUBMISSION"      // Submissão rejeitada
  | "PENDING_SUBMISSION"       // Submissão pendente
  | "RECONCILIATION_ISSUE"     // Problema de reconciliação
  | "VAT_ANOMALY"              // Anomalia de IVA
  | "SAFT_ISSUE"               // Problema SAF-T
  | "DEADLINE"                 // Prazo fiscal
  | "PAYMENT_DUE"              // Pagamento em atraso
  | "CONSENT_EXPIRING"         // Consentimento a expirar
  | "CONNECTION_ERROR";        // Erro de conexão

/** Fiscal inbox item priority */
export type FiscalInboxPriority =
  | "CRITICAL"   // Ação imediata necessária (ex: prazo hoje, submissão rejeitada)
  | "HIGH"       // Ação necessária em breve (ex: prazo esta semana)
  | "MEDIUM"     // Atenção necessária (ex: reconciliação pendente)
  | "LOW";       // Informativo (ex: notificação recebida)

/** Fiscal inbox item status */
export type FiscalInboxStatus =
  | "UNREAD"
  | "READ"
  | "ACTION_REQUIRED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DISMISSED";

/** Fiscal inbox item */
export interface FiscalInboxItem {
  id: string;
  organization_id: string;
  type: FiscalInboxItemType;
  priority: FiscalInboxPriority;
  status: FiscalInboxStatus;
  /** Título/resumo */
  title: string;
  /** Descrição detalhada */
  description: string;
  /** Entidade relacionada */
  entity_type: "INVOICE" | "CONNECTION" | "CONSENT" | "DEADLINE" | "RECONCILIATION" | "PAYMENT" | "NOTIFICATION";
  /** ID da entidade relacionada */
  entity_id: string;
  /** Tipo de documento fiscal (se aplicável) */
  document_type?: InvoiceType;
  /** Série do documento */
  series?: string;
  /** Número do documento */
  document_number?: string;
  /** NIF/NIPC do cliente/fornecedor */
  counterparty_nif?: string;
  /** Nome do cliente/fornecedor */
  counterparty_name?: string;
  /** Valor em cêntimos */
  amount_cents?: number;
  /** IVA em cêntimos */
  vat_cents?: number;
  /** Data de emissão/vencimento */
  issue_date?: string;
  due_date?: string;
  /** Fornecedor da notificação (se government) */
  provider?: GovernmentProviderId;
  /** Ação recomendada */
  recommended_action?: string;
  /** URL de ação direta */
  action_url?: string;
  /** Tags para filtragem */
  tags?: string[];
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
  /** Criado em */
  created_at: string;
  /** Lido em */
  read_at?: string;
  /** Resolvido em */
  resolved_at?: string;
  /** Resolvido por */
  resolved_by?: string;
}

/** Filtros para a caixa fiscal */
export interface FiscalInboxFilters {
  types?: FiscalInboxItemType[];
  priorities?: FiscalInboxPriority[];
  statuses?: FiscalInboxStatus[];
  document_types?: InvoiceType[];
  counterparty_nif?: string;
  provider?: GovernmentProviderId;
  date_from?: string;
  date_to?: string;
  tags?: string[];
  unread_only?: boolean;
  action_required_only?: boolean;
}

/** Estatísticas da caixa fiscal */
export interface FiscalInboxStats {
  total: number;
  unread: number;
  action_required: number;
  by_priority: Record<FiscalInboxPriority, number>;
  by_type: Record<FiscalInboxItemType, number>;
  by_status: Record<FiscalInboxStatus, number>;
  overdue_deadlines: number;
  pending_submissions: number;
  rejected_submissions: number;
  reconciliation_issues: number;
}

/** Ação em lote na caixa fiscal */
export type FiscalInboxBulkAction =
  | "MARK_READ"
  | "MARK_UNREAD"
  | "MARK_RESOLVED"
  | "DISMISS"
  | "ASSIGN"
  | "EXPORT";

/** Resultado de ação em lote */
export interface FiscalInboxBulkActionResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

/** Serviço de caixa fiscal */
export class FiscalInboxService {
  private items: Map<string, FiscalInboxItem> = new Map();

  /**
   * Adiciona item à caixa fiscal
   */
  addItem(item: Omit<FiscalInboxItem, "id" | "created_at">): FiscalInboxItem {
    const id = `inbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const newItem: FiscalInboxItem = {
      ...item,
      id,
      created_at: now,
      tags: item.tags ?? [],
      metadata: item.metadata ?? {},
    };

    this.items.set(id, newItem);
    return newItem;
  }

  /**
   * Obtém item por ID
   */
  getItem(id: string): FiscalInboxItem | undefined {
    return this.items.get(id);
  }

  /**
   * Lista itens com filtros
   */
  listItems(organizationId: string, filters: FiscalInboxFilters = {}): FiscalInboxItem[] {
    let items = Array.from(this.items.values())
      .filter(item => item.organization_id === organizationId);

    if (filters.types?.length) {
      items = items.filter(item => filters.types!.includes(item.type));
    }
    if (filters.priorities?.length) {
      items = items.filter(item => filters.priorities!.includes(item.priority));
    }
    if (filters.statuses?.length) {
      items = items.filter(item => filters.statuses!.includes(item.status));
    }
    if (filters.document_types?.length) {
      items = items.filter(item => item.document_type && filters.document_types!.includes(item.document_type));
    }
    if (filters.counterparty_nif) {
      items = items.filter(item => item.counterparty_nif === filters.counterparty_nif);
    }
    if (filters.provider) {
      items = items.filter(item => item.provider === filters.provider);
    }
    if (filters.date_from) {
      items = items.filter(item => item.created_at >= filters.date_from!);
    }
    if (filters.date_to) {
      items = items.filter(item => item.created_at <= filters.date_to!);
    }
    if (filters.tags?.length) {
      items = items.filter(item => filters.tags!.some(tag => item.tags?.includes(tag)));
    }
    if (filters.unread_only) {
      items = items.filter(item => item.status === "UNREAD");
    }
    if (filters.action_required_only) {
      items = items.filter(item => item.status === "ACTION_REQUIRED");
    }

    // Ordenar: prioridade crítica primeiro, depois por data decrescente
    const priorityOrder: Record<FiscalInboxPriority, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

    items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return items;
  }

  /**
   * Obtém estatísticas da caixa fiscal
   */
  getStats(organizationId: string): FiscalInboxStats {
    const items = Array.from(this.items.values())
      .filter(item => item.organization_id === organizationId);

    const stats: FiscalInboxStats = {
      total: items.length,
      unread: 0,
      action_required: 0,
      by_priority: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      by_type: {} as Record<FiscalInboxItemType, number>,
      by_status: { UNREAD: 0, READ: 0, ACTION_REQUIRED: 0, IN_PROGRESS: 0, RESOLVED: 0, DISMISSED: 0 },
      overdue_deadlines: 0,
      pending_submissions: 0,
      rejected_submissions: 0,
      reconciliation_issues: 0,
    };

    for (const item of items) {
      if (item.status === "UNREAD") stats.unread++;
      if (item.status === "ACTION_REQUIRED") stats.action_required++;

      stats.by_priority[item.priority]++;
      stats.by_type[item.type] = (stats.by_type[item.type] || 0) + 1;
      stats.by_status[item.status]++;

      if (item.type === "DEADLINE" && item.due_date && new Date(item.due_date) < new Date()) {
        stats.overdue_deadlines++;
      }
      if (item.type === "PENDING_SUBMISSION") stats.pending_submissions++;
      if (item.type === "REJECTED_SUBMISSION") stats.rejected_submissions++;
      if (item.type === "RECONCILIATION_ISSUE") stats.reconciliation_issues++;
    }

    return stats;
  }

  /**
   * Marca item como lido
   */
  markAsRead(id: string, userId: string): FiscalInboxItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    item.status = "READ";
    item.read_at = new Date().toISOString();
    item.metadata = { ...item.metadata, read_by: userId };
    this.items.set(id, item);
    return item;
  }

  /**
   * Marca item como resolvido
   */
  markAsResolved(id: string, userId: string, resolution?: string): FiscalInboxItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    item.status = "RESOLVED";
    item.resolved_at = new Date().toISOString();
    item.resolved_by = userId;
    if (resolution) {
      item.metadata = { ...item.metadata, resolution };
    }
    this.items.set(id, item);
    return item;
  }

  /**
   * Marca item como em progresso
   */
  markInProgress(id: string, userId: string): FiscalInboxItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    item.status = "IN_PROGRESS";
    item.metadata = { ...item.metadata, in_progress_by: userId, in_progress_at: new Date().toISOString() };
    this.items.set(id, item);
    return item;
  }

  /**
   * Descarta item
   */
  dismiss(id: string, userId: string): FiscalInboxItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    item.status = "DISMISSED";
    item.resolved_at = new Date().toISOString();
    item.resolved_by = userId;
    item.metadata = { ...item.metadata, dismissed_by: userId, dismissed_at: new Date().toISOString() };
    this.items.set(id, item);
    return item;
  }

  /**
   * Ação em lote
   */
  bulkAction(
    organizationId: string,
    itemIds: string[],
    action: FiscalInboxBulkAction,
    userId: string,
    extraData?: Record<string, unknown>
  ): FiscalInboxBulkActionResult {
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of itemIds) {
      const item = this.items.get(id);
      if (!item || item.organization_id !== organizationId) {
        failed++;
        errors.push(`Item ${id} not found or access denied`);
        continue;
      }

      try {
        switch (action) {
          case "MARK_READ":
            this.markAsRead(id, userId);
            break;
          case "MARK_UNREAD":
            item.status = "UNREAD";
            item.read_at = undefined;
            this.items.set(id, item);
            break;
          case "MARK_RESOLVED":
            this.markAsResolved(id, userId, extraData?.resolution as string);
            break;
          case "DISMISS":
            this.dismiss(id, userId);
            break;
          case "ASSIGN":
            // Would assign to another user
            item.metadata = { ...item.metadata, assigned_to: extraData?.assigned_to, assigned_by: userId, assigned_at: new Date().toISOString() };
            this.items.set(id, item);
            break;
          case "EXPORT":
            // Would trigger export
            break;
        }
        processed++;
      } catch (err) {
        failed++;
        errors.push(`Item ${id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return { success: failed === 0, processed, failed, errors };
  }

  /**
   * Cria item para fatura emitida
   */
  createInvoiceIssuedItem(invoice: {
    id: string;
    organization_id: string;
    invoice_type: InvoiceType;
    series: string;
    document_number: string;
    customer_nif: string;
    customer_name: string;
    total_cents: number;
    vat_cents: number;
    issue_date: string;
    due_date?: string;
  }): FiscalInboxItem {
    return this.addItem({
      organization_id: invoice.organization_id,
      type: "INVOICE_ISSUED",
      priority: "MEDIUM",
      status: "UNREAD",
      title: `Fatura ${invoice.invoice_type} ${invoice.series}/${invoice.document_number} emitida`,
      description: `Fatura de ${invoice.customer_name} (${invoice.customer_nif}) no valor de ${(invoice.total_cents / 100).toFixed(2)} EUR`,
      entity_type: "INVOICE",
      entity_id: invoice.id,
      document_type: invoice.invoice_type,
      series: invoice.series,
      document_number: invoice.document_number,
      counterparty_nif: invoice.customer_nif,
      counterparty_name: invoice.customer_name,
      amount_cents: invoice.total_cents,
      vat_cents: invoice.vat_cents,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      tags: ["fatura", "emitida", invoice.invoice_type.toLowerCase()],
      recommended_action: "Verificar se a fatura foi comunicada à e-Fatura",
      action_url: `/faturacao/${invoice.id}`,
    });
  }

  /**
   * Cria item para submissão rejeitada
   */
  createRejectedSubmissionItem(data: {
    organization_id: string;
    document_id: string;
    document_type: InvoiceType;
    series: string;
    document_number: string;
    provider: GovernmentProviderId;
    error: string;
    submission_id: string;
  }): FiscalInboxItem {
    return this.addItem({
      organization_id: data.organization_id,
      type: "REJECTED_SUBMISSION",
      priority: "CRITICAL",
      status: "ACTION_REQUIRED",
      title: `Submissão rejeitada: ${data.document_type} ${data.series}/${data.document_number}`,
      description: `A submissão à ${data.provider} foi rejeitada: ${data.error}`,
      entity_type: "INVOICE",
      entity_id: data.document_id,
      document_type: data.document_type,
      series: data.series,
      document_number: data.document_number,
      provider: data.provider,
      tags: ["rejeitada", "submissao", data.provider.toLowerCase(), data.document_type.toLowerCase()],
      recommended_action: "Corrigir os erros indicados e re-submeter",
      action_url: `/faturacao/${data.document_id}`,
      metadata: { submission_id: data.submission_id, error: data.error },
    });
  }

  /**
   * Cria item para submissão pendente
   */
  createPendingSubmissionItem(data: {
    organization_id: string;
    document_id: string;
    document_type: InvoiceType;
    series: string;
    document_number: string;
    provider: GovernmentProviderId;
    submitted_at: string;
  }): FiscalInboxItem {
    return this.addItem({
      organization_id: data.organization_id,
      type: "PENDING_SUBMISSION",
      priority: "HIGH",
      status: "ACTION_REQUIRED",
      title: `Submissão pendente: ${data.document_type} ${data.series}/${data.document_number}`,
      description: `Aguardando resposta da ${data.provider} desde ${new Date(data.submitted_at).toLocaleDateString("pt-PT")}`,
      entity_type: "INVOICE",
      entity_id: data.document_id,
      document_type: data.document_type,
      series: data.series,
      document_number: data.document_number,
      provider: data.provider,
      tags: ["pendente", "submissao", data.provider.toLowerCase(), data.document_type.toLowerCase()],
      recommended_action: "Aguardar resposta ou consultar estado manualmente",
      action_url: `/faturacao/${data.document_id}`,
      metadata: { submitted_at: data.submitted_at },
    });
  }

  /**
   * Cria item para problema de reconciliação
   */
  createReconciliationIssueItem(data: {
    organization_id: string;
    document_id: string;
    document_type: InvoiceType;
    series: string;
    document_number: string;
    differences: string[];
    provider: GovernmentProviderId;
  }): FiscalInboxItem {
    return this.addItem({
      organization_id: data.organization_id,
      type: "RECONCILIATION_ISSUE",
      priority: "HIGH",
      status: "ACTION_REQUIRED",
      title: `Reconciliação divergente: ${data.document_type} ${data.series}/${data.document_number}`,
      description: `Diferenças encontradas na reconciliação com a ${data.provider}: ${data.differences.join(", ")}`,
      entity_type: "RECONCILIATION",
      entity_id: data.document_id,
      document_type: data.document_type,
      series: data.series,
      document_number: data.document_number,
      provider: data.provider,
      tags: ["reconciliacao", "divergencia", data.provider.toLowerCase()],
      recommended_action: "Rever as diferenças e corrigir se necessário",
      action_url: `/fiscal/reconciliacao/${data.document_id}`,
      metadata: { differences: data.differences },
    });
  }

  /**
   * Cria item para deadline fiscal
   */
  createDeadlineItem(data: {
    organization_id: string;
    title: string;
    description: string;
    due_date: string;
    type: "IVA" | "SAFT" | "TSU" | "IRS" | "IRC" | "IES" | "OTHER";
    amount_cents?: number;
    payment_reference?: string;
  }): FiscalInboxItem {
    const isOverdue = new Date(data.due_date) < new Date();
    const daysUntil = Math.ceil((new Date(data.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    let priority: FiscalInboxPriority = "MEDIUM";
    if (isOverdue) priority = "CRITICAL";
    else if (daysUntil <= 3) priority = "HIGH";
    else if (daysUntil <= 7) priority = "MEDIUM";

    return this.addItem({
      organization_id: data.organization_id,
      type: "DEADLINE",
      priority,
      status: (isOverdue || daysUntil <= 3) ? "ACTION_REQUIRED" : "UNREAD",
      title: `Prazo ${data.type}: ${data.title}`,
      description: `${data.description}. Vencimento: ${new Date(data.due_date).toLocaleDateString("pt-PT")}${data.amount_cents ? ` - Valor: ${(data.amount_cents / 100).toFixed(2)} EUR` : ""}${data.payment_reference ? ` - Ref: ${data.payment_reference}` : ""}`,
      entity_type: "DEADLINE",
      entity_id: `deadline_${data.type.toLowerCase()}_${Date.now()}`,
      due_date: data.due_date,
      amount_cents: data.amount_cents,
      tags: ["prazo", data.type.toLowerCase(), isOverdue ? "atrasado" : "a_vencer"],
      recommended_action: isOverdue ? "Regularizar imediatamente para evitar coimas" : "Preparar pagamento/submissão atempadamente",
      action_url: data.payment_reference ? `/financas/pagamentos/${data.payment_reference}` : undefined,
      metadata: { deadline_type: data.type, payment_reference: data.payment_reference },
    });
  }

  /**
   * Cria item para erro de conexão
   */
  createConnectionErrorItem(data: {
    organization_id: string;
    provider: GovernmentProviderId;
    error: string;
    connection_id?: string;
  }): FiscalInboxItem {
    return this.addItem({
      organization_id: data.organization_id,
      type: "CONNECTION_ERROR",
      priority: "HIGH",
      status: "ACTION_REQUIRED",
      title: `Erro na conexão com ${data.provider}`,
      description: `Falha na comunicação: ${data.error}`,
      entity_type: "CONNECTION",
      entity_id: data.connection_id ?? "unknown",
      provider: data.provider,
      tags: ["erro", "conexao", data.provider.toLowerCase()],
      recommended_action: "Verificar credenciais e tentar reconectar",
      action_url: `/administracao/governo/conexoes`,
      metadata: { connection_id: data.connection_id, error: data.error },
    });
  }

  /**
   * Cria item para consentimento a expirar
   */
  createConsentExpiringItem(data: {
    organization_id: string;
    provider: GovernmentProviderId;
    expires_at: string;
    scopes: string[];
  }): FiscalInboxItem {
    const daysUntil = Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    let priority: FiscalInboxPriority = "LOW";
    if (daysUntil <= 7) priority = "MEDIUM";
    if (daysUntil <= 3) priority = "HIGH";
    if (daysUntil <= 1) priority = "CRITICAL";

    return this.addItem({
      organization_id: data.organization_id,
      type: "CONSENT_EXPIRING",
      priority,
      status: "UNREAD",
      title: `Consentimento ${data.provider} a expirar`,
      description: `O consentimento para ${data.scopes.join(", ")} expira em ${daysUntil} dia(s)`,
      entity_type: "CONSENT",
      entity_id: `consent_${data.provider}_${Date.now()}`,
      provider: data.provider,
      due_date: data.expires_at,
      tags: ["consentimento", "expirando", data.provider.toLowerCase()],
      recommended_action: "Renovar consentimento antes da expiração",
      action_url: `/administracao/governo/consentimentos`,
      metadata: { scopes: data.scopes, expires_at: data.expires_at },
    });
  }
}

/** Instância global do serviço (para desenvolvimento) */
export const fiscalInboxService = new FiscalInboxService();

/** Helper para criar instância por organização (em produção usaria banco de dados) */
export function createFiscalInboxService(): FiscalInboxService {
  return new FiscalInboxService();
}

// ---------------------------------------------------------------------------
// Transições de estado por ação do utilizador (lógica pura, sem I/O).
// Espelha markAsRead/markInProgress/markAsResolved/dismiss acima e é usada
// pelo writer server-side para validar transições antes de persistir.
// Estados terminais (RESOLVED/DISMISSED) não têm saída; reaplicar o mesmo
// estado é tratado como no-op pelo writer (idempotência).
// ---------------------------------------------------------------------------

/** Ação de utilizador sobre um item do inbox (apenas transições de estado). */
export type FiscalInboxUserAction =
  | "mark_read"
  | "start_progress"
  | "resolve"
  | "dismiss";

const FISCAL_INBOX_TRANSITIONS: Record<
  FiscalInboxStatus,
  Partial<Record<FiscalInboxUserAction, FiscalInboxStatus>>
> = {
  UNREAD: { mark_read: "READ", start_progress: "IN_PROGRESS", resolve: "RESOLVED", dismiss: "DISMISSED" },
  READ: { start_progress: "IN_PROGRESS", resolve: "RESOLVED", dismiss: "DISMISSED" },
  ACTION_REQUIRED: { mark_read: "READ", start_progress: "IN_PROGRESS", resolve: "RESOLVED", dismiss: "DISMISSED" },
  IN_PROGRESS: { resolve: "RESOLVED", dismiss: "DISMISSED" },
  RESOLVED: {},
  DISMISSED: {},
};

/**
 * Resolve o estado seguinte de uma ação do utilizador.
 * Devolve null quando a transição é inválida (o writer deve rejeitar).
 */
export function resolveFiscalInboxTransition(
  current: FiscalInboxStatus,
  action: FiscalInboxUserAction,
): FiscalInboxStatus | null {
  return FISCAL_INBOX_TRANSITIONS[current]?.[action] ?? null;
}