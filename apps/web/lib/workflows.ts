/**
 * RPG-OS — Motor de Workflows / Aprovações (lado servidor).
 * Cria pedidos de aprovação, notifica os aprovadores e agrega as listas
 * do Centro de Aprovações. Todas as mutações são auditadas.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import {
  sanitizeAuditMetadata,
  getExecutionInitialStep,
  resolveEffectivePermissions,
  resolveEligibleApproverIds,
  hasPermission,
  isUniqueViolation,
} from "@rpg/core";

export type WorkflowEntityType =
  | "DOCUMENT"
  | "INVOICE"
  | "QUOTE"
  | "PROJECT"
  | "EXPENSE"
  | "TASK"
  | "MEMBER"
  | "PLATFORM_FEE_CONFIG"
  | "MARKETING_CONFIG"
  | "OTHER";

export type WorkflowRowStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export interface WorkflowApprovalItem {
  id: string;
  organizationId?: string | null;
  entityType: string;
  entityId: string;
  title: string;
  summary?: string | null;
  currentStep: string;
  status: WorkflowRowStatus;
  /** ID da definição de workflow (metadata), se o fluxo tiver definição. */
  definitionId?: string | null;
  requestedById?: string | null;
  requestedByName: string;
  approverId?: string | null;
  approverName: string;
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface WorkflowOverview {
  pendingForMe: WorkflowApprovalItem[];
  myPending: WorkflowApprovalItem[];
  recent: WorkflowApprovalItem[];
}

export const WORKFLOW_ENTITY_LABELS: Record<string, string> = {
  DOCUMENT: "Documento",
  INVOICE: "Fatura",
  QUOTE: "Orçamento",
  PROJECT: "Obra / Projeto",
  EXPENSE: "Despesa",
  TASK: "Tarefa",
  MEMBER: "Membro",
  PLATFORM_FEE_CONFIG: "Taxa RPG-OS",
  MARKETING_CONFIG: "Config Marketing AI",
  OTHER: "Registo",
};

/** Cria uma instância de workflow, notifica o aprovador e audita. */
export async function startApproval(input: {
  title: string;
  summary?: string;
  entityType: WorkflowEntityType;
  entityId: string;
  organizationId?: string | null;
  requestedBy: string;
  approverId?: string | null;
  currentStep?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; instanceId?: string }> {
  if (!input.entityId || !input.title.trim()) {
    return { success: false, error: "Título e entidade são obrigatórios." };
  }

  const supabase = createAdminClient();

  // Idempotência: não duplicar pedidos PENDING para a mesma entidade/aprovador.
  let dupQuery = supabase
    .from("workflow_instances")
    .select("id")
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .eq("status", "PENDING");
  if (input.approverId) dupQuery = dupQuery.eq("approver_id", input.approverId);
  const { data: duplicates } = await dupQuery.limit(1).maybeSingle();
  if (duplicates?.id) {
    return { success: true, instanceId: duplicates.id as string };
  }

  // Resolver definição ativa: primeiro passo e relação na metadata, sem
  // quebrar fluxos sem definição (fallback ao comportamento atual).
  const workflowInit = await resolveDefinitionInit(
    supabase,
    input.organizationId ?? null,
    String(input.entityType),
    input.currentStep,
    input.metadata ?? {},
  );

  const { data, error } = await supabase
    .from("workflow_instances")
    .insert({
      organization_id: input.organizationId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      current_step: workflowInit.currentStep ?? "SUBMITTED",
      status: "PENDING",
      requested_by: input.requestedBy,
      approver_id: input.approverId ?? null,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      metadata: workflowInit.metadata,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Corrida real entre duas chamadas simultâneas: o índice parcial único
    // uq_workflow_one_pending_per_entity (migration 20260821200000) rejeita
    // o segundo INSERT. Tratamos como idempotente: devolvemos a instância
    // PENDING vencedora em vez de um erro genérico.
    if (isUniqueViolation(error)) {
      const { data: winner } = await supabase
        .from("workflow_instances")
        .select("id")
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId)
        .eq("status", "PENDING")
        .limit(1)
        .maybeSingle();
      if (winner?.id) {
        return { success: true, instanceId: winner.id as string };
      }
    }
    return { success: false, error: error?.message || "Erro ao criar o pedido." };
  }

  if (input.approverId) {
    await notifyUser(input.approverId, `Novo pedido de aprovação: ${input.title}`, {
      body: input.summary?.trim() || "Aguarda a sua decisão no Centro de Aprovações.",
      link: "/aprovacoes",
      category: "APPROVAL",
    });
  }

  await supabase.from("audit_logs").insert({
    user_id: input.requestedBy,
    action: "APPROVAL_REQUESTED",
    module: "WORKFLOWS",
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: sanitizeAuditMetadata({
      workflowInstanceId: data.id,
      approverId: input.approverId,
      title: input.title,
    }),
  });

  return { success: true, instanceId: data.id };
}
/** Agrega as listas do Centro de Aprovações para o utilizador. */
export async function getWorkflowOverview(
  userId: string,
  organizationId?: string | null,
): Promise<WorkflowOverview> {
  const supabase = createAdminClient();

  const [forMeRes, mineRes, recentRes] = await Promise.all([
    supabase
      .from("workflow_instances")
      .select("*")
      .eq("approver_id", userId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("workflow_instances")
      .select("*")
      .eq("requested_by", userId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("workflow_instances")
      .select("*")
      .or(`requested_by.eq.${userId},approver_id.eq.${userId}`)
      .in("status", ["APPROVED", "REJECTED", "CANCELLED"])
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const rows = [
    ...(forMeRes.data ?? []),
    ...(mineRes.data ?? []),
    ...(recentRes.data ?? []),
  ];

  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.requested_by, r.approver_id])
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const names = await resolveUserNames(userIds);

  const displayName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return names.get(id)?.name ?? "Utilizador";
  };

  const toItem = (r: (typeof rows)[number]): WorkflowApprovalItem => ({
    id: String(r.id),
    organizationId: (r.organization_id as string | null) ?? undefined,
    entityType: String(r.entity_type ?? "OTHER"),
    entityId: String(r.entity_id),
    title: String(r.title ?? r.entity_type ?? "Pedido de aprovação"),
    summary: (r.summary as string | null) ?? undefined,
    currentStep: String(r.current_step ?? "SUBMITTED"),
    status: (r.status as WorkflowRowStatus) ?? "PENDING",
    definitionId:
      typeof (r.metadata as Record<string, unknown> | null)?.definitionId ===
      "string"
        ? ((r.metadata as Record<string, unknown>).definitionId as string)
        : undefined,
    requestedById: (r.requested_by as string | null) ?? undefined,
    requestedByName: displayName(r.requested_by as string | null),
    approverId: (r.approver_id as string | null) ?? undefined,
    approverName: displayName(r.approver_id as string | null),
    decisionNote: (r.decision_note as string | null) ?? undefined,
    decidedAt: (r.decided_at as string | null) ?? undefined,
    createdAt: String(r.created_at),
  });

  const all = rows.map(toItem);

  void organizationId;

  return {
    pendingForMe: all.filter(
      (r) => r.status === "PENDING" && r.approverId === userId,
    ),
    myPending: all.filter(
      (r) => r.status === "PENDING" && r.requestedById === userId,
    ),
    recent: all.filter((r) => r.status !== "PENDING"),
  };
}

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, { name: string; email?: string }>> {
  const result = new Map<string, { name: string; email?: string }>();
  if (userIds.length === 0) return result;

  const supabase = createAdminClient();
  const [profileRes, userRes] = await Promise.all([
    supabase.from("profiles").select("user_id, name").in("user_id", userIds),
    supabase.from("users").select("id, email").in("id", userIds),
  ]);

  const emails = new Map<string, string>();
  for (const u of userRes.data ?? []) {
    emails.set(String(u.id), String(u.email ?? ""));
  }
  for (const p of profileRes.data ?? []) {
    result.set(String(p.user_id), {
      name: p.name ?? "Utilizador",
      email: emails.get(String(p.user_id)),
    });
  }
  // Fallback: derivar o nome do email quando não existe perfil
  for (const id of userIds) {
    if (!result.has(id)) {
      result.set(id, {
        name: emails.get(id)?.split("@")[0] || "Utilizador",
        email: emails.get(id),
      });
    }
  }
  return result;
}
/** Resolve o revisor/gestor por defeito de uma empresa (para workflows). */
export async function resolveCompanyReviewer(
  companyId: string,
): Promise<string | null> {
  const supabase = createAdminClient();

  // Preferir cargos de gestão/administração
  const { data: reviewer } = await supabase
    .from("company_employees")
    .select("user_id, job_title")
    .eq("company_id", companyId)
    .eq("status", "ACTIVE")
    .or(
      "job_title.ilike.%administrador%,job_title.ilike.%gerente%,job_title.ilike.%diretor%,job_title.ilike.%socio%",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (reviewer) return reviewer.user_id as string;

  // Fallback: qualquer colaborador ativo
  const { data: fallback } = await supabase
    .from("company_employees")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback?.user_id as string | undefined) ?? null;
}
/**
 * Resolve a definição ativa para (organization_id, entity_type) e devolve o
 * passo inicial e metadata de relação. Se não existir definição ativa, mantém
 * o fallback atual (current_step fornecido ou "SUBMITTED").
 */
async function resolveDefinitionInit(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string | null,
  entityType: string,
  currentStep?: string,
  baseMetadata: Record<string, unknown> = {},
): Promise<{ currentStep?: string; metadata: Record<string, unknown> }> {
  if (!organizationId) {
    return { currentStep: currentStep ?? "SUBMITTED", metadata: baseMetadata };
  }

  try {
    const { data: def } = await supabase
      .from("workflow_definitions")
      .select("id, key, entity_type")
      .eq("organization_id", organizationId)
      .eq("entity_type", entityType.toUpperCase())
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!def) {
      return { currentStep: currentStep ?? "SUBMITTED", metadata: baseMetadata };
    }

    const { data: steps } = await supabase
      .from("workflow_steps")
      .select("key, name, position")
      .eq("workflow_definition_id", def.id)
      .order("position", { ascending: true });

    const initial = getExecutionInitialStep(
      (steps ?? []).map((s) => ({
        key: String(s.key),
        position: Number(s.position ?? 0),
      })),
    );

    return {
      currentStep: initial ?? currentStep ?? "SUBMITTED",
      metadata: {
        ...baseMetadata,
        definitionId: def.id,
        definitionKey: def.key,
      },
    };
  } catch {
    return { currentStep: currentStep ?? "SUBMITTED", metadata: baseMetadata };
  }
}
/* ─── Resolução por passo (requiredPermission + responsáveis) ────────── */

export interface LoadedWorkflowDefinition {
  id: string;
  key: string;
  steps: Array<{
    key: string;
    name?: string | null;
    position?: number | null;
    requiredPermission?: string | null;
  }>;
  transitions: Array<{
    fromStep: string;
    toStep: string;
    condition?: Record<string, unknown> | null;
  }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Carrega definição + passos + transições do servidor. O cliente nunca
 * fornece passo, permissão ou transição — tudo deriva desta leitura.
 */
export async function loadWorkflowDefinitionById(
  definitionId: string,
): Promise<LoadedWorkflowDefinition | null> {
  if (!UUID_RE.test(definitionId)) return null;
  try {
    const supabase = createAdminClient();
    const [{ data: def }, { data: steps }, { data: transitions }] =
      await Promise.all([
        supabase
          .from("workflow_definitions")
          .select("id, key")
          .eq("id", definitionId)
          .maybeSingle(),
        supabase
          .from("workflow_steps")
          .select("key, name, position, required_permission")
          .eq("workflow_definition_id", definitionId),
        supabase
          .from("workflow_transitions")
          .select("from_step, to_step, condition")
          .eq("workflow_definition_id", definitionId),
      ]);
    if (!def) return null;
    return {
      id: String(def.id),
      key: String(def.key ?? ""),
      steps: (steps ?? []).map((s) => ({
        key: String(s.key ?? ""),
        name: (s.name as string | null) ?? null,
        position:
          typeof s.position === "number"
            ? s.position
            : Number(s.position ?? 0),
        requiredPermission:
          ((s.required_permission as string | null) || "") || null,
      })),
      transitions: (transitions ?? []).map((t) => ({
        fromStep: String(t.from_step ?? ""),
        toStep: String(t.to_step ?? ""),
        condition: (t.condition as Record<string, unknown> | null) ?? null,
      })),
    };
  } catch {
    return null;
  }
}

interface OrgRbacSnapshot {
  memberships: Array<Record<string, unknown>>;
  customRoles: Array<Record<string, unknown>>;
}

/** Lê memberships ACTIVE e cargos custom da organização (uma query dupla). */
async function fetchOrgRbac(
  organizationId: string,
): Promise<OrgRbacSnapshot | null> {
  if (!UUID_RE.test(organizationId)) return null;
  const supabase = createAdminClient();
  const [{ data: memberships }, { data: customRoles }] = await Promise.all([
    supabase
      .from("org_memberships")
      .select(
        "id, user_id, role_key, custom_role_id, status, is_primary, permissions_override, valid_from, valid_until",
      )
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE"),
    supabase
      .from("custom_roles")
      .select("id, organization_id, key, label, permissions, scope")
      .eq("organization_id", organizationId),
  ]);
  return { memberships: memberships ?? [], customRoles: customRoles ?? [] };
}

function mapMemberships(
  rows: Array<Record<string, unknown>>,
  organizationId: string,
) {
  return rows.map((m) => ({
    id: String(m.id ?? ""),
    organizationId,
    userId: String(m.user_id ?? ""),
    roleKey: ((m.role_key as string) || "EMPLOYEE"),
    customRoleId: (m.custom_role_id as string | null) ?? undefined,
    status: ((m.status as string) || "ACTIVE") as
      | "ACTIVE"
      | "INVITED"
      | "SUSPENDED"
      | "REMOVED",
    isPrimary: m.is_primary === true,
    permissionsOverride: (m.permissions_override as string[] | null) ?? [],
    validFrom: (m.valid_from as string | null) ?? undefined,
    validUntil: (m.valid_until as string | null) ?? undefined,
  }));
}

function mapCustomRoles(rows: Array<Record<string, unknown>>) {
  return rows.map((cr) => ({
    id: String(cr.id),
    organization_id: String(cr.organization_id),
    key: String(cr.key ?? ""),
    label: String(cr.label ?? ""),
    permissions: (cr.permissions as string[] | null) ?? [],
    scope: (cr.scope as string | null) ?? null,
  }));
}

/**
 * Permissões efetivas do ator **na organização da instância** (não na
 * organização ativa da sessão). Reutiliza o RBAC existente; não-membro → [].
 */
export async function resolveActorPermissionsInOrg(
  organizationId: string | null,
  userId: string,
): Promise<string[]> {
  if (!organizationId || !userId) return [];
  try {
    const snap = await fetchOrgRbac(organizationId);
    if (!snap) return [];
    const row = snap.memberships.find((m) => m.user_id === userId);
    if (!row) return [];
    const resolved = resolveEffectivePermissions(
      mapMemberships([row], organizationId)[0],
      mapCustomRoles(snap.customRoles) as never,
    );
    return resolved.permissions;
  } catch {
    // Fail-safe: sem permissões resolvidas, o ator não decide por permissão.
    return [];
  }
}

/**
 * Carrega em lote as definições referenciadas pelos itens do overview
 * (uma leitura por definição distinta). Devolve apenas as existentes.
 */
export async function loadDefinitionMap(
  definitionIds: string[],
): Promise<Map<string, LoadedWorkflowDefinition>> {
  const map = new Map<string, LoadedWorkflowDefinition>();
  const unique = Array.from(new Set(definitionIds.filter(Boolean))).slice(0, 20);
  await Promise.all(
    unique.map(async (id) => {
      const def = await loadWorkflowDefinitionById(id);
      if (def) map.set(id, def);
    }),
  );
  return map;
}

/* ─── Histórico de decisões por passo (batch server-side) ─────────────── */

/**
 * Carrega numa única query os eventos de decisão (WORKFLOW_APPROVED /
 * WORKFLOW_REJECTED) das instâncias visíveis na página e resolve os nomes
 * dos autores num segundo batch (infraestrutura existente, sem N+1).
 * Devolve apenas factos: eventos com metadata.decidedStep válida.
 */
export async function loadWorkflowDecisionHistories(
  instanceIds: string[],
): Promise<
  Map<
    string,
    Array<{
      action: string;
      decision: "APPROVED" | "REJECTED";
      userId: string | null;
      actorName: string;
      decidedStep: string | null;
      timestamp: string | null;
    }>
  >
> {
  const map = new Map<
    string,
    Array<{
      action: string;
      decision: "APPROVED" | "REJECTED";
      userId: string | null;
      actorName: string;
      decidedStep: string | null;
      timestamp: string | null;
    }>
  >();
  const ids = Array.from(new Set(instanceIds.filter(Boolean))).slice(0, 130);
  if (ids.length === 0) return map;

  try {
    const supabase = createAdminClient();
    // Filtro PostgREST por JSONB: uma única query para todas as instâncias.
    const { data } = await supabase
      .from("audit_logs")
      .select("user_id, action, timestamp, metadata")
      .in("action", ["WORKFLOW_APPROVED", "WORKFLOW_REJECTED"])
      .filter("metadata->>workflowInstanceId", "in", `(${ids.join(",")})`)
      .limit(1000);

    type DecisionRow = {
      user_id: string | null;
      action: string;
      timestamp: string | null;
      metadata: Record<string, unknown> | null;
    };
    const rows = (data ?? []) as unknown as DecisionRow[];
    if (rows.length === 0) return map;

    const names = await resolveUserNames([
      ...new Set(
        rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)),
      ),
    ]);

    for (const row of rows) {
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      const instanceId =
        typeof meta.workflowInstanceId === "string"
          ? meta.workflowInstanceId
          : null;
      const decidedStep =
        typeof meta.decidedStep === "string" ? meta.decidedStep : null;
      if (!instanceId || !decidedStep) continue; // legado/sem passo → ignora
      const entry = {
        action: row.action,
        decision:
          row.action === "WORKFLOW_APPROVED"
            ? ("APPROVED" as const)
            : ("REJECTED" as const),
        userId: row.user_id,
        actorName: names.get(row.user_id ?? "")?.name ?? "Utilizador",
        decidedStep,
        timestamp: row.timestamp,
      };
      const list = map.get(instanceId) ?? [];
      list.push(entry);
      map.set(instanceId, list);
    }
    return map;
  } catch {
    // Fail-safe: sem histórico auditável, a UI mostra só o progresso básico.
    return map;
  }
}

/**
 * Resolve os utilizadores responsáveis por um passo:
 *  - com `requiredPermission`: membros da organização que a detêm (RBAC);
 *  - sem: aprovador designado, senão quem tem `workflows.approve`.
 * Sem organização: apenas o aprovador designado.
 */
export async function resolveStepResponsibleUserIds(input: {
  organizationId: string | null;
  stepRequiredPermission: string | null;
  designatedApproverId?: string | null;
}): Promise<string[]> {
  const { organizationId, stepRequiredPermission, designatedApproverId } =
    input;
  if (!organizationId) {
    return designatedApproverId ? [designatedApproverId] : [];
  }
  try {
    const snap = await fetchOrgRbac(organizationId);
    if (!snap) return designatedApproverId ? [designatedApproverId] : [];
    const required = stepRequiredPermission || "workflows.approve";
    const eligibles = resolveEligibleApproverIds({
      organizationId,
      memberships: mapMemberships(snap.memberships, organizationId),
      customRoles: mapCustomRoles(snap.customRoles),
      requiredPermission: required,
    });
    if (stepRequiredPermission) return eligibles;
    // Sem permissão configurada no passo: manter aprovador designado.
    return designatedApproverId && !eligibles.includes(designatedApproverId)
      ? [designatedApproverId]
      : eligibles;
  } catch {
    return [];
  }
}

