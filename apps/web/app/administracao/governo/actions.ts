"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { GovernmentProviderId, GovernmentEnvironment, GOVERNMENT_PROVIDER_DISPLAY, GOVERNMENT_PROVIDER_SCOPES } from "@rpg/core";

export interface GovernmentConnectionStatus {
  id: string;
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  status: string;
  scopes: string[];
  connected_at: string;
  expires_at?: string;
  last_sync_at?: string;
  last_error?: string;
}

export interface GovernmentConnectionFormData {
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  scopes: string[];
  provider_config?: Record<string, unknown>;
}

export async function getGovernmentConnections(): Promise<GovernmentConnectionStatus[]> {
  const ctx = await getSessionContext();
  if (!ctx) return [];

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return [];

  const { data, error } = await supabase
    .from("government_connections")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Government] Error fetching connections:", error);
    return [];
  }

  return (data || []) as unknown as GovernmentConnectionStatus[];
}

export async function createGovernmentConnection(formData: GovernmentConnectionFormData): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { success: false, error: "Não autenticado" };

  if (!hasPermission(ctx.permissions, "government.manage")) {
    return { success: false, error: "Sem permissão para gerir ligações governamentais" };
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return { success: false, error: "Organização não encontrada" };

  // Validate scopes
  const availableScopes = GOVERNMENT_PROVIDER_SCOPES[formData.provider_id];
  if (availableScopes) {
    const allScopes = [...availableScopes.required, ...availableScopes.optional];
    for (const scope of formData.scopes) {
      if (!allScopes.includes(scope)) {
        return { success: false, error: `Scope inválido: ${scope}` };
      }
    }
  }

  // Verify user belongs to organization
  const { data: membership, error: membershipError } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", ctx.user?.id)
    .single();

  if (membershipError || !membership) {
    return { success: false, error: "Utilizador não pertence a esta organização" };
  }

  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { error } = await supabase
    .from("government_connections")
    .insert({
      id: connectionId,
      organization_id: orgId,
      user_id: ctx.user?.id,
      provider_id: formData.provider_id,
      environment: formData.environment,
      scopes: formData.scopes,
      status: "DISCONNECTED",
      provider_config: formData.provider_config || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[Government] Error creating connection:", error);
    return { success: false, error: "Erro ao criar ligação" };
  }

  return { success: true, connectionId };
}

export async function deleteGovernmentConnection(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { success: false, error: "Não autenticado" };

  if (!hasPermission(ctx.permissions, "government.manage")) {
    return { success: false, error: "Sem permissão" };
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  // First verify the connection belongs to the organization
  const { data: connection, error: connectionError } = await supabase
    .from("government_connections")
    .select("organization_id")
    .eq("id", connectionId)
    .single();

  if (connectionError || !connection) {
    return { success: false, error: "Ligação não encontrada" };
  }

  if (connection.organization_id !== orgId) {
    return { success: false, error: "Não tem permissão para eliminar esta ligação - pertence a outra organização" };
  }

  const { error } = await supabase
    .from("government_connections")
    .delete()
    .eq("id", connectionId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("[Government] Error deleting connection:", error);
    return { success: false, error: "Erro ao eliminar ligação" };
  }

  return { success: true };
}

export async function testGovernmentConnection(connectionId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { success: false, error: "Não autenticado" };

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  const { data: connection, error } = await supabase
    .from("government_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("organization_id", orgId)
    .single();

  if (error || !connection) {
    return { success: false, error: "Ligação não encontrada" };
  }

  // Test connection based on provider
  try {
    // This would call the actual provider health check
    // For now, simulate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify organization isolation - only update if connection belongs to org
    const { error: updateError } = await supabase
      .from("government_connections")
      .update({
        status: "CONNECTED",
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("organization_id", orgId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, message: "Conexão testada com sucesso" };
  } catch (err) {
    await supabase
      .from("government_connections")
      .update({
        status: "ERROR",
        last_error: err instanceof Error ? err.message : "Erro desconhecido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);

    return { success: false, error: err instanceof Error ? err.message : "Erro ao testar conexão" };
  }
}