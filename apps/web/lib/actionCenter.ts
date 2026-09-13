/**
 * RPG-OS — Action Center: agrega alertas acionáveis do utilizador.
 * Nunca inventa dados — só reporta o que existe na base de dados.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { companyUserOrFilter } from "@rpg/core";
import type { SessionContext } from "@rpg/core";

export interface ActionAlert {
  id: string;
  severity: "URGENT" | "WARNING" | "INFO" | "SUCCESS";
  title: string;
  detail?: string;
  href: string;
}

export async function collectActionAlerts(
  ctx: SessionContext,
  /**
   * company_id do perfil (eixo company). Vem de getCurrentUser(), nunca do
   * browser. Sem ele, só dados do próprio utilizador (fail-closed).
   * NUNCA passar aqui UUID de organização: company_id !== organization_id.
   */
  companyId?: string | null,
): Promise<ActionAlert[]> {
  const supabase = createAdminClient();
  const userId = ctx.user.id;
  const alerts: ActionAlert[] = [];

  const [overdueTasks, pendingApprovals, unreadNotifs, upcomingEvents] =
    await Promise.all([
      // Tarefas atrasadas atribuídas ao utilizador
      supabase
        .from("tasks")
        .select("id, title, due_date, priority")
        .eq("assignee_id", userId)
        .not("status", "in", "(DONE,CANCELLED)")
        .lt("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(5),
      // Aprovações pendentes para o utilizador
      supabase
        .from("workflow_instances")
        .select("id, entity_type, entity_id, created_at")
        .eq("approver_id", userId)
        .eq("status", "PENDING")
        .limit(5),
      // Notificações urgentes não lidas
      supabase
        .from("notifications")
        .select("id, title, link, category")
        .eq("user_id", userId)
        .is("read_at", null)
        .in("category", ["URGENT", "SECURITY"])
        .limit(5),
      // Eventos nas próximas 24h
      supabase
        .from("calendar_events")
        .select("id, title, start_time")
        .eq("user_id", userId)
        .eq("is_completed", false)
        .gte("start_time", new Date().toISOString())
        .lte("start_time", new Date(Date.now() + 24 * 3600_000).toISOString())
        .order("start_time", { ascending: true })
        .limit(3),
    ]);

  for (const t of overdueTasks.data ?? []) {
    alerts.push({
      id: `task-${t.id}`,
      severity: t.priority === "URGENT" ? "URGENT" : "WARNING",
      title: "Tarefa atrasada",
      detail: t.title,
      href: "/tarefas",
    });
  }

  for (const w of pendingApprovals.data ?? []) {
    alerts.push({
      id: `wf-${w.id}`,
      severity: "INFO",
      title: "Pedido à sua espera de aprovação",
      detail: w.entity_type,
      href: "/aprovacoes",
    });
  }

  for (const n of unreadNotifs.data ?? []) {
    alerts.push({
      id: `notif-${n.id}`,
      severity: n.category === "SECURITY" ? "URGENT" : "WARNING",
      title: n.title,
      href: n.link || "/notificacoes",
    });
  }

  for (const e of upcomingEvents.data ?? []) {
    alerts.push({
      id: `event-${e.id}`,
      severity: "INFO",
      title: "Compromisso nas próximas 24 horas",
      detail: `${e.title} • ${new Date(e.start_time).toLocaleString("pt-PT")}`,
      href: "/agenda",
    });
  }

  // Alertas financeiros: tabelas do eixo company/user (finance_bills,
  // documents). Scope correto: company_id do perfil + user_id da sessão.
  // Sem companyId, apenas dados do próprio utilizador (fail-closed).
  {
    const now = new Date();
    const scopedBills = () => {
      const base = supabase
        .from("finance_bills")
        .select("id, name, amount, due_date");
      if (!companyId) return base.eq("user_id", userId);
      return base.or(
        companyUserOrFilter({ companyId, userId }) ?? `user_id.eq.${userId}`,
      );
    };
    const scopedDocs = () => {
      const base = supabase.from("documents").select("id, file_name, expires_at");
      if (!companyId) return base.eq("owner_user_id", userId);
      return base.or(
        companyUserOrFilter({ companyId, userId, userColumn: "owner_user_id" }) ??
          `owner_user_id.eq.${userId}`,
      );
    };
    const [overdueBillsRes, dueSoonBillsRes, expiringDocsRes] = await Promise.all([
      scopedBills()
        .neq("status", "PAID")
        .lt("due_date", now.toISOString())
        .order("due_date", { ascending: true })
        .limit(3),
      scopedBills()
        .neq("status", "PAID")
        .gte("due_date", now.toISOString())
        .lte("due_date", new Date(now.getTime() + 7 * 86400_000).toISOString())
        .order("due_date", { ascending: true })
        .limit(3),
      scopedDocs()
        .not("status", "eq", "EXPIRED")
        .not("expires_at", "is", null)
        .gte("expires_at", now.toISOString())
        .lte("expires_at", new Date(now.getTime() + 14 * 86400_000).toISOString())
        .order("expires_at", { ascending: true })
        .limit(3),
    ]);

    for (const b of overdueBillsRes.data ?? []) {
      alerts.push({
        id: `bill-overdue-${b.id}`,
        severity: "URGENT",
        title: "Conta vencida",
        detail: `${b.name} — ${Number(b.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €`,
        href: "/financas",
      });
    }

    for (const b of dueSoonBillsRes.data ?? []) {
      alerts.push({
        id: `bill-soon-${b.id}`,
        severity: "INFO",
        title: "Conta a vencer em breve",
        detail: `${b.name} — ${Number(b.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} € • ${new Date(b.due_date).toLocaleDateString("pt-PT")}`,
        href: "/financas",
      });
    }

    for (const d of expiringDocsRes.data ?? []) {
      alerts.push({
        id: `doc-expiring-${d.id}`,
        severity: "WARNING",
        title: "Documento a expirar",
        detail: `${d.file_name} • expira a ${new Date(d.expires_at).toLocaleDateString("pt-PT")}`,
        href: "/documentos",
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Briefing contextual (§38): fact / inference / recommendation por item.
// Função pura — apenas re-formata o que o collectActionAlerts já buscou.
// Nunca inventa dados: fact usa título/detalhe verificados; inference é leitura
// probabilística claramente rotulada; recommendation é UMA ação imperativa.
// ---------------------------------------------------------------------------

export interface BriefingLine {
  id: string;
  href: string;
  severity: ActionAlert["severity"];
  fact: string;
  inference?: string;
  recommendation?: string;
}

/**
 * Converte alertas do Action Center em linhas de briefing estruturadas.
 * `inference` só existe quando há base factual para a leitura (itens INFO de
 * compromissos/notificações ficam sem inference — não se especula à toa).
 */
export function composeBriefingLines(items: ActionAlert[]): BriefingLine[] {
  return items.map((a) => {
    const kind = a.id.split("-")[0] ?? "";
    switch (kind) {
      case "task": {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: `A tarefa "${a.detail ?? a.title}" está atrasada.`,
          inference: "Inferência: se não for resolvida hoje, pode bloquear o que se segue.",
          recommendation:
            a.severity === "URGENT"
              ? "Trate esta tarefa primeiro: conclua-a ou reagende-a."
              : "Conclua ou reagende a tarefa ainda hoje.",
        };
      }
      case "wf": {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: `Pedido de aprovação (${a.detail ?? "sem tipo"}) aguarda a sua decisão.`,
          recommendation: "Aprove ou rejeite o pedido em aberto.",
        };
      }
      case "notif": {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: `Notificação não lida: ${a.title}.`,
          recommendation:
            a.severity === "URGENT"
              ? "Abra a notificação agora e resolva o que estiver pendente."
              : "Abra a notificação e veja o que requer atenção.",
        };
      }
      case "event": {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: `Compromisso marcado: ${a.detail ?? a.title}.`,
          recommendation: "Confirme o seu horário e prepare-se para o compromisso.",
        };
      }
      case "bill": {
        const overdue = a.id.includes("overdue");
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: overdue
            ? `Conta vencida: ${a.detail ?? a.title}.`
            : `Conta a vencer em breve: ${a.detail ?? a.title}.`,
          inference: overdue
            ? "Inferência: o atraso no pagamento pode gerar juros ou interrupção do serviço."
            : undefined,
          recommendation: overdue
            ? "Regularize o pagamento ou contacte o fornecedor hoje."
            : "Agende o pagamento antes do vencimento.",
        };
      }
      case "doc": {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: `Documento a expirar: ${a.detail ?? a.title}.`,
          inference: "Inferência: a expiração pode bloquear processos de faturação.",
          recommendation: "Renove ou atualize o documento antes do prazo.",
        };
      }
      default: {
        return {
          id: a.id,
          href: a.href,
          severity: a.severity,
          fact: a.title,
        };
      }
    }
  });
}
