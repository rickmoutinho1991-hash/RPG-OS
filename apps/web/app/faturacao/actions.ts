"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  calculateInvoiceBalance,
  computePlatformFee,
  parseEuroToCents,
  resolveApplicableBasisPoints,
  SibsPaymentGatewayAdapter,
} from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function getInvoicesList(params?: {
  search?: string;
  status?: string;
}): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_type,
        status,
        issue_date,
        due_date,
        subtotal,
        tax_amount,
        total,
        amount_paid,
        balance_due,
        atcud,
        created_at,
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
    if (params?.search) {
      const s = params.search.trim();
      query = query.or(`invoice_number.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((inv: any) => {
      const profile = inv.users?.profiles;
      const clientName = Array.isArray(profile)
        ? profile[0]?.name
        : profile?.name;
      const clientTaxNumber = Array.isArray(profile)
        ? profile[0]?.tax_number
        : profile?.tax_number;

      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceType: inv.invoice_type,
        status: inv.status,
        clientName: clientName || inv.users?.email || "Cliente Geral",
        clientTaxNumber: clientTaxNumber || "Consumidor Final",
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.tax_amount),
        total: Number(inv.total),
        amountPaid: Number(inv.amount_paid || 0),
        balanceDue: Number(inv.balance_due ?? (inv.total - (inv.amount_paid || 0))),
        atcud: inv.atcud || "ATCUD-PENDING",
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        createdAt: inv.created_at,
      };
    });
  } catch (err) {
    console.error("[Faturação] Erro ao listar faturas:", err);
    return [];
  }
}

export async function getInvoiceById(id: string): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    let invQuery = supabase
      .from("invoices")
      .select(
        `
        *,
        users(id, email, profiles(name, phone, tax_number), addresses(*)),
        companies(legal_name, tax_number, email, phone)
      `,
      )
      .eq("id", id);

    if (user.companyId) {
      invQuery = invQuery.eq("company_id", user.companyId);
    }

    const [invoiceRes, itemsRes, paymentsRes] = await Promise.all([
      invQuery.maybeSingle(),
      supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id),
      supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", id)
        .order("paid_at", { ascending: false }),
    ]);

    const invoice = invoiceRes.data;
    if (!invoice) return null;

    return {
      invoice,
      items: itemsRes.data || [],
      payments: paymentsRes.data || [],
    };
  } catch (err) {
    console.error("[Faturação] Erro ao obter fatura por ID:", err);
    return null;
  }
}

export async function createInvoiceAction(data: {
  clientEmail?: string;
  clientId?: string;
  invoiceType: "FT" | "FS" | "FR" | "NC";
  items: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }>;
  notes?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para emitir faturas." };
  }

  if (!data.items || data.items.length === 0) {
    return { success: false, error: "A fatura deve conter pelo menos uma linha de produto/serviço." };
  }

  const supabase = createAdminClient();

  try {
    let resolvedClientId: string | null = null;

    // 1. Resolver o cliente
    if (data.clientId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.clientId);
      if (isUuid) {
        const { data: userById } = await supabase
          .from("users")
          .select("id")
          .eq("id", data.clientId)
          .maybeSingle();

        if (userById) {
          resolvedClientId = userById.id;
        } else {
          const { data: profileById } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", data.clientId)
            .maybeSingle();
          if (profileById?.user_id) {
            resolvedClientId = profileById.user_id;
          }
        }
      }
    }

    if (!resolvedClientId && data.clientEmail) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", data.clientEmail.trim().toLowerCase())
        .maybeSingle();

      if (userByEmail) {
        resolvedClientId = userByEmail.id;
      }
    }

    // Se ainda não existir, criar registo de utilizador consumidor
    if (!resolvedClientId && data.clientEmail) {
      const email = data.clientEmail.trim().toLowerCase();
      const { data: createdUser, error: createError } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();

      if (!createError && createdUser) {
        resolvedClientId = createdUser.id;
        await supabase.from("profiles").insert({
          user_id: createdUser.id,
          name: email.split("@")[0],
          tax_number: "999999990",
        });
      }
    }

    if (!resolvedClientId) {
      return { success: false, error: "Por favor indique um cliente ou email válido para a emissão da fatura." };
    }

    // 2. Cálculos fiscais no servidor com arredondamento estrito
    let subtotal = 0;
    let taxAmount = 0;

    const processedItems = data.items.map((it) => {
      const qty = Math.max(0, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.unitPrice) || 0);
      const rate = Number(it.vatRate) || 0;

      const itemNet = Math.round(qty * price * 100) / 100;
      const itemVat = Math.round(itemNet * (rate / 100) * 100) / 100;
      const itemTotal = Math.round((itemNet + itemVat) * 100) / 100;

      subtotal += itemNet;
      taxAmount += itemVat;

      return {
        description: it.description.trim(),
        unit: it.unit || "un",
        quantity: qty,
        unit_price: price,
        vat_rate: rate,
        vat_amount: itemVat,
        total_amount: itemTotal,
      };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const year = new Date().getFullYear();

    // Contagem da série para a empresa
    let countQuery = supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("invoice_type", data.invoiceType);

    if (user.companyId) {
      countQuery = countQuery.eq("company_id", user.companyId);
    }

    const countRes = await countQuery;
    const nextSeq = (countRes.count || 0) + 1;
    const invoiceNumber = `${data.invoiceType} ${year}/${String(nextSeq).padStart(3, "0")}`;
    const atcud = `0-ATCUD-${year}-${String(nextSeq).padStart(4, "0")}`;

    const isReceipt = data.invoiceType === "FR";

    const { data: newInvoice, error: invError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        invoice_type: data.invoiceType,
        status: isReceipt ? "PAID" : "ISSUED",
        client_id: resolvedClientId,
        company_id: user.companyId || null,
        subtotal,
        tax_amount: taxAmount,
        total,
        amount_paid: isReceipt ? total : 0,
        balance_due: isReceipt ? 0 : total,
        atcud,
        notes: data.notes || null,
      })
      .select("id")
      .single();

    if (invError || !newInvoice) {
      return {
        success: false,
        error: invError?.message || "Erro ao emitir fatura no sistema.",
      };
    }

    const invoiceItemsToInsert = processedItems.map((it) => ({
      invoice_id: newInvoice.id,
      ...it,
    }));

    await supabase.from("invoice_items").insert(invoiceItemsToInsert);

    // Registar pagamento automático se for Fatura-Recibo (FR)
    if (isReceipt) {
      const { data: frPayment } = await supabase
        .from("payments")
        .insert({
          invoice_id: newInvoice.id,
          client_id: resolvedClientId,
          amount: total,
          method: "BANK_TRANSFER",
          reference: invoiceNumber,
          status: "COMPLETED",
        })
        .select("id")
        .single();

      // Fee RPG-OS: uma FR = valor económico real (pago na emissão) e entra
      // no ledger com as mesmas garantias dos restantes pagamentos.
      if (frPayment?.id && user.companyId) {
        try {
          await accruePlatformFeeForPayment(supabase, {
            actorId: user.id,
            paymentId: String(frPayment.id),
            amount: total,
            invoiceId: String(newInvoice.id),
            companyId: String(user.companyId),
            quoteId: null,
            projectId: null,
          });
        } catch {
          // Ledger reconstruível a partir de payments; não bloqueia a FR.
        }
      }
    }

    // e-Fatura: sem integração oficial com a AT, NÃO existe comunicação.
    // A fatura é válida apenas localmente; a comunicação oficial faz-se
    // manualmente no Portal das Finanças. (Hardening: removida chamada que
    // fabricava registrationNumber.)

    // Projeção fiscal (read model): invoice -> routing explícito -> inbox.
    // Falhas de projeção NUNCA bloqueiam a emissão; NO_ROUTE é normal.
    try {
      const { getSessionContext } = await import("@/lib/session");
      const { produceFiscalInboxForInvoice } = await import("@/lib/fiscal/inboxProducer");
      const session = await getSessionContext();
      if (session) {
        const memberOrgIds = new Set<string>();
        if (session.organization?.id) memberOrgIds.add(session.organization.id);
        for (const o of session.availableOrganizations ?? []) {
          if (o?.id) memberOrgIds.add(o.id);
        }
        await produceFiscalInboxForInvoice(String(newInvoice.id), {
          userId: user.id,
          companyId: user.companyId ?? null,
          permissions: session.permissions,
          memberOrgIds: [...memberOrgIds],
        });
      }
    } catch (err) {
      console.error("[Fiscal] Inbox projection failed (invoice kept):", err);
    }

    // AUDIT → SANITIZE → AUDIT LOG → INTEGRITY HASH (lib/audit)
    await recordAuditEvent({
      userId: user.id,
      companyId: user.companyId || null,
      action: "INVOICE_ISSUED",
      module: "INVOICING",
      entityType: "INVOICE",
      entityId: newInvoice.id,
      metadata: { invoiceNumber, total, atcud, type: data.invoiceType },
    });

    revalidatePath("/faturacao");
    revalidatePath("/dashboard");
    revalidatePath("/contabilidade");
    return { success: true, id: newInvoice.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro na emissão de fatura.",
    };
  }
}

export async function registerPaymentAction(
  invoiceId: string,
  amount: number,
  method: "MULTIBANCO" | "MBWAY" | "BANK_TRANSFER" | "CASH" | "CREDIT_CARD",
): Promise<{ success: boolean; error?: string }> {
  // Alteração financeira sensível: exige sessão válida server-side.
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Inicie sessão para continuar." };

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Montante de pagamento inválido." };
  }

  const supabase = createAdminClient();

  try {
    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (!inv) return { success: false, error: "Fatura não encontrada." };

    // ── Autorização cross-tenant ───────────────────────────────────────
    // Só pode registar pagamento nesta fatura quem é o cliente pagador
    // (inv.client_id) ou colaborador ACTIVE da empresa emissora.
    const invCompanyId = inv.company_id ? String(inv.company_id) : null;
    const isClientOfInvoice = String(inv.client_id) === String(user.id);
    let isEmployeeOfCompany = false;
    if (!isClientOfInvoice && invCompanyId) {
      const { data: emp } = await supabase
        .from("company_employees")
        .select("id")
        .eq("company_id", invCompanyId)
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      isEmployeeOfCompany = Boolean(emp);
    }
    if (!isClientOfInvoice && !isEmployeeOfCompany) {
      return {
        success: false,
        error: "Não tem autorização para registar pagamentos nesta fatura.",
      };
    }

    const newAmountPaid = Number(inv.amount_paid || 0) + amount;
    const balance = calculateInvoiceBalance(Number(inv.total), newAmountPaid);

    const { data: paymentRow } = await supabase
      .from("payments")
      .insert({
        invoice_id: invoiceId,
        client_id: inv.client_id,
        amount,
        method,
        status: "COMPLETED",
      })
      .select("id")
      .single();

    await supabase
      .from("invoices")
      .update({
        amount_paid: newAmountPaid,
        balance_due: balance.balanceDue,
        status: balance.isPaid ? "PAID" : "PARTIALLY_PAID",
      })
      .eq("id", invoiceId);

    // ── Fee RPG-OS (modelo de sucesso) ────────────────────────────────
    // Recalculada SERVER-SIDE a partir dos dados persistidos; o cliente
    // não fornece taxa nem valores. Idempotente por unique(source_type,
    // source_id): uma fee por pagamento, nunca cobrança duplicada.
    if (paymentRow?.id && inv.company_id) {
      try {
        await accruePlatformFeeForPayment(supabase, {
          actorId: user.id,
          paymentId: String(paymentRow.id),
          amount,
          invoiceId,
          companyId: String(inv.company_id),
          quoteId: inv.quote_id ? String(inv.quote_id) : null,
          projectId: inv.project_id ? String(inv.project_id) : null,
        });
      } catch {
        // Falha da fee NÃO desfaz o pagamento já registado; o ledger é
        // reconstruível a partir dos pagamentos existentes.
      }
    }

    revalidatePath(`/faturacao/${invoiceId}`);
    revalidatePath("/faturacao");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao registar pagamento.",
    };
  }
}
/**
 * Registo idempotente da fee RPG-OS para um pagamento concretizado.
 * Segurança:
 *  - taxa resolvida da BD (platform_fee_config, empresa → global → 0),
 *    NUNCA do cliente;
 *  - montante convertido em centavos de forma exata (sem floating point);
 *  - duplicação impossível: unique(source_type='PAYMENT', source_id) na BD —
 *    duas chamadas concorrentes produzem no máximo UMA row (23505 ignorado);
 *  - snapshot imutável: bruto/taxa/fee/líquido fixados no momento da accrual.
 * Falha de accrual não invalida o pagamento (chamador trata).
 */
async function accruePlatformFeeForPayment(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    actorId: string;
    paymentId: string;
    amount: number;
    invoiceId: string;
    companyId: string;
    quoteId: string | null;
    projectId: string | null;
  },
): Promise<void> {
  const grossCents = parseEuroToCents(input.amount);
  if (grossCents === null || grossCents <= 0) return;

  // Taxa efetiva a partir da configuração persistida (empresa > global > 0).
  const { data: configs } = await supabase
    .from("platform_fee_config")
    .select("company_id, basis_points, is_active")
    .eq("is_active", true)
    .or(
      `company_id.is.null,company_id.eq.${input.companyId}`,
    );
  const basisPoints = resolveApplicableBasisPoints(
    (configs ?? []).map((c) => ({
      companyId: c.company_id === null ? null : String(c.company_id),
      basisPoints: Number(c.basis_points ?? 0),
      isActive: true,
    })),
    input.companyId,
  );

  const computation = computePlatformFee({ grossCents, basisPoints });

  const { data: feeRow, error: feeError } = await supabase
    .from("platform_fees")
    .insert({
      company_id: input.companyId,
      source_type: "PAYMENT",
      source_id: input.paymentId,
      invoice_id: input.invoiceId,
      project_id: input.projectId,
      quote_id: input.quoteId,
      gross_cents: computation.grossCents,
      basis_points: computation.basisPoints,
      fee_cents: computation.feeCents,
      net_cents: computation.netCents,
      status: "ACCRUED",
      metadata: { registeredBy: input.actorId },
    })
    .select("id")
    .single();

  // Conflito de unique = fee já registada para este pagamento: idempotente.
  if (feeError && feeError.code !== "23505") {
    throw new Error(feeError.message);
  }

  if (!feeError && feeRow) {
    await supabase.from("audit_logs").insert({
      user_id: input.actorId,
      action: "PLATFORM_FEE_ACCRUED",
      module: "BILLING",
      entity_type: "PAYMENT",
      entity_id: input.paymentId,
      metadata: {
        platformFeeId: String(feeRow.id),
        sourceType: "PAYMENT",
        sourceId: input.paymentId,
        invoiceId: input.invoiceId,
        companyId: input.companyId,
        ...computation,
      },
    });
  }
}

export async function generateMbReferenceAction(
  amount: number,
  invoiceId: string,
): Promise<{
  entity: string;
  reference: string;
  amount: number;
  expiresAt: string;
}> {
  const gateway = new SibsPaymentGatewayAdapter({ entityCode: "21550" });
  return gateway.generateMultibancoReference(amount, invoiceId);
}

export async function exportSaftXmlAction(): Promise<{
  xml: string;
  filename: string;
}> {
  // HARDENING (integridade SAF-T): nunca gerar XML com dados hardcoded.
  // Fonte first-party: companies (legal_name + tax_number), com scope
  // explícito pela empresa da sessão. Sem companyId não há scope possível.
  const user = await getCurrentUser();
  if (!user?.companyId) {
    throw new Error(
      "Exportação SAF-T indisponível: sem empresa associada à sessão. " +
        "Nenhum ficheiro foi gerado.",
    );
  }
  const supabase = createAdminClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("legal_name,tax_number")
    .eq("id", user.companyId)
    .maybeSingle();
  if (error || !company?.legal_name || !company?.tax_number) {
    throw new Error(
      "Exportação SAF-T indisponível: dados fiscais da empresa incompletos " +
        "(nome/NIF). Nenhum ficheiro foi gerado e nada foi comunicado à AT.",
    );
  }
  // A morada fiscal da empresa não existe em nenhuma fonte first-party
  // (companies não tem address_id). Um SAF-T sem morada seria inválido para
  // a AT — em vez de inventar, falhar explicitamente (export ≠ submission).
  throw new Error(
    "Exportação SAF-T indisponível: morada fiscal da empresa não registada. " +
      "Complete os dados da empresa antes de exportar. " +
      "Nenhum ficheiro foi gerado e nada foi comunicado à AT.",
  );
}
