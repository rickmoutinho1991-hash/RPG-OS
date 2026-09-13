"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { formatPortugueseNif, isValidPortugueseNif } from "@rpg/core";
import { recordAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface ClientListItem {
  id: string;
  name: string;
  taxNumber: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  status: string;
  type: string;
  createdAt: string;
}

export async function getClientesList(params?: {
  search?: string;
  district?: string;
}): Promise<ClientListItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();
  const search = params?.search?.trim() || "";

  try {
    let profilesQuery = supabase
      .from("profiles")
      .select(`
        id,
        user_id,
        name,
        tax_number,
        phone,
        address_id,
        sector,
        company_id,
        created_at,
        addresses(id, city, district, street, postal_code)
      `)
      .order("created_at", { ascending: false });

    if (user.companyId) {
      profilesQuery = profilesQuery.eq("company_id", user.companyId);
    }

    const [profilesRes, usersRes] = await Promise.all([
      profilesQuery,
      supabase.from("users").select("id, email"),
    ]);

    const usersMap = new Map<string, string>();
    if (usersRes.data) {
      for (const u of usersRes.data) {
        usersMap.set(u.id, u.email);
      }
    }

    let results: ClientListItem[] = [];

    // Processar perfis
    if (profilesRes.data && profilesRes.data.length > 0) {
      for (const p of profilesRes.data) {
        const addr = p.addresses as { city?: string; district?: string } | null;
        const email = p.user_id ? usersMap.get(p.user_id) || "Cliente RPG-OS" : "Cliente RPG-OS";

        results.push({
          id: p.user_id || p.id,
          name: p.name || "Cliente sem nome",
          taxNumber: p.tax_number ? formatPortugueseNif(p.tax_number) : "Não indicado",
          email,
          phone: p.phone || "Sem telefone",
          city: addr?.city || "Portugal",
          district: addr?.district || "Portugal",
          status: "VERIFIED",
          type: p.sector === "SOLE_TRADER" ? "SOLE_TRADER" : "CUSTOMER",
          createdAt: p.created_at,
        });
      }
    }

    // Filtrar por pesquisa se fornecido
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.taxNumber.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s) ||
          c.phone.toLowerCase().includes(s),
      );
    }

    return results;
  } catch {
    return [];
  }
}

export async function getClientById(userId: string): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) return null;

    let profileQuery = supabase
      .from("profiles")
      .select(
        `
        id,
        user_id,
        name,
        tax_number,
        phone,
        company_id,
        created_at,
        users(
          id,
          email,
          registrations(status, type)
        ),
        addresses(*)
      `,
      )
      .or(`user_id.eq.${userId},id.eq.${userId}`);

    if (user.companyId) {
      profileQuery = profileQuery.eq("company_id", user.companyId);
    }

    const [profileRes, projectsRes, quotesRes, auditLogsRes] = await Promise.all([
      profileQuery.maybeSingle(),
      supabase
        .from("projects")
        .select("*")
        .eq("client_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("*")
        .eq("client_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(10),
    ]);

    const profile = profileRes.data;
    if (!profile) return null;

    return {
      profile,
      projects: projectsRes.data || [],
      quotes: quotesRes.data || [],
      auditLogs: auditLogsRes.data || [],
    };
  } catch {
    return null;
  }
}

export async function updateClientAction(
  userId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para editar cliente." };
  }

  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const taxNumber = String(formData.get("tax_number") ?? "").replace(/\s/g, "");

  if (!name || !phone) {
    return { success: false, error: "Nome e telefone são obrigatórios." };
  }

  if (taxNumber && !isValidPortugueseNif(taxNumber)) {
    return { success: false, error: "O NIF introduzido não é válido segundo as regras da AT." };
  }

  try {
    // Tenant isolation: perfil tem de pertencer à empresa do utilizador.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) return { success: false, error: "Identificador inválido." };

    let targetQuery = supabase
      .from("profiles")
      .select("id")
      .or(`user_id.eq.${userId},id.eq.${userId}`);
    if (currentUser.companyId) {
      targetQuery = targetQuery.eq("company_id", currentUser.companyId);
    }
    const { data: target } = await targetQuery.limit(1).maybeSingle();
    if (!target) {
      return { success: false, error: "Cliente não encontrado na sua empresa." };
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        name,
        phone,
        tax_number: taxNumber || null,
      })
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .eq("company_id", currentUser.companyId);

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    // AUDIT → SANITIZE → AUDIT LOG → INTEGRITY HASH (lib/audit)
    await recordAuditEvent({
      userId: currentUser.id,
      companyId: currentUser.companyId || null,
      action: "CLIENT_UPDATED",
      module: "CLIENTS",
      entityType: "PROFILE",
      entityId: userId,
      metadata: { name, phone, taxNumber },
    });

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${userId}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar cliente.",
    };
  }
}

