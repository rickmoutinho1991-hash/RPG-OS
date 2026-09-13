/**
 * RPG-OS — Command Center: determina o "modo" do utilizador,
 * as secções relevantes para a homepage e os KPIs cross-module.
 */
import type { SessionContext } from "@rpg/core";
import { companyUserOrFilter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type CommandCenterMode =
  | "INDIVIDUAL"
  | "PROFESSIONAL"
  | "MANAGER"
  | "EXECUTIVE"
  | "ACCOUNTANT"
  | "EMPLOYEE";

export interface CommandCenterSection {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
}

/** Determina o modo de operação a partir das permissões efetivas. */
export function resolveMode(ctx: SessionContext): CommandCenterMode {
  const p = ctx.permissions;
  if (!ctx.organization) return "INDIVIDUAL";
  if (p.includes("*")) return "EXECUTIVE";
  if (p.includes("contabilidade.manage") || p.includes("fiscal.admin"))
    return "ACCOUNTANT";
  if (p.includes("pessoas.manage") || p.includes("roles.manage"))
    return "EXECUTIVE";
  if (p.includes("tarefas.manage") || p.includes("obras.manage"))
    return "MANAGER";
  if (
    p.includes("clientes.manage") ||
    p.includes("orcamentos.manage") ||
    p.includes("faturacao.view")
  )
    return "PROFESSIONAL";
  return "EMPLOYEE";
}

const MODE_HEADLINES: Record<CommandCenterMode, string> = {
  INDIVIDUAL: "O seu dia, organizado.",
  PROFESSIONAL: "O seu trabalho de hoje, num só lugar.",
  MANAGER: "A equipa e os projetos, sob controlo.",
  EXECUTIVE: "A empresa em cima do seu desk.",
  ACCOUNTANT: "Documentos, IVA e obrigações em dia.",
  EMPLOYEE: "As suas tarefas e avisos de hoje.",
};

export function getHeadline(mode: CommandCenterMode): string {
  return MODE_HEADLINES[mode];
}

export interface QuickAction {
  label: string;
  href: string;
  permission?: string;
  icon: string;
}

export function getQuickActions(ctx: SessionContext): QuickAction[] {
  const has = (perm?: string) =>
    !perm || ctx.permissions.includes("*") || ctx.permissions.includes(perm);
  const inOrg = Boolean(ctx.organization);

  const actions: QuickAction[] = [
    { label: "Nova tarefa", href: "/tarefas?novo=1", icon: "✓" },
    { label: "Novo evento", href: "/agenda", icon: "📅" },
    { label: "Perguntar à IA", href: "/ia", icon: "🤖" },
    {
      label: "Nova mensagem",
      href: "/comunicacao",
      permission: "comunicacao.view",
      icon: "💬",
    },
    {
      label: "Novo cliente",
      href: "/registo/cliente",
      permission: "clientes.manage",
      icon: "👤",
    },
    {
      label: "Novo orçamento",
      href: "/orcamentos/novo",
      permission: "orcamentos.manage",
      icon: "📄",
    },
    {
      label: "Nova fatura",
      href: "/faturacao/nova",
      permission: "faturacao.manage",
      icon: "🧾",
    },
    {
      label: "Nova obra",
      href: "/obras/nova",
      permission: "obras.manage",
      icon: "🔨",
    },
  ];

  return actions.filter((a) =>
    inOrg
      ? has(a.permission)
      : ["Nova tarefa", "Novo evento", "Perguntar à IA"].includes(a.label),
  );
}

// ---------------------------------------------------------------------------
// KPIs cross-module para o dashboard executivo
// ---------------------------------------------------------------------------

export interface CommandCenterKPI {
  id: string;
  icon: string;
  value: number | string;
  label: string;
  href: string;
  severity: "normal" | "warning" | "critical";
}

function formatEuro(n: number): string {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** KPIs cross-module: finanças, reputação, documentos, aprovações. Sem dados sintéticos. */
export async function collectCommandCenterKPIs(
  ctx: SessionContext,
  /**
   * company_id do perfil (eixo company). Vem de getCurrentUser(), nunca do
   * browser. NUNCA passar aqui UUID de organização.
   */
  companyId?: string | null,
): Promise<CommandCenterKPI[]> {
  const supabase = createAdminClient();
  const userId = ctx.user.id;
  const orgId = ctx.organization?.id;

  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 86400_000);

  // Tabelas do eixo company/user: scope = company_id do perfil + user_id.
  // Sem companyId, apenas dados do próprio utilizador (fail-closed).
  const scopedBills = () => {
    const base = supabase.from("finance_bills").select("id,status,due_date,amount");
    if (!companyId) return base.eq("user_id", userId);
    return base.or(
      companyUserOrFilter({ companyId, userId }) ?? `user_id.eq.${userId}`,
    );
  };
  const scopedDocs = () => {
    const base = supabase.from("documents").select("id,expires_at,status");
    if (!companyId) return base.eq("owner_user_id", userId);
    return base.or(
      companyUserOrFilter({ companyId, userId, userColumn: "owner_user_id" }) ??
        `owner_user_id.eq.${userId}`,
    );
  };
  const scopedBalance = () => {
    const base = supabase.from("bank_accounts").select("balance");
    if (!companyId) return base.eq("user_id", userId);
    return base.or(
      companyUserOrFilter({ companyId, userId }) ?? `user_id.eq.${userId}`,
    );
  };

  const billsQuery = scopedBills().neq("status", "PAID");

  const docsQuery = scopedDocs();

  const complaintsQuery =
    orgId
      ? supabase
          .from("reputation_reviews")
          .select("id")
          .eq("organization_id", orgId)
          .eq("entry_type", "COMPLAINT")
          .in("status", ["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"])
      : supabase
          .from("reputation_reviews")
          .select("id")
          .eq("author_user_id", userId)
          .eq("entry_type", "COMPLAINT")
          .in("status", ["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"]);

  const approvalsQuery =
    orgId
      ? supabase
          .from("workflow_instances")
          .select("id")
          .eq("organization_id", orgId)
          .eq("status", "PENDING")
      : supabase
          .from("workflow_instances")
          .select("id")
          .or(`requested_by.eq.${userId},approver_id.eq.${userId}`)
          .eq("status", "PENDING");

  const balanceQuery = scopedBalance();

  const ratingQuery =
    orgId
      ? supabase
          .from("reputation_reviews")
          .select("rating")
          .eq("organization_id", orgId)
          .not("rating", "is", null)
      : supabase
          .from("reputation_reviews")
          .select("rating")
          .eq("author_user_id", userId)
          .not("rating", "is", null);

  const [billsRes, docsRes, complaintsRes, approvalsRes, balanceRes, ratingRes] =
    await Promise.all([
      billsQuery,
      docsQuery,
      complaintsQuery,
      approvalsQuery,
      balanceQuery,
      ratingQuery,
    ]);

  const bills = (billsRes.data ?? []) as { due_date: string; amount: number | string }[];
  const overdueBills = bills.filter((b) => new Date(b.due_date) < now).length;
  const dueSoonBills = bills.filter((b) => {
    const d = new Date(b.due_date);
    return d >= now && d <= in14d;
  }).length;

  const docs = (docsRes.data ?? []) as { expires_at: string | null; status: string }[];
  const expiringDocs = docs.filter((d) => {
    if (d.status === "EXPIRED" || !d.expires_at) return false;
    const exp = new Date(d.expires_at);
    return exp >= now && exp <= in14d;
  }).length;

  const complaintsCount = (complaintsRes.data ?? []).length;
  const approvalsCount = (approvalsRes.data ?? []).length;

  const balance =
    ((balanceRes.data ?? []) as { balance?: number | string }[]).reduce(
      (sum, a) => sum + Number(a.balance ?? 0),
      0,
    ) || 0;

  const ratings = (ratingRes.data ?? []) as { rating?: number }[];
  const avgRating =
    ratings.length > 0
      ? (
          ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length
        ).toFixed(1)
      : null;

  return [
    {
      id: "balance",
      icon: "💰",
      value: formatEuro(balance),
      label: "Saldo",
      href: "/financas",
      severity: balance < 0 ? "critical" : "normal",
    },
    {
      id: "overdue-bills",
      icon: "🔴",
      value: overdueBills,
      label: "Contas vencidas",
      href: "/financas",
      severity: overdueBills > 0 ? "critical" : "normal",
    },
    {
      id: "due-soon-bills",
      icon: "📅",
      value: dueSoonBills,
      label: "Contas a vencer",
      href: "/financas",
      severity: "normal",
    },
    {
      id: "approvals",
      icon: "⏳",
      value: approvalsCount,
      label: "Aprovações pendentes",
      href: "/aprovacoes",
      severity: approvalsCount > 0 ? "warning" : "normal",
    },
    {
      id: "complaints",
      icon: "💬",
      value: complaintsCount,
      label: "Reclamações abertas",
      href: "/reputacao/reclamacoes",
      severity: complaintsCount > 0 ? "warning" : "normal",
    },
    {
      id: "docs-expiring",
      icon: "📄",
      value: expiringDocs,
      label: "Docs a expirar",
      href: "/documentos",
      severity: expiringDocs > 0 ? "warning" : "normal",
    },
    {
      id: "rating",
      icon: "⭐",
      value: avgRating ?? "—",
      label: "Reputação",
      href: "/reputacao/metricas",
      severity: "normal",
    },
  ];
}
