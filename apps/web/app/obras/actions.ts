"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";

export async function getProjectsList(params?: {
  search?: string;
  status?: string;
  clientId?: string;
}): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("projects")
      .select(
        `
        id,
        code,
        title,
        description,
        status,
        start_date,
        expected_end_date,
        budget_estimated,
        budget_actual,
        progress_percentage,
        created_at,
        client_id,
        company_id,
        users(id, email, profiles(name, tax_number)),
        companies(legal_name)
      `,
      )
      .order("created_at", { ascending: false });

    if (user.companyId) {
      query = query.eq("company_id", user.companyId);
    }

    if (params?.status) {
      query = query.eq("status", params.status);
    }
    if (params?.clientId) {
      query = query.eq("client_id", params.clientId);
    }
    if (params?.search) {
      const s = params.search.trim();
      query = query.or(`title.ilike.%${s}%,code.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((p: any) => {
      const profile = p.users?.profiles;
      const clientName = Array.isArray(profile)
        ? profile[0]?.name
        : profile?.name;
      const company = p.companies as { legal_name?: string } | null;

      return {
        id: p.id,
        code: p.code,
        title: p.title,
        status: p.status,
        clientId: p.client_id,
        clientName: clientName || p.users?.email || "Cliente Geral",
        companyName: company?.legal_name || "Empresa Geral",
        budgetEstimated: Number(p.budget_estimated || 0),
        budgetActual: Number(p.budget_actual || 0),
        progressPercentage: Number(p.progress_percentage || 0),
        startDate: p.start_date,
        expectedEndDate: p.expected_end_date,
        createdAt: p.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function getProjectById(id: string): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    let projQuery = supabase
      .from("projects")
      .select(
        `
        *,
        users(id, email, profiles(name, phone, tax_number)),
        companies(legal_name),
        addresses(*)
      `,
      )
      .eq("id", id);

    if (user.companyId) {
      projQuery = projQuery.eq("company_id", user.companyId);
    }

    const { data: project } = await projQuery.maybeSingle();

    if (!project) return null;

    // Executar subqueries em paralelo para resposta rápida
    const [tasksRes, membersRes, materialsRes, photosRes] = await Promise.all([
      supabase
        .from("project_tasks")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_members")
        .select(
          `
          id,
          role,
          joined_at,
          users(email, profiles(name))
        `,
        )
        .eq("project_id", id),
      supabase
        .from("project_materials")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_photos")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      project,
      tasks: tasksRes.data || [],
      members: membersRes.data || [],
      materials: materialsRes.data || [],
      photos: photosRes.data || [],
    };
  } catch {
    return null;
  }
}

export async function createProjectAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para criar obras." };
  }

  const supabase = createAdminClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const clientIdRaw = String(formData.get("client_id") ?? formData.get("client_email") ?? "").trim();
  const budget = parseFloat(String(formData.get("budget_estimated") ?? "0"));
  const startDate = String(formData.get("start_date") ?? "").trim() || null;
  const expectedEndDate =
    String(formData.get("expected_end_date") ?? "").trim() || null;

  if (!title) {
    return { success: false, error: "O título da obra é obrigatório." };
  }

  if (!clientIdRaw) {
    return {
      success: false,
      error: "Por favor selecione um cliente existente para associar à obra.",
    };
  }

  try {
    let resolvedUserId: string | null = null;
    let resolvedCompanyId: string | null = null;

    // 1. Verificar se é UUID direto de utilizador ou perfil
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientIdRaw);

    if (isUuid) {
      const { data: userById } = await supabase
        .from("users")
        .select("id")
        .eq("id", clientIdRaw)
        .maybeSingle();

      if (userById) {
        resolvedUserId = userById.id;
      } else {
        // Tentar resolver a partir de profile.id ou profile.user_id
        const { data: profileById } = await supabase
          .from("profiles")
          .select("user_id, company_id")
          .eq("id", clientIdRaw)
          .maybeSingle();

        if (profileById?.user_id) {
          resolvedUserId = profileById.user_id;
          resolvedCompanyId = profileById.company_id || null;
        } else {
          // Verificar se é ID de uma Empresa (companies)
          const { data: comp } = await supabase
            .from("companies")
            .select("id, email, legal_name")
            .eq("id", clientIdRaw)
            .maybeSingle();

          if (comp) {
            resolvedCompanyId = comp.id;
            let { data: compUser } = await supabase
              .from("users")
              .select("id")
              .eq("email", comp.email.toLowerCase())
              .maybeSingle();

            if (!compUser) {
              const { data: createdCompUser } = await supabase
                .from("users")
                .insert({ email: comp.email.toLowerCase() })
                .select("id")
                .maybeSingle();
              compUser = createdCompUser;
            }

            if (compUser) {
              resolvedUserId = compUser.id;
            }
          }
        }
      }
    }

    // 2. Se não foi encontrado por UUID e tem formato de email
    if (!resolvedUserId && clientIdRaw.includes("@")) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", clientIdRaw.toLowerCase())
        .maybeSingle();

      if (userByEmail) {
        resolvedUserId = userByEmail.id;
      }
    }

    if (!resolvedUserId) {
      return {
        success: false,
        error: "O cliente selecionado não foi encontrado na base de dados. Registe o cliente em /registo/cliente primeiro.",
      };
    }

    // 4. Obter próximo código sequencial de obra
    let countQuery = supabase
      .from("projects")
      .select("id", { count: "exact", head: true });

    if (user.companyId) {
      countQuery = countQuery.eq("company_id", user.companyId);
    }

    const countRes = await countQuery;
    const nextSeq = (countRes.count || 0) + 1;
    const year = new Date().getFullYear();
    const code = `OBR-${year}-${String(nextSeq).padStart(3, "0")}`;

    // 5. Inserir projeto associado ao client_id e empresa
    const { data: newProject, error: projError } = await supabase
      .from("projects")
      .insert({
        code,
        title,
        description: description || null,
        client_id: resolvedUserId,
        company_id: user.companyId || resolvedCompanyId || null,
        budget_estimated: isNaN(budget) ? 0 : budget,
        status: "PLANNED",
        start_date: startDate,
        expected_end_date: expectedEndDate,
        progress_percentage: 0,
      })
      .select("id")
      .single();

    if (projError || !newProject) {
      return {
        success: false,
        error: projError?.message || "Erro ao criar obra na base de dados.",
      };
    }

    // 6. Inserir log de auditoria associado ao operador autenticado
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      company_id: user.companyId || null,
      action: "PROJECT_CREATED",
      module: "PROJECTS",
      entity_type: "PROJECT",
      entity_id: newProject.id,
      metadata: { code, title, budget, clientId: resolvedUserId },
    });

    revalidatePath("/obras");
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${resolvedUserId}`);
    revalidatePath("/dashboard");

    return { success: true, id: newProject.id };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro inesperado ao criar obra.",
    };
  }
}

export async function addTaskAction(
  projectId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "MEDIUM").trim();
  const estimatedHours = parseFloat(
    String(formData.get("estimated_hours") ?? "0"),
  );

  if (!title) {
    return { success: false, error: "O título da tarefa é obrigatório." };
  }

  try {
    await supabase.from("project_tasks").insert({
      project_id: projectId,
      title,
      description,
      priority,
      estimated_hours: isNaN(estimatedHours) ? 0 : estimatedHours,
      status: "TODO",
    });

    revalidatePath(`/obras/${projectId}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao adicionar tarefa.",
    };
  }
}

export async function updateProjectProgressAction(
  projectId: string,
  progress: number,
  status?: string,
): Promise<{ success: boolean }> {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = {
    progress_percentage: Math.min(100, Math.max(0, progress)),
  };

  if (status) {
    updateData.status = status;
  }

  await supabase.from("projects").update(updateData).eq("id", projectId);
  revalidatePath(`/obras/${projectId}`);
  revalidatePath("/obras");
  return { success: true };
}

export async function addProjectPhotoAction(
  projectId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const caption = String(formData.get("caption") ?? "").trim();
  const stage = String(formData.get("stage") ?? "DURING").trim();
  const fileInput = formData.get("file") as File | null;

  if (!fileInput || fileInput.size === 0) {
    return { success: false, error: "Selecione uma fotografia para carregar." };
  }

  try {
    const fileBytes = await fileInput.arrayBuffer();
    const photoId = crypto.randomUUID();
    const storagePath = `${projectId}/${photoId}_${fileInput.name}`;

    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(storagePath, fileBytes, {
        contentType: fileInput.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: `Erro ao enviar fotografia: ${uploadError.message}` };
    }

    const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"}/storage/v1/object/public/project-photos/${storagePath}`;

    await supabase.from("project_photos").insert({
      id: photoId,
      project_id: projectId,
      caption: caption || fileInput.name,
      file_url: fileUrl,
      stage,
    });

    revalidatePath(`/obras/${projectId}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Erro no registo da fotografia." };
  }
}

export async function addProjectMaterialAction(
  projectId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const quantity = parseFloat(String(formData.get("quantity") ?? "1"));
  const unit = String(formData.get("unit") ?? "un").trim();
  const unitCost = parseFloat(String(formData.get("unit_cost") ?? "0"));
  const supplier = String(formData.get("supplier") ?? "").trim();

  if (!name) {
    return { success: false, error: "O nome do material é obrigatório." };
  }

  try {
    const totalCost = (isNaN(quantity) ? 1 : quantity) * (isNaN(unitCost) ? 0 : unitCost);

    await supabase.from("project_materials").insert({
      project_id: projectId,
      name,
      quantity: isNaN(quantity) ? 1 : quantity,
      unit,
      unit_cost: isNaN(unitCost) ? 0 : unitCost,
      total_cost: totalCost,
      supplier: supplier || null,
      status: "ORDERED",
    });

    revalidatePath(`/obras/${projectId}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao registar material." };
  }
}
