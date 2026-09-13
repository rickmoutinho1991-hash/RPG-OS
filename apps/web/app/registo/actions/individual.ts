"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPortugueseNif, sanitizeAuditMetadata } from "@rpg/core";
import { ActionResponse } from "./cliente";

export async function criarProfissionalAction(
  _prevState: ActionResponse | null,
  formData: FormData,
): Promise<ActionResponse> {
  const supabase = createAdminClient();

  const nome = String(formData.get("nome") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").replace(/\s/g, "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const especialidade = String(
    formData.get("especialidade") ?? "Construção Geral",
  ).trim();

  if (!nome || !nif || !email || !telefone) {
    return {
      success: false,
      error: "Por favor preencha todos os campos obrigatórios do profissional.",
    };
  }

  if (!isValidPortugueseNif(nif)) {
    return {
      success: false,
      error: "NIF individual inválido de acordo com a Autoridade Tributária.",
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
          error: "Erro ao criar utilizador profissional.",
        };
      }
      userId = user.id;
    }

    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        name: nome,
        phone: telefone,
        tax_number: nif,
        sector: "SOLE_TRADER",
      },
      { onConflict: "user_id" },
    );

    await supabase.from("registrations").insert({
      user_id: userId,
      type: "SOLE_TRADER",
      status: "VERIFIED",
    });

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "PROFESSIONAL_REGISTERED",
      module: "REGISTRATION",
      entity_type: "WORKER",
      entity_id: userId,
      metadata: sanitizeAuditMetadata({ especialidade, nome, email }),
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/clientes");
    revalidatePath("/obras/nova");
    revalidatePath("/orcamentos/novo");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Profissional ${nome} registado com sucesso!`,
      id: userId,
    };

  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Erro inesperado ao registar profissional.",
    };
  }
}

