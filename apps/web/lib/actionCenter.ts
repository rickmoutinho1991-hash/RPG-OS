/**
 * RPG-OS — Action Center: agrega alertas acionáveis do utilizador.
 * Nunca inventa dados — só reporta o que existe na base de dados.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MemoryService,
  companyUserOrFilter,
  type SessionContext,
  type UserMemory,
} from "@rpg/core";
import { SupabaseMemoryStore } from "@/lib/memory/supabaseStore";

export interface ActionAlert {
  id: string;
  severity: "URGENT" | "WARNING" | "INFO" | "SUCCESS";
  title: string;
  detail?: string;
  href: string;
  category: string;
}

/** Executa uma query de domínio com fail-safe: erro → [] (zero itens). */
export async function safeDomainQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return (await fn()) ?? [];
  } catch {
    return [];
  }
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

  // Fail-safe por domínio: um serviço em erro contribui zero itens e o
  // briefing nunca cai. Cada bloco reutiliza APENAS queries existentes.

  // 1. Tarefas atrasadas → tarefas (não silenciável)
  {
    const tasks = await safeDomainQuery(async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority")
        .eq("assignee_id", userId)
        .not("status", "in", "(DONE,CANCELLED)")
        .lt("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(5);
      return data ?? [];
    });

    for (const t of tasks) {
      alerts.push({
        id: `task-${t.id}`,
        severity: t.priority === "URGENT" ? "URGENT" : "WARNING",
        title: "Tarefa atrasada",
        detail: t.title,
        href: "/tarefas",
        category: "tarefas",
      });
    }
  }

  // 2. Aprovações pendentes → aprovacoes
  {
    const approvals = await safeDomainQuery(async () => {
      const { data } = await supabase
        .from("workflow_instances")
        .select("id, entity_type, entity_id, created_at")
        .eq("approver_id", userId)
        .eq("status", "PENDING")
        .limit(5);
      return data ?? [];
    });

    for (const w of approvals) {
      alerts.push({
        id: `wf-${w.id}`,
        severity: "INFO",
        title: "Pedido à sua espera de aprovação",
        detail: w.entity_type,
        href: "/aprovacoes",
        category: "aprovacoes",
      });
    }
  }

  // 3. Notificações urgentes não lidas → notificacoes (não silenciável)
  {
    const notifs = await safeDomainQuery(async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, link, category")
        .eq("user_id", userId)
        .is("read_at", null)
        .in("category", ["URGENT", "SECURITY"])
        .limit(5);
      return data ?? [];
    });

    for (const n of notifs) {
      alerts.push({
        id: `notif-${n.id}`,
        severity: n.category === "SECURITY" ? "URGENT" : "WARNING",
        title: n.title,
        href: n.link || "/notificacoes",
        category: "notificacoes",
      });
    }
  }

  // 4. Eventos nas próximas 24h → agenda (não silenciável)
  {
    const events = await safeDomainQuery(async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, start_time")
        .eq("user_id", userId)
        .eq("is_completed", false)
        .gte("start_time", new Date().toISOString())
        .lte("start_time", new Date(Date.now() + 24 * 3600_000).toISOString())
        .order("start_time", { ascending: true })
        .limit(3);
      return data ?? [];
    });

    for (const e of events) {
      alerts.push({
        id: `event-${e.id}`,
        severity: "INFO",
        title: "Compromisso nas próximas 24 horas",
        detail: `${e.title} • ${new Date(e.start_time).toLocaleString("pt-PT")}`,
        href: "/agenda",
        category: "agenda",
      });
    }
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

    // 5. Contas vencidas/a vencer → finance
    {
      const [overdueBills, dueSoonBills] = await Promise.all([
        safeDomainQuery(async () => {
          const { data } = await scopedBills()
            .neq("status", "PAID")
            .lt("due_date", now.toISOString())
            .order("due_date", { ascending: true })
            .limit(3);
          return data ?? [];
        }),
        safeDomainQuery(async () => {
          const { data } = await scopedBills()
            .neq("status", "PAID")
            .gte("due_date", now.toISOString())
            .lte(
              "due_date",
              new Date(now.getTime() + 7 * 86400_000).toISOString(),
            )
            .order("due_date", { ascending: true })
            .limit(3);
          return data ?? [];
        }),
      ]);

      for (const b of overdueBills) {
        alerts.push({
          id: `bill-overdue-${b.id}`,
          severity: "URGENT",
          title: "Conta vencida",
          detail: `${b.name} — ${Number(b.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €`,
          href: "/financas",
          category: "finance",
        });
      }

      for (const b of dueSoonBills) {
        alerts.push({
          id: `bill-soon-${b.id}`,
          severity: "INFO",
          title: "Conta a vencer em breve",
          detail: `${b.name} — ${Number(b.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} € • ${new Date(b.due_date).toLocaleDateString("pt-PT")}`,
          href: "/financas",
          category: "finance",
        });
      }
    }

    // 6. Documentos a expirar → docs
    {
      const docs = await safeDomainQuery(async () => {
        const { data } = await scopedDocs()
          .not("status", "eq", "EXPIRED")
          .not("expires_at", "is", null)
          .gte("expires_at", now.toISOString())
          .lte(
            "expires_at",
            new Date(now.getTime() + 14 * 86400_000).toISOString(),
          )
          .order("expires_at", { ascending: true })
          .limit(3);
        return data ?? [];
      });

      for (const d of docs) {
        alerts.push({
          id: `doc-expiring-${d.id}`,
          severity: "WARNING",
          title: "Documento a expirar",
          detail: `${d.file_name} • expira a ${new Date(d.expires_at).toLocaleDateString("pt-PT")}`,
          href: "/documentos",
          category: "docs",
        });
      }
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
  category: string;
  href: string;
  severity: ActionAlert["severity"];
  fact: string;
  inference?: string;
  recommendation?: string;
}

/**
 * Resultado do briefing: as linhas visíveis + resumo de inferência.
 * `summary` só existe quando o utilizador silenciou categorias na memória e
 * esse silêncio efetivamente ocultou itens do briefing (nunca se inventa).
 */
export interface BriefingReport {
  lines: BriefingLine[];
  summary?: string;
}

/**
 * Converte alertas do Action Center em linhas de briefing estruturadas.
 * `inference` só existe quando há base factual para a leitura (itens INFO de
 * compromissos/notificações ficam sem inference — não se especula à toa).
 *
 * `mutedCategories`: categorias que o utilizador silenciou na memória.
 * Quando pelo menos um item é ocultado, `summary` informa quantas categorias
 * foram silenciadas.
 */
export function composeBriefingLines(
  items: ActionAlert[],
  opts?: { mutedCategories?: string[] },
): BriefingReport {
  const muted = new Set(opts?.mutedCategories ?? []);
  const visible = items.filter((a) => !muted.has(alertCategory(a)));
  const lines = visible.map(composeBriefingLine);
  const silencedCategories = new Set(
    items
      .filter((a) => muted.has(alertCategory(a)))
      .map((a) => alertCategory(a)),
  );
  const summary =
    silencedCategories.size > 0
      ? `Segundo a tua memória: ${silencedCategories.size} ${
          silencedCategories.size === 1 ? "categoria" : "categorias"
        } silenciada${silencedCategories.size === 1 ? "" : "s"}.`
      : undefined;
  return { lines, summary };
}

/** Categoria efetiva de um alerta: usa a explícita ou deriva do prefixo do id. */
export function alertCategory(a: ActionAlert): string {
  return a.category ?? kindOf(a.id);
}

function kindOf(id: string): string {
  return id.split("-")[0] ?? "";
}

function composeBriefingLine(a: ActionAlert): BriefingLine {
  const kind = kindOf(a.id);
  const base = {
    id: a.id,
    category: alertCategory(a),
    href: a.href,
    severity: a.severity,
  };
  switch (kind) {
    case "task": {
      return {
        ...base,
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
        ...base,
        fact: `Pedido de aprovação (${a.detail ?? "sem tipo"}) aguarda a sua decisão.`,
        recommendation: "Aprove ou rejeite o pedido em aberto.",
      };
    }
    case "notif": {
      return {
        ...base,
        fact: `Notificação não lida: ${a.title}.`,
        recommendation:
          a.severity === "URGENT"
            ? "Abra a notificação agora e resolva o que estiver pendente."
            : "Abra a notificação e veja o que requer atenção.",
      };
    }
    case "event": {
      return {
        ...base,
        fact: `Compromisso marcado: ${a.detail ?? a.title}.`,
        recommendation: "Confirme o seu horário e prepare-se para o compromisso.",
      };
    }
    case "bill": {
      const overdue = a.id.includes("overdue");
      return {
        ...base,
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
        ...base,
        fact: `Documento a expirar: ${a.detail ?? a.title}.`,
        inference: "Inferência: a expiração pode bloquear processos de faturação.",
        recommendation: "Renove ou atualize o documento antes do prazo.",
      };
    }
    default: {
      return {
        ...base,
        fact: a.title,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Memória (briefing × memória): leitura fail-safe das categorias silenciadas.
// Uma única query no máximo; qualquer erro → sem filtro → briefing normal.
// ---------------------------------------------------------------------------

/**
 * Extrai as categorias silenciadas de uma memória de preferência
 * (kind="preference", key="muted_categories"). Função pura e fail-safe:
 * memória ausente/inválida → lista vazia (sem filtro).
 */
export function resolveMutedCategories(memories: UserMemory[]): string[] {
  const pref = memories.find(
    (m) => m.kind === "preference" && m.key === "muted_categories",
  );
  const raw = pref?.value?.categories ?? pref?.value?.items;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is string => typeof c === "string");
}

/**
 * Preferências de silêncio do utilizador. Fail-safe em todos os caminhos:
 * sem sessão/sem memórias → sem filtro; erro do store → sem filtro, o briefing
 * nunca cai. `service` só é injetado em testes.
 */
export async function loadMutedCategories(
  ctx: SessionContext,
  service?: MemoryService,
): Promise<string[]> {
  try {
    const memoryService =
      service ?? new MemoryService(new SupabaseMemoryStore());
    const memories = await memoryService.get(ctx.user.id);
    return resolveMutedCategories(memories);
  } catch {
    return [];
  }
}
