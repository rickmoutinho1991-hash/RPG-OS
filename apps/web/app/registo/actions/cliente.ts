"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidPortugueseNif,
  isValidPortuguesePostalCode,
  formatPortugueseNif,
  sanitizeAuditMetadata,
} from "@rpg/core";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  message?: string;
  error?: string;
  id?: string;
}

export async function criarClienteAction(
  _prevState: ActionResponse | null,
  formData: FormData,
): Promise<ActionResponse> {
  const supabase = createAdminClient();

  const nome = String(formData.get("nome") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").replace(/\s/g, "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const morada = String(formData.get("morada") ?? "").trim();
  const rawCodigoPostal = String(formData.get("codigo_postal") ?? "1000-001").trim();
  const codigoPostal = rawCodigoPostal || "1000-001";
  const cidade = String(formData.get("cidade") ?? "Lisboa").trim() || "Lisboa";
  const distrito = String(formData.get("distrito") ?? "Lisboa").trim() || "Lisboa";
  const termosAceites = formData.get("termos") === "on" || formData.get("termos") === "true";
  const privacidadeAceite = formData.get("privacidade") === "on" || formData.get("privacidade") === "true";

  // 1. Validações de campos obrigatórios
  if (!nome || nome.length < 2) {
    return {
      success: false,
      error: "O nome completo é obrigatório (mínimo 2 caracteres).",
    };
  }

  if (!nif) {
    return {
      success: false,
      error: "O NIF é obrigatório.",
    };
  }

  if (!isValidPortugueseNif(nif)) {
    return {
      success: false,
      error: "O NIF introduzido não é válido segundo as regras da Autoridade Tributária.",
    };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      success: false,
      error: "Introduza um endereço de email válido.",
    };
  }

  if (!telefone || telefone.length < 6) {
    return {
      success: false,
      error: "Introduza um número de telefone ou telemóvel válido.",
    };
  }

  if (!morada || morada.length < 3) {
    return {
      success: false,
      error: "A morada completa é obrigatória.",
    };
  }

  if (codigoPostal && !isValidPortuguesePostalCode(codigoPostal)) {
    return {
      success: false,
      error: "O código postal deve ter o formato válido XXXX-XXX.",
    };
  }

  if (!termosAceites || !privacidadeAceite) {
    return {
      success: false,
      error: "É obrigatório aceitar os Termos de Serviço e a Política de Privacidade para prosseguir.",
    };
  }

  try {
    // 2. Verificar de forma robusta e independente se email ou NIF já se encontram registados
    const [existingUserRes, existingTaxRes] = await Promise.all([
      supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, user_id")
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
    let isNewUser = false;

    if (existingUserRes.data) {
      // Verificar se o utilizador já tem perfil associado
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", existingUserRes.data.id)
        .maybeSingle();

      if (existingProfile) {
        return {
          success: false,
          error: "Já existe um cliente registado no sistema com este endereço de email.",
        };
      }
      userId = existingUserRes.data.id;
    } else {
      // 3. Criar entidade de utilizador
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .maybeSingle();

      if (userError || !newUser) {
        // Se falhar por chave duplicada (concorrência)
        if (userError?.code === "23505" || userError?.message?.includes("unique constraint")) {
          const { data: fetchedUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

          if (fetchedUser) {
            userId = fetchedUser.id;
          } else {
            return {
              success: false,
              error: "Este endereço de email já se encontra em utilização.",
            };
          }
        } else {
          return {
            success: false,
            error: `Não foi possível criar o utilizador: ${userError?.message || "Erro desconhecido"}`,
          };
        }
      } else {
        userId = newUser.id;
        isNewUser = true;
      }
    }


    // 4. Criar endereço
    const { data: address, error: addressError } = await supabase
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

    if (addressError || !address) {
      if (isNewUser) {
        await supabase.from("users").delete().eq("id", userId);
      }
      return {
        success: false,
        error: `Erro ao registar morada: ${addressError?.message || "Falha na gravação"}`,
      };
    }

    // 5. Criar perfil associado
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: userId,
      name: nome,
      phone: telefone,
      address_id: address.id,
      tax_number: nif,
    });

    if (profileError) {
      if (isNewUser) {
        await supabase.from("addresses").delete().eq("id", address.id);
        await supabase.from("users").delete().eq("id", userId);
      }
      return {
        success: false,
        error: `Erro ao criar perfil do cliente: ${profileError.message}`,
      };
    }

    // 6. Criar registration, contacts, rgpd e audit em paralelo para máxima performance
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase.from("registrations").insert({
        user_id: userId,
        type: "CUSTOMER",
        status: "VERIFIED",
        terms_accepted_at: nowIso,
        privacy_accepted_at: nowIso,
      }),
      supabase.from("contacts").insert([
        { user_id: userId, type: "CUSTOMER", value: email, is_primary: true },
        { user_id: userId, type: "CUSTOMER", value: telefone, is_primary: false },
      ]),
      supabase.from("rgpd_consents").insert({
        user_id: userId,
        terms_version: "1.0",
        privacy_version: "1.0",
        marketing_consent: formData.get("marketing") === "on",
        communication_consent: true,
        accepted_at: nowIso,
      }),
      supabase.from("audit_logs").insert({
        user_id: userId,
        action: "CLIENT_REGISTERED",
        module: "REGISTRATION",
        entity_type: "CUSTOMER",
        entity_id: userId,
        metadata: sanitizeAuditMetadata({ nif: formatPortugueseNif(nif), email, nome }),
      }),
    ]);

    // Revalidar rotas afetadas para atualização imediata
    revalidatePath("/clientes");
    revalidatePath("/obras/nova");
    revalidatePath("/orcamentos/novo");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Cliente "${nome}" registado com sucesso!`,
      id: userId,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Ocorreu um erro inesperado ao guardar o registo.",
    };
  }
}

// Mantemos o wrapper de retrocompatibilidade
export async function criarCliente(formData: FormData): Promise<void> {
  const res = await criarClienteAction(null, formData);
  if (!res.success) {
    throw new Error(res.error);
  }
}

