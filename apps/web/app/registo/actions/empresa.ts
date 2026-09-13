"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidPortugueseCompanyNipc,
  isValidPortuguesePostalCode,
  formatPortugueseNif,
  sanitizeAuditMetadata,
} from "@rpg/core";
import { ActionResponse } from "./cliente";

export async function criarEmpresaAction(
  _prevState: ActionResponse | null,
  formData: FormData,
): Promise<ActionResponse> {
  const supabase = createAdminClient();

  const legalName = String(formData.get("legal_name") ?? "").trim();
  const commercialName =
    String(formData.get("commercial_name") ?? "").trim() || legalName;
  const taxNumber = String(formData.get("nipc") ?? "").replace(/\s/g, "");
  const legalForm = String(
    formData.get("legal_form") ?? "Sociedade por Quotas (Lda.)",
  ).trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("telefone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const morada = String(formData.get("morada") ?? "").trim();
  const codigoPostal = String(
    formData.get("codigo_postal") ?? "1000-001",
  ).trim();
  const cidade = String(formData.get("cidade") ?? "Lisboa").trim();
  const distrito = String(formData.get("distrito") ?? "Lisboa").trim();
  const repNome = String(formData.get("rep_nome") ?? "").trim();
  const repEmail = String(formData.get("rep_email") ?? "")
    .trim()
    .toLowerCase();

  if (!legalName || !taxNumber || !email || !phone || !morada) {
    return {
      success: false,
      error: "Por favor preencha todos os campos obrigatórios da empresa.",
    };
  }

  if (!isValidPortugueseCompanyNipc(taxNumber)) {
    return {
      success: false,
      error:
        "O NIPC da empresa deve ser um NIF coletivo válido português (iniciado por 5 ou 6).",
    };
  }

  if (codigoPostal && !isValidPortuguesePostalCode(codigoPostal)) {
    return {
      success: false,
      error: "O código postal da empresa deve ter o formato válido XXXX-XXX.",
    };
  }

  try {
    const { data: existingComp } = await supabase
      .from("companies")
      .select("id")
      .eq("tax_number", taxNumber)
      .maybeSingle();

    if (existingComp) {
      return {
        success: false,
        error:
          "Já existe uma empresa registada no sistema com este NIPC/NIF coletivo.",
      };
    }

    const { data: company, error: compError } = await supabase
      .from("companies")
      .insert({
        legal_name: legalName,
        commercial_name: commercialName,
        tax_number: taxNumber,
        country: "Portugal",
        legal_form: legalForm,
        registration_number: taxNumber,
        email,
        phone,
        website: website || null,
      })
      .select("id")
      .single();

    if (compError || !company) {
      return {
        success: false,
        error: `Não foi possível registar a empresa: ${compError?.message}`,
      };
    }

    // Registar morada da sede
    await supabase.from("addresses").insert({
      street: morada,
      number: "s/n",
      postal_code: codigoPostal,
      city: cidade,
      district: distrito,
      country: "Portugal",
    });

    // Se houver representante legal
    if (repEmail && repNome) {
      let repUserId: string | null = null;
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", repEmail)
        .maybeSingle();

      if (existingUser) {
        repUserId = existingUser.id;
      } else {
        const { data: newRepUser } = await supabase
          .from("users")
          .insert({ email: repEmail })
          .select("id")
          .maybeSingle();
        if (newRepUser) {
          repUserId = newRepUser.id;
        }
      }

      if (repUserId) {
        await supabase.from("profiles").upsert(
          {
            user_id: repUserId,
            name: repNome,
            company_id: company.id,
            tax_number: taxNumber,
          },
          { onConflict: "user_id" },
        );

        await supabase.from("company_employees").upsert(
          {
            company_id: company.id,
            user_id: repUserId,
            job_title: "Representante Legal / Administrador",
            department: "Direção",
            status: "ACTIVE",
          },
          { onConflict: "company_id,user_id" },
        );
      }
    }

    // Registo de auditoria
    await supabase.from("audit_logs").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      company_id: company.id,
      action: "COMPANY_REGISTERED",
      module: "COMPANIES",
      entity_type: "COMPANY",
      entity_id: company.id,
      metadata: sanitizeAuditMetadata({ legalName, nipc: formatPortugueseNif(taxNumber), email }),
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/empresas");
    revalidatePath("/clientes");
    revalidatePath("/obras/nova");
    revalidatePath("/orcamentos/novo");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Empresa "${legalName}" registada com sucesso!`,
      id: company.id,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Erro inesperado no registo empresarial.",
    };
  }
}

