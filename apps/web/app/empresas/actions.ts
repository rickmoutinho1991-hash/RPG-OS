"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { formatPortugueseNif } from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function getCompaniesList(search?: string): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("companies")
      .select(
        `
        id,
        legal_name,
        commercial_name,
        tax_number,
        legal_form,
        email,
        phone,
        website,
        created_at
      `,
      )
      .order("created_at", { ascending: false });

    if (user.companyId) {
      query = query.eq("id", user.companyId);
    }

    if (search) {
      const s = search.trim();
      query = query.or(`legal_name.ilike.%${s}%,tax_number.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((c: any) => ({
      ...c,
      formattedTaxNumber: formatPortugueseNif(c.tax_number),
    }));
  } catch {
    return [];
  }
}

export async function getCompanyById(id: string): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    const [compRes, empRes, projRes] = await Promise.all([
      supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("company_employees")
        .select(
          `
          id,
          job_title,
          department,
          status,
          hired_at,
          users(id, email, profiles(name, phone))
        `,
        )
        .eq("company_id", id),
      supabase
        .from("projects")
        .select("*")
        .eq("company_id", id),
    ]);

    const company = compRes.data;
    if (!company) return null;

    return {
      company: {
        ...company,
        formattedTaxNumber: formatPortugueseNif(company.tax_number),
      },
      employees: empRes.data || [],
      projects: projRes.data || [],
    };
  } catch {
    return null;
  }
}

export async function addCompanyEmployee(
  companyId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para adicionar colaboradores." };
  }

  const supabase = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const department = String(formData.get("department") ?? "Operações").trim();

  if (!name || !email || !jobTitle) {
    return { success: false, error: "Nome, email e cargo são obrigatórios." };
  }

  try {
    let { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();

      if (userError || !newUser) {
        return { success: false, error: "Erro ao criar utilizador para o colaborador." };
      }
      user = newUser;

      await supabase.from("profiles").insert({
        user_id: user.id,
        name,
        company_id: companyId,
      });
    }

    await supabase.from("company_employees").insert({
      company_id: companyId,
      user_id: user.id,
      job_title: jobTitle,
      department,
      status: "ACTIVE",
    });

    await supabase.from("audit_logs").insert({
      user_id: currentUser.id,
      company_id: companyId,
      action: "EMPLOYEE_ADDED",
      module: "COMPANIES",
      entity_type: "COMPANY_EMPLOYEE",
      entity_id: user.id,
      metadata: { employeeName: name, email, jobTitle, department },
    });

    revalidatePath(`/empresas/${companyId}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro ao associar colaborador.",
    };
  }
}
