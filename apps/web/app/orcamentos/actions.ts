"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { calculateQuoteTotals } from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function getQuotesList(params?: {
  search?: string;
  status?: string;
  clientId?: string;
}): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("quotes")
      .select(
        `
        id,
        quote_number,
        title,
        status,
        issue_date,
        valid_until,
        subtotal,
        total_vat,
        total,
        created_at,
        client_id,
        company_id,
        users(id, email, profiles(name, tax_number))
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
      query = query.or(`title.ilike.%${s}%,quote_number.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((q: any) => {
      const profile = q.users?.profiles;
      const clientName = Array.isArray(profile)
        ? profile[0]?.name
        : profile?.name;

      return {
        id: q.id,
        quoteNumber: q.quote_number,
        title: q.title,
        status: q.status,
        clientId: q.client_id,
        clientName: clientName || q.users?.email || "Cliente Geral",
        clientTaxNumber: Array.isArray(profile)
          ? profile[0]?.tax_number
          : profile?.tax_number,
        subtotal: Number(q.subtotal || 0),
        totalVat: Number(q.total_vat || 0),
        total: Number(q.total || 0),
        issueDate: q.issue_date,
        validUntil: q.valid_until,
        createdAt: q.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function getQuoteById(id: string): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    let quoteQuery = supabase
      .from("quotes")
      .select(
        `
        *,
        users(id, email, profiles(name, phone, tax_number), addresses(*)),
        companies(legal_name, tax_number, email)
      `,
      )
      .eq("id", id);

    if (user.companyId) {
      quoteQuery = quoteQuery.eq("company_id", user.companyId);
    }

    const [quoteRes, itemsRes] = await Promise.all([
      quoteQuery.maybeSingle(),
      supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id)
        .order("position", { ascending: true }),
    ]);

    const quote = quoteRes.data;
    if (!quote) return null;

    return {
      quote,
      items: itemsRes.data || [],
    };
  } catch {
    return null;
  }
}

export async function createQuoteAction(data: {
  title: string;
  clientEmail?: string;
  clientId?: string;
  items: Array<{
    description: string;
    itemType: "LABOR" | "MATERIAL" | "EQUIPMENT" | "SERVICE" | "OTHER";
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    discountPercentage?: number;
  }>;
  notes?: string;
  termsAndConditions?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para criar propostas." };
  }

  const supabase = createAdminClient();

  if (!data.title || !data.items || data.items.length === 0) {
    return {
      success: false,
      error:
        "O orçamento deve ter um título e pelo menos uma linha de trabalho.",
    };
  }

  try {
    let resolvedUserId: string | null = null;

    if (data.clientId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.clientId);
      if (isUuid) {
        const { data: userById } = await supabase
          .from("users")
          .select("id")
          .eq("id", data.clientId)
          .maybeSingle();

        if (userById) {
          resolvedUserId = userById.id;
        } else {
          const { data: profileById } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", data.clientId)
            .maybeSingle();
          if (profileById?.user_id) {
            resolvedUserId = profileById.user_id;
          }
        }
      }
    }

    if (!resolvedUserId && data.clientEmail) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", data.clientEmail.trim().toLowerCase())
        .maybeSingle();

      if (userByEmail) {
        resolvedUserId = userByEmail.id;
      }
    }

    if (!resolvedUserId && data.clientEmail) {
      const email = data.clientEmail.trim().toLowerCase();
      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();

      if (!createError && createdUser) {
        resolvedUserId = createdUser.id;
        await supabase.from("profiles").insert({
          user_id: createdUser.id,
          name: email.split("@")[0],
          tax_number: "999999990",
        });
      }
    }

    if (!resolvedUserId) {
      return {
        success: false,
        error: "Cliente não encontrado para o orçamento. Indique um cliente ou email válido.",
      };
    }

    // Calcular totais com algoritmo standard de arredondamento de IVA português
    const calculated = calculateQuoteTotals({
      items: data.items.map((it, idx) => ({
        position: idx + 1,
        itemType: it.itemType,
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountPercentage: it.discountPercentage || 0,
        vatRate: it.vatRate,
      })),
    });

    let countQuery = supabase
      .from("quotes")
      .select("id", { count: "exact", head: true });

    if (user.companyId) {
      countQuery = countQuery.eq("company_id", user.companyId);
    }

    const countRes = await countQuery;
    const nextSeq = (countRes.count || 0) + 1;
    const year = new Date().getFullYear();
    const quoteNumber = `ORC-${year}-${String(nextSeq).padStart(3, "0")}`;

    const { data: newQuote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        quote_number: quoteNumber,
        title: data.title,
        client_id: resolvedUserId,
        company_id: user.companyId || null,
        status: "SENT",
        subtotal: calculated.subtotal,
        discount_percentage: calculated.discountPercentage,
        discount_amount: calculated.discountAmount,
        total_vat: calculated.totalVat,
        total: calculated.total,
        notes: data.notes || null,
        terms_and_conditions:
          data.termsAndConditions ||
          "Proposta válida por 30 dias. Pagamento conforme auto de medição.",
      })
      .select("id")
      .single();

    if (quoteError || !newQuote) {
      return {
        success: false,
        error: quoteError?.message || "Erro ao criar orçamento.",
      };
    }

    const itemsToInsert = calculated.items.map((it) => ({
      quote_id: newQuote.id,
      position: it.position,
      item_type: it.itemType,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      discount_percentage: it.discountPercentage,
      vat_rate: it.vatRate,
      net_amount: it.netAmount,
      vat_amount: it.vatAmount,
      total_amount: it.totalAmount,
    }));

    await supabase.from("quote_items").insert(itemsToInsert);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      company_id: user.companyId || null,
      action: "QUOTE_CREATED",
      module: "QUOTES",
      entity_type: "QUOTE",
      entity_id: newQuote.id,
      metadata: { quoteNumber, total: calculated.total },
    });

    revalidatePath("/orcamentos");
    revalidatePath("/dashboard");
    return { success: true, id: newQuote.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao gerar orçamento.",
    };
  }
}

export async function convertQuoteToProjectAction(
  quoteId: string,
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const supabase = createAdminClient();

  try {
    const { data: quote } = await supabase
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .single();

    if (!quote) return { success: false, error: "Orçamento não encontrado." };

    const countRes = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true });
    const nextSeq = (countRes.count || 0) + 1;
    const year = new Date().getFullYear();
    const code = `OBR-${year}-${String(nextSeq).padStart(3, "0")}`;

    const { data: newProject, error: projError } = await supabase
      .from("projects")
      .insert({
        code,
        title: quote.title,
        description: `Obra gerada automaticamente a partir do Orçamento ${quote.quote_number}`,
        client_id: quote.client_id,
        budget_estimated: quote.total,
        status: "IN_PROGRESS",
      })
      .select("id")
      .single();

    if (projError || !newProject) {
      return {
        success: false,
        error: projError?.message || "Erro ao criar obra.",
      };
    }

    // Atualizar orçamento para estado aceite e associado
    await supabase
      .from("quotes")
      .update({
        status: "CONVERTED_TO_PROJECT",
        converted_project_id: newProject.id,
      })
      .eq("id", quoteId);

    // Criar tarefas base baseadas nas linhas do orçamento
    if (quote.quote_items && quote.quote_items.length > 0) {
      const tasks = quote.quote_items.map((it: any) => ({
        project_id: newProject.id,
        title: it.description,
        status: "TODO",
        priority: "MEDIUM",
      }));
      await supabase.from("project_tasks").insert(tasks);
    }

    revalidatePath("/orcamentos");
    revalidatePath(`/orcamentos/${quoteId}`);
    revalidatePath("/obras");
    return { success: true, projectId: newProject.id };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Erro na conversão para obra.",
    };
  }
}

export async function respondToQuoteAction(
  quoteId: string,
  decision: "ACCEPTED" | "REJECTED",
  signerName: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  if (!signerName.trim()) {
    return { success: false, error: "O nome do responsável pela assinatura é obrigatório." };
  }

  try {
    const { data: quote } = await supabase
      .from("quotes")
      .select("quote_number, client_id")
      .eq("id", quoteId)
      .single();

    if (!quote) return { success: false, error: "Orçamento não encontrado." };

    await supabase
      .from("quotes")
      .update({
        status: decision,
        notes: notes ? `Decisão: ${decision} por ${signerName}. Obs: ${notes}` : `Decisão: ${decision} por ${signerName}.`,
      })
      .eq("id", quoteId);

    await supabase.from("audit_logs").insert({
      user_id: quote.client_id,
      action: decision === "ACCEPTED" ? "QUOTE_ACCEPTED" : "QUOTE_REJECTED",
      module: "QUOTES",
      entity_type: "QUOTE",
      entity_id: quoteId,
      metadata: { quoteNumber: quote.quote_number, signerName, decision },
    });

    revalidatePath(`/orcamentos/${quoteId}`);
    revalidatePath("/orcamentos");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao registar decisão." };
  }
}
