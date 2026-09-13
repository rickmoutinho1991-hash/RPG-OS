/**
 * RPG-OS — A Minha Vida aggregation layer (server-only).
 *
 * Fluxo obrigatório:
 *   /vida → esta camada → collectors do domínio → authorization/consent → provider/source
 *
 * - Tenant SEMPRE resolvido no servidor a partir da sessão.
 * - Collectors independentes correm em paralelo; falha parcial propaga-se
 *   como erro isolado sem derrubar os restantes domínios.
 * - Sem queries diretas às tabelas dos domínios a partir da página:
 *   toda a leitura vive aqui, com scope explícito por tenant.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { resolveFinanceTenant, loadFinanceTenantData } from "@/lib/finance/tenant";
import { hasPermission } from "@rpg/core";
import {
  aggregateLife,
  DocumentsLifeCollector,
  FinanceLifeCollector,
  FiscalLifeCollector,
  fiscalStub,
  governmentStub,
  healthStub,
  MobilityLifeCollector,
  socialSecurityStub,
  type AgendaEventInput,
  type LifeAggregationResult,
  type LifeCollector,
  type TaskInput,
} from "@rpg/core";

export interface VidaToday {
  events: Array<AgendaEventInput & { location?: string | null }>;
  tasks: TaskInput[];
}

export interface VidaModel {
  /** Nome real da sessão; null quando indisponível (UI diz só "Bom dia."). */
  name: string | null;
  result: LifeAggregationResult;
  today: VidaToday;
  /** Falha ao carregar agenda/tarefas (não é domínio Life; não derruba a página). */
  todayError: boolean;
}

function toTask(row: Record<string, unknown>): TaskInput {
  return {
    id: String(row.id),
    title: String(row.title),
    dueDate: row.due_date ? new Date(String(row.due_date)).toISOString() : null,
    status: row.status ? String(row.status) : "TODO",
    priority: row.priority ? String(row.priority) : "MEDIUM",
  };
}

function toAgendaEvent(row: Record<string, unknown>): VidaToday["events"][number] {
  return {
    id: String(row.id),
    title: String(row.title),
    startTime: row.start_time ? String(row.start_time) : null,
    eventType: row.event_type ? String(row.event_type) : "REUNIAO",
    location: row.location ? String(row.location) : null,
  };
}

/** Collector que falha sempre: representa carga de domínio que falhou isoladamente. */
function failedCollector(domain: LifeCollector["domain"]): LifeCollector {
  return {
    domain,
    collectItems: () => {
      throw new Error(`${domain} temporariamente indisponível`);
    },
    collectEvents: () => [],
    status: () => ({ domain, state: "LIVE", label: "A verificar" }),
  };
}

/**
 * Carrega o modelo da página /vida para a sessão atual.
 * Autorização (vida.view) ANTES de qualquer carregamento: sem permissão,
 * nenhum collector corre e nenhum dado é exposto. Nunca lança por falha
 * de domínio individual: degrada para estado parcial.
 */
export async function getVidaModel(): Promise<VidaModel | null> {
  const [session, financeCtx] = await Promise.all([
    getSessionContext(),
    resolveFinanceTenant(),
  ]);
  if (!session || !financeCtx) return null;
  // Authorization hardening (R1): mesmo padrão das restantes páginas
  // (tarefas, conhecimento, operações). Sem vida.view não há aggregation.
  if (!hasPermission(session.permissions, "vida.view")) return null;

  const supabase = createAdminClient();
  const { userId, companyId } = financeCtx;
  // Fiscal exige fiscal.view além de vida.view: sem ela, o domínio fiscal
  // mantém o stub honesto (MANUAL) e nenhuma query fiscal corre.
  const canFiscal = hasPermission(session.permissions, "fiscal.view");
  const fiscalOrgId = session.organization?.id ?? null;

  const [financeSettled, docsSettled, agendaSettled, fiscalSettled] = await Promise.allSettled([
    (async (): Promise<LifeCollector> => {
      const data = await loadFinanceTenantData(financeCtx);
      return new FinanceLifeCollector({
        bills: data.bills.map((b) => ({
          id: b.id,
          name: b.name,
          amount: b.amount,
          dueDate: b.dueDate,
          status: b.status,
        })),
            debts: data.debts.map((d) => ({
              id: d.id,
              creditorName: d.creditorName,
              outstandingAmount: d.outstandingAmount,
              nextDueDate: d.nextDueDate ?? null,
              status: d.status,
            })),
      });
    })(),
    (async (): Promise<LifeCollector> => {
      const base = supabase
        .from("documents")
        .select("id,type,file_name,status,expires_at,company_id,owner_user_id")
        .order("expires_at", { ascending: true });
      const scoped = companyId
        ? base.or(`company_id.eq.${companyId},owner_user_id.eq.${userId}`)
        : base.eq("owner_user_id", userId);
      const { data, error } = await scoped;
      if (error) throw error;
      return new DocumentsLifeCollector({
        documents: (data ?? []).map((r) => ({
          id: String(r.id),
          fileName: String(r.file_name),
          category: r.type ? String(r.type) : "Documento",
          expiresAt: r.expires_at ? String(r.expires_at) : null,
        })),
      });
    })(),
    (async (): Promise<VidaToday> => {
      const [eventsRes, tasksRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id,title,start_time,event_type,location")
          .eq("user_id", userId)
          .eq("is_completed", false)
          .order("start_time", { ascending: true })
          .limit(10),
        supabase
          .from("tasks")
          .select("id,title,status,priority,due_date")
          .eq("assignee_id", userId)
          .not("status", "in", "(DONE,CANCELLED)")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(10),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      return {
        events: (eventsRes.data ?? []).map((r) =>
          toAgendaEvent(r as Record<string, unknown>),
        ),
        tasks: (tasksRes.data ?? []).map((r) => toTask(r as Record<string, unknown>)),
      };
    })(),
    (async (): Promise<LifeCollector> => {
      if (!canFiscal) return fiscalStub();
      // fiscal_obligations: user_id NOT NULL, company_id opcional.
      const obBase = supabase
        .from("fiscal_obligations")
        .select("id,title,category,due_date,status")
        .order("due_date", { ascending: true });
      const obScoped = companyId
        ? obBase.or(`company_id.eq.${companyId},user_id.eq.${userId}`)
        : obBase.eq("user_id", userId);
      // fiscal_inbox_items: organization_id NOT NULL; sem org ativa não há scope.
      const inboxPromise = fiscalOrgId
        ? supabase
            .from("fiscal_inbox_items")
            .select("id,title,status,due_date,entity_type")
            .eq("organization_id", fiscalOrgId)
            .eq("status", "UNREAD")
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null } as const);
      // invoices não tem user_id: sem companyId válido a query NÃO corre (nunca global).
      const invPromise =
        companyId != null
          ? supabase
              .from("invoices")
              .select("id,invoice_number,balance_due,due_date,status")
              .eq("company_id", companyId)
              .in("status", ["ISSUED", "PARTIALLY_PAID"])
              .order("due_date", { ascending: true })
              .limit(20)
          : Promise.resolve({ data: [], error: null } as const);
      const [obRes, inboxRes, invRes] = await Promise.all([
        obScoped,
        inboxPromise,
        invPromise,
      ]);
      if (obRes.error) throw obRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (invRes.error) throw invRes.error;
      return new FiscalLifeCollector({
        obligations: (obRes.data ?? []).map((r) => ({
          id: String(r.id),
          title: String(r.title),
          category: String(r.category),
          dueDate: String(r.due_date),
          status: String(r.status),
        })),
        inboxItems: (inboxRes.data ?? []).map((r) => ({
          id: String(r.id),
          title: String(r.title),
          status: String(r.status),
          dueDate: r.due_date ? String(r.due_date) : null,
          entityType: r.entity_type ? String(r.entity_type) : undefined,
        })),
        invoices: (invRes.data ?? []).map((r) => ({
          id: String(r.id),
          invoiceNumber: String(r.invoice_number),
          balanceDue: Number(r.balance_due ?? 0),
          dueDate: String(r.due_date),
          status: String(r.status),
        })),
      });
    })(),
  ]);

  const collectors: LifeCollector[] = [
    financeSettled.status === "fulfilled"
      ? financeSettled.value
      : failedCollector("finance"),
    docsSettled.status === "fulfilled" ? docsSettled.value : failedCollector("documents"),
    new MobilityLifeCollector(),
    healthStub(),
    fiscalSettled.status === "fulfilled" ? fiscalSettled.value : failedCollector("fiscal"),
    governmentStub(),
    socialSecurityStub(),
  ];

  const result = await aggregateLife(collectors);

  const today: VidaToday =
    agendaSettled.status === "fulfilled"
      ? agendaSettled.value
      : { events: [], tasks: [] };

  // Nome real apenas se existir no contexto de sessão.
  const rawName = session.user?.name?.trim();
  const name =
    rawName && rawName !== "Utilizador" && !rawName.includes("@") ? rawName : null;

  return {
    name,
    result,
    today,
    todayError: agendaSettled.status === "rejected",
  };
}
