/**
 * RPG-OS — Life Collectors (A Minha Vida)
 *
 * Cada collector converte dados REAIS do domínio em LifeItem[] / LifeEvent[].
 * Regras absolutas:
 * - Nunca inventar entidades (sem fake invoices/tolls/payments).
 * - Mobility = PREPARED_ONLY: devolve [] itens, nunca ação "pay".
 * - Domínios sem dados acessíveis devolvem [] + estado honesto.
 */
import type { LifeDomain, LifeEvent, LifeItem } from "../../types/vida";
import type {
  LifeCollector,
  LifeCollectorContext,
  LifeDomainStatusEntry,
} from "./LifeAggregationService";

// ---------------------------------------------------------------------------
// Inputs mínimos (shapes do tenant já autorizado; sem acesso direto à BD aqui)
// ---------------------------------------------------------------------------

export interface FinanceLifeInput {
  bills: Array<{
    id: string;
    name: string;
    amount: number;
    dueDate: string;
    status: string;
  }>;
  debts: Array<{
    id: string;
    creditorName: string;
    outstandingAmount: number;
    nextDueDate: string | null;
    status: string;
  }>;
}

export interface DocumentsLifeInput {
  documents: Array<{
    id: string;
    fileName: string;
    category: string;
    expiresAt: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Agenda + Tarefas (plataforma RPG-OS, NÃO um domínio Life externo)
//
// O modelo LifeDomain V1 não tem "tasks"/"agenda" — e mapear tarefas para
// "government" ou "documents" seria DESONESTO (origem falsa, ação errada).
// Por isso estes dados NÃO passam por LifeCollector: a camada web entrega-os
// em separado (TodayContext) com links corretos (/agenda, /tarefas).
// Mantemos aqui apenas os shapes partilhados para a camada web usar.
// ---------------------------------------------------------------------------

export interface AgendaEventInput {
  id: string;
  title: string;
  startTime: string | null;
  eventType: string;
  location?: string | null;
}

export interface TaskInput {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  priority: string;
}

export interface TodayContext {
  events: AgendaEventInput[];
  tasks: TaskInput[];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Finance (LIVE quando há dados reais do tenant)
// ---------------------------------------------------------------------------

export function financeItems(input: FinanceLifeInput, ctx: LifeCollectorContext): LifeItem[] {
  const items: LifeItem[] = [];
  for (const b of input.bills) {
    if (b.status === "PAID") continue;
    const overdue = dayKey(b.dueDate) < ctx.today;
    items.push({
      id: `finance-bill-${b.id}`,
      domain: "finance",
      type: "invoice_due",
      title: overdue ? `Conta em atraso: ${b.name}` : `Conta a vencer: ${b.name}`,
      description: overdue
        ? `Venceu a ${dayKey(b.dueDate)}.`
        : `Vence a ${dayKey(b.dueDate)}.`,
      priority: overdue ? "high" : dayKey(b.dueDate) <= addDays(ctx.today, 2) ? "high" : dayKey(b.dueDate) <= addDays(ctx.today, 7) ? "medium" : "low",
      status: "LIVE",
      source: "OFFICIAL",
      sourceEntityId: b.id,
      sourceDomain: "finance",
      timestamp: ctx.nowIso,
      dueDate: b.dueDate,
      capability: "finance.read.bills",
      capabilityConfidence: "verified",
      action: "view",
      privacyLevel: "personal",
    });
  }
  for (const d of input.debts) {
    if (d.status !== "OPEN") continue;
    const overdue = d.nextDueDate ? dayKey(d.nextDueDate) < ctx.today : false;
    items.push({
      id: `finance-debt-${d.id}`,
      domain: "finance",
      type: "invoice_due",
      title: `Dívida em aberto: ${d.creditorName}`,
      description: d.nextDueDate
        ? overdue
          ? `Prestação vencida a ${dayKey(d.nextDueDate)}.`
          : `Próxima prestação a ${dayKey(d.nextDueDate)}.`
        : "Sem prazo definido.",
      priority: overdue ? "high" : "medium",
      status: "LIVE",
      source: "OFFICIAL",
      sourceEntityId: d.id,
      sourceDomain: "finance",
      timestamp: ctx.nowIso,
      dueDate: d.nextDueDate ?? undefined,
      capability: "finance.read.debts",
      capabilityConfidence: "verified",
      action: "view",
      privacyLevel: "personal",
    });
  }
  return items;
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export class FinanceLifeCollector implements LifeCollector {
  readonly domain = "finance" as const;
  constructor(private input: FinanceLifeInput) {}
  collectItems(ctx: LifeCollectorContext): LifeItem[] {
    return financeItems(this.input, ctx);
  }
  collectEvents(ctx: LifeCollectorContext): LifeEvent[] {
    // Eventos financeiros reais mínimos: contas vencidas recentes → timeline "past/overdue".
    const events: LifeEvent[] = [];
    for (const b of this.input.bills) {
      if (b.status === "PAID") continue;
      if (dayKey(b.dueDate) < ctx.today) {
        events.push({
          id: `finance-event-${b.id}`,
          domain: "finance",
          type: "invoice_received",
          title: `Conta vencida: ${b.name}`,
          domainTitle: "Finanças",
          sourceEntityId: b.id,
          timestamp: b.dueDate,
          status: "overdue",
        });
      }
    }
    return events;
  }
  status(): LifeDomainStatusEntry {
    const hasData = this.input.bills.length > 0 || this.input.debts.length > 0;
    return {
      domain: "finance",
      state: "LIVE",
      label: hasData ? "Dados disponíveis" : "Ligado, sem registos",
      detail: hasData ? undefined : "Regista contas e dívidas para veres alertas aqui.",
    };
  }
}

// ---------------------------------------------------------------------------
// Documents (LIVE/MANUAL a partir de documentos reais com expiração)
// ---------------------------------------------------------------------------

export class DocumentsLifeCollector implements LifeCollector {
  readonly domain = "documents" as const;
  constructor(private input: DocumentsLifeInput) {}
  collectItems(ctx: LifeCollectorContext): LifeItem[] {
    const items: LifeItem[] = [];
    for (const d of this.input.documents) {
      if (!d.expiresAt) continue;
      const key = dayKey(d.expiresAt);
      if (key > addDays(ctx.today, 30)) continue;
      const overdue = key < ctx.today;
      items.push({
        id: `documents-doc-${d.id}`,
        domain: "documents",
        type: "document_received",
        title: overdue ? `Documento expirado: ${d.fileName}` : `Documento a expirar: ${d.fileName}`,
        description: `${d.category} • ${overdue ? "expirou" : "expira"} a ${key}.`,
        priority: overdue ? "high" : key <= addDays(ctx.today, 7) ? "medium" : "low",
        status: "LIVE",
        source: "OFFICIAL",
        sourceEntityId: d.id,
        sourceDomain: "documents",
        timestamp: ctx.nowIso,
        dueDate: d.expiresAt,
        capability: "documents.read.expiring",
        capabilityConfidence: "verified",
        action: "view",
        privacyLevel: "personal",
      });
    }
    return items;
  }
  collectEvents(): LifeEvent[] {
    return [];
  }
  status(): LifeDomainStatusEntry {
    return {
      domain: "documents",
      state: this.input.documents.length > 0 ? "LIVE" : "LIVE",
      label: this.input.documents.length > 0 ? "Dados disponíveis" : "Disponível, sem documentos",
    };
  }
}

// ---------------------------------------------------------------------------
// Mobility — PREPARED_ONLY. Nunca gera itens fake nem ação "pay".
// ---------------------------------------------------------------------------

export class MobilityLifeCollector implements LifeCollector {
  readonly domain = "mobility" as const;
  collectItems(_ctx: LifeCollectorContext): LifeItem[] {
    return [];
  }
  collectEvents(_ctx: LifeCollectorContext): LifeEvent[] {
    return [];
  }
  status(): LifeDomainStatusEntry {
    return {
      domain: "mobility",
      state: "PREPARED_ONLY",
      label: "Preparado para ligação",
      detail: "Via Verde e CTT: preparados para integração oficial. Consulta manual disponível.",
    };
  }
}

// ---------------------------------------------------------------------------
// Fiscal — LIVE apenas a partir de linhas reais first-party.
//
// Fontes permitidas: fiscal_obligations, fiscal_inbox_items e invoices
// (estas últimas só quando carregadas com companyId válido — sem user_id
// na tabela, query global é proibida; o scope vive na camada web).
//
// PROIBIDO como fonte: fiscalCalendar, obrigações dinâmicas calculadas em
// memória, EFaturaAdapter, AtTaxAuthorityAdapter, SibsPaymentGatewayAdapter
// e qualquer operação pay/submit/validate/download.
// ---------------------------------------------------------------------------

export interface FiscalObligationInput {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  /** PENDING | OVERDUE | SUBMITTED | PAID | ... (só PENDING/OVERDUE geram itens) */
  status: string;
}

export interface FiscalInboxItemInput {
  id: string;
  title: string;
  /** UNREAD | READ | RESOLVED | ... (só UNREAD com dueDate gera item) */
  status: string;
  dueDate: string | null;
  /** INVOICE | DEADLINE | ... (INVOICE → document_received) */
  entityType?: string;
}

export interface FiscalInvoiceInput {
  id: string;
  invoiceNumber: string;
  balanceDue: number;
  dueDate: string;
  /** ISSUED | PARTIALLY_PAID (DRAFT/PAID/CANCELLED nunca geram itens) */
  status: string;
}

export interface FiscalLifeInput {
  obligations: FiscalObligationInput[];
  inboxItems: FiscalInboxItemInput[];
  /** Faturas já filtradas com company scope válido (nunca query global). */
  invoices: FiscalInvoiceInput[];
}

export class FiscalLifeCollector implements LifeCollector {
  readonly domain = "fiscal" as const;
  constructor(private input: FiscalLifeInput) {}
  collectItems(ctx: LifeCollectorContext): LifeItem[] {
    const items: LifeItem[] = [];
    for (const o of this.input.obligations) {
      if (o.status !== "PENDING" && o.status !== "OVERDUE") continue;
      if (!o.dueDate) continue;
      const overdue = o.status === "OVERDUE" || dayKey(o.dueDate) < ctx.today;
      items.push({
        id: `fiscal-obligation-${o.id}`,
        domain: "fiscal",
        type: "tax_deadline",
        title: overdue ? `Obrigação fiscal em atraso: ${o.title}` : `Prazo fiscal: ${o.title}`,
        description: `${o.category} • ${overdue ? "venceu" : "vence"} a ${dayKey(o.dueDate)}.`,
        priority: overdue
          ? "high"
          : dayKey(o.dueDate) <= addDays(ctx.today, 7)
            ? "medium"
            : "low",
        status: "LIVE",
        source: "OFFICIAL",
        sourceEntityId: o.id,
        sourceDomain: "fiscal",
        timestamp: ctx.nowIso,
        dueDate: o.dueDate,
        capability: "fiscal.read.obligations",
        capabilityConfidence: "verified",
        action: "view",
        privacyLevel: "personal",
      });
    }
    for (const item of this.input.inboxItems) {
      if (item.status !== "UNREAD" || !item.dueDate) continue;
      const key = dayKey(item.dueDate);
      const overdue = key < ctx.today;
      const isDocument = item.entityType === "INVOICE";
      items.push({
        id: `fiscal-inbox-${item.id}`,
        domain: "fiscal",
        type: isDocument ? "document_received" : "tax_deadline",
        title: item.title,
        description: overdue ? `Venceu a ${key}.` : `Vence a ${key}.`,
        priority: overdue ? "high" : key <= addDays(ctx.today, 7) ? "medium" : "low",
        status: "LIVE",
        source: "OFFICIAL",
        sourceEntityId: item.id,
        sourceDomain: "fiscal",
        timestamp: ctx.nowIso,
        dueDate: item.dueDate,
        capability: "fiscal.read.inbox",
        capabilityConfidence: "verified",
        action: "view",
        privacyLevel: "personal",
      });
    }
    for (const inv of this.input.invoices) {
      if (inv.status !== "ISSUED" && inv.status !== "PARTIALLY_PAID") continue;
      if (!(inv.balanceDue > 0)) continue;
      const overdue = dayKey(inv.dueDate) < ctx.today;
      items.push({
        id: `fiscal-invoice-${inv.id}`,
        domain: "fiscal",
        type: "invoice_due",
        title: `Fatura por pagar: ${inv.invoiceNumber}`,
        description: overdue
          ? `Venceu a ${dayKey(inv.dueDate)}.`
          : `Vence a ${dayKey(inv.dueDate)}.`,
        priority: overdue ? "high" : dayKey(inv.dueDate) <= addDays(ctx.today, 7) ? "medium" : "low",
        status: "LIVE",
        source: "OFFICIAL",
        sourceEntityId: inv.id,
        sourceDomain: "fiscal",
        timestamp: ctx.nowIso,
        dueDate: inv.dueDate,
        capability: "fiscal.read.invoices",
        capabilityConfidence: "verified",
        action: "view",
        privacyLevel: "personal",
      });
    }
    return items;
  }
  collectEvents(ctx: LifeCollectorContext): LifeEvent[] {
    // Obrigações vencidas reais → timeline "overdue" (mesmo padrão do Finance).
    const events: LifeEvent[] = [];
    for (const o of this.input.obligations) {
      if (o.status !== "PENDING" && o.status !== "OVERDUE") continue;
      if (dayKey(o.dueDate) < ctx.today) {
        events.push({
          id: `fiscal-event-${o.id}`,
          domain: "fiscal",
          type: "tax_filing_due",
          title: `Prazo fiscal vencido: ${o.title}`,
          domainTitle: "Fiscal",
          sourceEntityId: o.id,
          timestamp: o.dueDate,
          status: "overdue",
        });
      }
    }
    return events;
  }
  status(): LifeDomainStatusEntry {
    const hasData =
      this.input.obligations.length > 0 ||
      this.input.inboxItems.length > 0 ||
      this.input.invoices.length > 0;
    return {
      domain: "fiscal",
      state: "LIVE",
      label: hasData ? "Dados disponíveis" : "Ligado, sem registos",
      detail: hasData
        ? undefined
        : "Regista obrigações fiscais para veres prazos aqui. Sem integração automática com a AT.",
    };
  }
}

// ---------------------------------------------------------------------------
// Stubs honestos: health / fiscal / government / social_security
// (sem dados reais acessíveis nesta fase → [] + UNAVAILABLE/PREPARED_ONLY)
// ---------------------------------------------------------------------------

function stubCollector(
  domain: LifeDomain,
  state: LifeDomainStatusEntry["state"],
  label: string,
  detail?: string,
): LifeCollector {
  return {
    domain,
    collectItems: () => [],
    collectEvents: () => [],
    status: () => ({ domain, state, label, detail }),
  };
}

export function healthStub(): LifeCollector {
  return stubCollector(
    "health",
    "PREPARED_ONLY",
    "Preparado para ligação",
    "SNS/SPMS: sem ligação oficial ativa.",
  );
}

export function fiscalStub(): LifeCollector {
  return stubCollector(
    "fiscal",
    "MANUAL",
    "Consulta manual",
    "AT: sem integração automática. Usa o Portal das Finanças.",
  );
}

export function governmentStub(): LifeCollector {
  return stubCollector(
    "government",
    "MANUAL",
    "Consulta manual",
    "Autenticação gov e e-Fatura: preparação em curso.",
  );
}

export function socialSecurityStub(): LifeCollector {
  return stubCollector(
    "social_security",
    "PREPARED_ONLY",
    "Preparado para ligação",
    "Segurança Social: sem ligação oficial ativa.",
  );
}
