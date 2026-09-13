"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPortugueseNif, isValidPortuguesePostalCode, sanitizeAuditMetadata } from "@rpg/core";
import { ActionResponse } from "./cliente";

export async function criarEniAction(
  _prevState: ActionResponse | null,
  formData: FormData,
): Promise<ActionResponse> {
  const supabase = createAdminClient();

  const nome = String(formData.get("nome") ?? "").trim();
  const nomeComercial =
    String(formData.get("nome_comercial") ?? "").trim() || nome;
  const nif = String(formData.get("nif") ?? "").replace(/\s/g, "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const cae = String(
    formData.get("cae") ?? "43300 - Outros trabalhos de acabamento",
  ).trim();
  const morada = String(formData.get("morada") ?? "").trim();
  const codigoPostal = String(
    formData.get("codigo_postal") ?? "1000-001",
  ).trim();
  const cidade = String(formData.get("cidade") ?? "Lisboa").trim();
  const distrito = String(formData.get("distrito") ?? "Lisboa").trim();

  if (!nome || !nif || !email || !telefone || !morada) {
    return {
      success: false,
      error:
        "Por favor preencha todos os campos obrigatórios do Empresário em Nome Individual.",
    };
  }

  if (!isValidPortugueseNif(nif)) {
    return {
      success: false,
      error: "NIF fiscal inválido de acordo com a Autoridade Tributária.",
    };
  }

  if (codigoPostal && !isValidPortuguesePostalCode(codigoPostal)) {
    return {
      success: false,
      error: "Código postal com formato incorreto (use XXXX-XXX).",
    };
  }

  try {
    const [existingUserRes, existingTaxRes] = await Promise.all([
      supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id")
        .eq("tax_number", nif)
        .maybeSingle(),
    ]);

    if (existingTaxRes.data) {
      return {
        success: false,
        error: "Já existe uma entidade registada no RPG-OS com este NIF.",
      };
    }

    let userId: string;

    if (existingUserRes.data) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", existingUserRes.data.id)
        .maybeSingle();

      if (existingProfile) {
        return {
          success: false,
          error: "Já existe uma conta associada a este endereço de email.",
        };
      }
      userId = existingUserRes.data.id;
    } else {
      const { data: user, error: userError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();

      if (userError || !user) {
        return {
          success: false,
          error: "Erro ao criar conta de utilizador para o ENI.",
        };
      }
      userId = user.id;
    }

    const { data: address } = await supabase
      .from("addresses")
      .insert({
        street: morada,
        number: "s/n",
        postal_code: codigoPostal,
        city: cidade,
        district: distrito,
        country: "Portugal",
      })
      .select("id")
      .single();

    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        name: `${nome} (${nomeComercial})`,
        phone: telefone,
        tax_number: nif,
        address_id: address?.id || null,
        sector: "SOLE_TRADER",
      },
      { onConflict: "user_id" },
    );

    await supabase.from("registrations").insert({
      user_id: userId,
      type: "SOLE_TRADER",
      status: "VERIFIED",
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    });

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "ENI_REGISTERED",
      module: "REGISTRATION",
      entity_type: "SOLE_TRADER",
      entity_id: userId,
      metadata: sanitizeAuditMetadata({ cae, nome, nif, email }),
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/clientes");
    revalidatePath("/obras/nova");
    revalidatePath("/orcamentos/novo");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Empresário em Nome Individual "${nome}" registado com sucesso!`,
      id: userId,
    };

  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro inesperado ao registar ENI.",
    };
  }
}

