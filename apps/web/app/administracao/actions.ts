"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasPermission,
  validateWorkflowConfig,
  normalizeWorkflowKey,
} from "@rpg/core";

const result = (error?: string) => (error ? { error } : { success: true });
async function guard(permission = "admin.manage") {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization || !hasPermission(ctx.permissions, permission))
    return null;
  return {
    ctx,
    supabase: createAdminClient(),
    organizationId: ctx.organization.id,
  };
}
function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function createDepartmentAction(form: FormData) {
  const auth = await guard();
  if (!auth) return result("Sem permissão.");
  const name = text(form, "name");
  if (!name) return result("O nome é obrigatório.");
  const { error } = await auth.supabase
    .from("departments")
    .insert({
      organization_id: auth.organizationId,
      name,
      description: text(form, "description") || null,
    });
  if (error) return result("Não foi possível criar o departamento.");
  revalidatePath("/administracao/departamentos");
  return result();
}
export async function createTeamAction(form: FormData) {
  const auth = await guard();
  if (!auth) return result("Sem permissão.");
  const name = text(form, "name");
  if (!name) return result("O nome é obrigatório.");
  const departmentId = text(form, "department_id");
  const { error } = await auth.supabase
    .from("teams")
    .insert({
      organization_id: auth.organizationId,
      name,
      department_id: departmentId || null,
    });
  if (error) return result("Não foi possível criar a equipa.");
  revalidatePath("/administracao/equipas");
  return result();
}
export async function createRoleAction(form: FormData) {
  const auth = await guard();
  if (!auth) return result("Sem permissão.");
  const label = text(form, "label");
  const key = text(form, "key")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!label || !key) return result("Nome e identificador são obrigatórios.");
  const permissions = text(form, "permissions")
    .split(/[\s,]+/)
    .filter(Boolean);
  const { error } = await auth.supabase
    .from("custom_roles")
    .insert({
      organization_id: auth.organizationId,
      label,
      key,
      permissions,
      scope: "ORGANIZATION",
    });
  if (error) return result("Não foi possível criar o cargo.");
  revalidatePath("/administracao/cargos");
  return result();
}
export async function updateMembershipAction(form: FormData) {
  const auth = await guard();
  if (!auth) return result("Sem permissão.");
  const id = text(form, "id");
  const roleKey = text(form, "role_key");
  const departmentId = text(form, "department_id");
  const status = text(form, "status");
  if (!id) return result("Membro inválido.");
  const patch: Record<string, string | null> = {};
  if (roleKey) patch.role_key = roleKey;
  if (departmentId) patch.department_id = departmentId;
  if (["ACTIVE", "SUSPENDED", "REMOVED"].includes(status))
    patch.status = status;
  const { error } = await auth.supabase
    .from("org_memberships")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", auth.organizationId);
  if (error) return result("Não foi possível atualizar o membro.");
  revalidatePath("/administracao/membros");
  return result();
}
export async function createInvitationAction(form: FormData) {
  const auth = await guard();
  if (!auth) return result("Sem permissão.");
  const email = text(form, "email").toLowerCase();
  const roleKey = text(form, "role_key") || "EMPLOYEE";
  if (!/^\S+@\S+\.\S+$/.test(email)) return result("Email inválido.");
  const token = crypto.randomUUID();
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { error } = await auth.supabase
    .from("organization_invitations")
    .insert({
      organization_id: auth.organizationId,
      email,
      role_key: roleKey,
      invited_by: auth.ctx.user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  if (error) return result("Não foi possível criar o convite.");
  revalidatePath("/administracao/convites");
  return { success: true, token };
}

/* ─── Workflow Definitions (Admin → Automações) ─────────────────── */

export interface WorkflowDefinitionItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  entity_type: string;
  version: number;
  active: boolean;
  created_at: string;
  steps: Array<{
    id: string;
    key: string;
    name: string;
    position: number;
    required_permission: string | null;
  }>;
  transitions: Array<{
    id: string;
    from_step: string;
    to_step: string;
    required_permission: string | null;
  }>;
}

function groupBy<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = String(row[key]);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export async function getWorkflowDefinitionsAction(): Promise<
  WorkflowDefinitionItem[]
> {
  const auth = await guard("workflows.manage");
  if (!auth) return [];

  const supabase = auth.supabase;
  const orgId = auth.organizationId;

  try {
    const { data: defs } = await supabase
      .from("workflow_definitions")
      .select("id, key, name, description, entity_type, version, active, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    const list = (defs ?? []) as Array<Record<string, unknown>>;
    const defIds = list.map((d) => String(d.id));
    if (defIds.length === 0) return [];

    const [stepsRes, transRes] = await Promise.all([
      supabase
        .from("workflow_steps")
        .select("id, workflow_definition_id, key, name, position, required_permission")
        .in("workflow_definition_id", defIds)
        .order("position", { ascending: true }),
      supabase
        .from("workflow_transitions")
        .select("id, workflow_definition_id, from_step, to_step, required_permission")
        .in("workflow_definition_id", defIds),
    ]);

    const stepsByDef = groupBy(
      (stepsRes.data ?? []) as Array<Record<string, unknown>>,
      "workflow_definition_id",
    );
    const transByDef = groupBy(
      (transRes.data ?? []) as Array<Record<string, unknown>>,
      "workflow_definition_id",
    );

    return list.map((d) => ({
      id: String(d.id),
      key: String(d.key),
      name: String(d.name),
      description: (d.description as string | null) || null,
      entity_type: String(d.entity_type),
      version: Number(d.version),
      active: Boolean(d.active),
      created_at: String(d.created_at),
      steps: (stepsByDef.get(String(d.id)) ?? []).map((s) => ({
        id: String(s.id),
        key: String(s.key),
        name: String(s.name),
        position: Number(s.position),
        required_permission: (s.required_permission as string | null) ?? null,
      })),
      transitions: (transByDef.get(String(d.id)) ?? []).map((t) => ({
        id: String(t.id),
        from_step: String(t.from_step),
        to_step: String(t.to_step),
        required_permission: (t.required_permission as string | null) ?? null,
      })),
    }));
  } catch {
    return [];
  }
}

export async function createWorkflowDefinitionAction(
  form: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const auth = await guard("workflows.manage");
  if (!auth) return result("Sem permissão de gestão de workflows.");

  let steps: Array<Record<string, unknown>> = [];
  let transitions: Array<Record<string, unknown>> = [];
  try {
    steps = JSON.parse(text(form, "steps") || "[]");
    transitions = JSON.parse(text(form, "transitions") || "[]");
  } catch {
    return result("Os passos e transições não são um JSON válido.");
  }

  const validation = validateWorkflowConfig(
    {
      name: text(form, "name"),
      key: text(form, "key"),
      entityType: text(form, "entity_type"),
      description: text(form, "description") || undefined,
    },
    steps.map((s) => ({
      key: String(s.key ?? ""),
      name: String(s.name ?? ""),
      position:
        typeof s.position === "number" ? s.position : Number(s.position) || 0,
      requiredPermission: s.requiredPermission
        ? String(s.requiredPermission)
        : undefined,
    })),
    transitions.map((t) => ({
      fromStep: String(t.fromStep ?? ""),
      toStep: String(t.toStep ?? ""),
      requiredPermission: t.requiredPermission
        ? String(t.requiredPermission)
        : undefined,
      condition:
        t.condition && typeof t.condition === "object"
          ? (t.condition as Record<string, unknown>)
          : undefined,
    })),
  );

  if (!validation.ok) {
    return { success: false, error: validation.errors.join(" · ") };
  }

  const supabase = auth.supabase;
  const definitionKey = normalizeWorkflowKey(text(form, "key"));

  const { data: definition, error: defError } = await supabase
    .from("workflow_definitions")
    .insert({
      organization_id: auth.organizationId,
      key: definitionKey,
      name: text(form, "name"),
      description: text(form, "description") || null,
      entity_type: text(form, "entity_type").trim().toUpperCase(),
      version: 1,
      active: true,
      created_by: auth.ctx.user.id,
    })
    .select("id")
    .single();

  if (defError || !definition) {
    return result("Não foi possível criar a definição de workflow.");
  }

  for (const step of steps) {
    await supabase.from("workflow_steps").insert({
      workflow_definition_id: definition.id,
      key: normalizeWorkflowKey(String(step.key ?? "")),
      name: String(step.name ?? step.key ?? "Passo"),
      position:
        typeof step.position === "number" ? step.position : Number(step.position) || 0,
      required_permission: step.requiredPermission
        ? String(step.requiredPermission)
        : null,
    });
  }

  for (const transition of transitions) {
    await supabase.from("workflow_transitions").insert({
      workflow_definition_id: definition.id,
      from_step: normalizeWorkflowKey(String(transition.fromStep ?? "")),
      to_step: normalizeWorkflowKey(String(transition.toStep ?? "")),
      required_permission: transition.requiredPermission
        ? String(transition.requiredPermission)
        : null,
      condition:
        transition.condition && typeof transition.condition === "object"
          ? (transition.condition as Record<string, unknown>)
          : {},
    });
  }

  await supabase.from("audit_logs").insert({
    user_id: auth.ctx.user.id,
    company_id: auth.organizationId,
    action: "WORKFLOW_DEFINITION_CREATED",
    module: "WORKFLOWS",
    entity_type: "WORKFLOW_DEFINITION",
    entity_id: definition.id,
    metadata: {
      key: definitionKey,
      name: text(form, "name"),
      steps: steps.length,
      transitions: transitions.length,
    },
  });

  revalidatePath("/administracao/automacoes");
  return { success: true };
}

export async function toggleWorkflowDefinitionAction(
  id: string,
  active: boolean,
): Promise<{ success?: boolean; error?: string }> {
  const auth = await guard("workflows.manage");
  if (!auth) return result("Sem permissão de gestão de workflows.");
  const { error } = await auth.supabase
    .from("workflow_definitions")
    .update({ active })
    .eq("id", id)
    .eq("organization_id", auth.organizationId);
  if (error) return result("Não foi possível atualizar a definição.");
  revalidatePath("/administracao/automacoes");
  return { success: true };
}
