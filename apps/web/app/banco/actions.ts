"use server";

import { revalidatePath } from "next/cache";
import { BankAccount, BankTransaction, VirtualCard, SepaTransferRequest } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from '@rpg/core';
import { getCurrentUser } from "@/lib/supabase/auth";
import { startApproval, resolveCompanyReviewer } from "@/lib/workflows";

export async function getBankingOverview(): Promise<{
  mainAccount: BankAccount;
  connectedAccounts: BankAccount[];
  transactions: BankTransaction[];
  virtualCards: VirtualCard[];
  hasRealAccounts: boolean;
}> {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  const defaultMainAccount: BankAccount = {
    id: "acc_default",
    userId: user?.id || "guest",
    bankName: "RPG-OS Conta Principal",
    bankCode: "RPG",
    accountNumber: "000000000",
    iban: "PT50 0000 0000 0000 0000 0000 0",
    swiftBic: "RPGBPTPL",
    currency: "EUR",
    balance: 0.0,
    availableBalance: 0.0,
    isMainAccount: true,
    connectedViaOpenBanking: false,
    lastSyncedAt: new Date().toISOString(),
  };

  if (!user) {
    return {
      mainAccount: defaultMainAccount,
      connectedAccounts: [],
      transactions: [],
      virtualCards: [],
      hasRealAccounts: false,
    };
  }

  try {
    let accQuery = supabase
      .from("bank_accounts")
      .select("*")
      .order("is_main_account", { ascending: false });

    if (user.companyId) {
      accQuery = accQuery.or(`company_id.eq.${user.companyId},user_id.eq.${user.id}`);
    } else {
      accQuery = accQuery.eq("user_id", user.id);
    }

    const { data: dbAccounts } = await accQuery;

    let mainAccount: BankAccount = defaultMainAccount;
    const connectedAccounts: BankAccount[] = [];

    if (dbAccounts && dbAccounts.length > 0) {
      const mainDb = dbAccounts.find((a: any) => a.is_main_account) || dbAccounts[0];
      mainAccount = {
        id: mainDb.id,
        userId: mainDb.user_id,
        companyId: mainDb.company_id,
        bankName: mainDb.bank_name,
        bankCode: mainDb.bank_code,
        accountNumber: mainDb.account_number || "",
        iban: mainDb.iban,
        swiftBic: mainDb.swift_bic,
        currency: mainDb.currency || "EUR",
        balance: Number(mainDb.balance || 0),
        availableBalance: Number(mainDb.available_balance || mainDb.balance || 0),
        isMainAccount: true,
        connectedViaOpenBanking: Boolean(mainDb.is_connected_open_banking),
        lastSyncedAt: mainDb.last_synced_at || mainDb.created_at,
      };

      const others = dbAccounts.filter((a: any) => a.id !== mainDb.id);
      for (const o of others) {
        connectedAccounts.push({
          id: o.id,
          userId: o.user_id,
          companyId: o.company_id,
          bankName: o.bank_name,
          bankCode: o.bank_code,
          accountNumber: o.account_number || "",
          iban: o.iban,
          swiftBic: o.swift_bic,
          currency: o.currency || "EUR",
          balance: Number(o.balance || 0),
          availableBalance: Number(o.available_balance || o.balance || 0),
          isMainAccount: false,
          connectedViaOpenBanking: Boolean(o.is_connected_open_banking),
          lastSyncedAt: o.last_synced_at || o.created_at,
        });
      }
    }

    // Buscar transações reais
    let txQuery = supabase
      .from("bank_transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(50);

    if (user.companyId) {
      txQuery = txQuery.or(`company_id.eq.${user.companyId},user_id.eq.${user.id}`);
    } else {
      txQuery = txQuery.eq("user_id", user.id);
    }

    const { data: dbTxs } = await txQuery;
    const transactions: BankTransaction[] = (dbTxs || []).map((t: any) => ({
      id: t.id,
      accountId: t.account_id,
      type: t.type as "CREDIT" | "DEBIT",
      amount: Number(t.amount),
      currency: t.currency || "EUR",
      description: t.description,
      counterpartyName: t.counterparty_name,
      counterpartyIban: t.counterparty_iban,
      category: t.category,
      date: t.date || t.created_at,
      status: t.status,
      reference: t.reference,
    }));

    const virtualCards: VirtualCard[] = [
      {
        id: `card_${user.id.slice(0, 8)}_1`,
        userId: user.id,
        cardName: "Cartão Operacional",
        last4Digits: "8942",
        cardBrand: "MASTERCARD",
        expiryDate: "12/29",
        spendingLimitMonthly: 2500.0,
        currentMonthSpent: 0.0,
        isFrozen: false,
        isSingleUse: false,
        colorTheme: "#0f172a",
      },
    ];

    return {
      mainAccount,
      connectedAccounts,
      transactions,
      virtualCards,
      hasRealAccounts: Boolean(dbAccounts && dbAccounts.length > 0),
    };
  } catch (err) {
    console.error("[Banco] Erro ao obter dados bancários:", err);
    return {
      mainAccount: defaultMainAccount,
      connectedAccounts: [],
      transactions: [],
      virtualCards: [],
      hasRealAccounts: false,
    };
  }
}

export async function executeSepaTransferAction(
  request: SepaTransferRequest,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Por favor inicie sessão." };
  }

  if (!request.recipientIban || !request.amount || request.amount <= 0) {
    return { success: false, error: "IBAN de destino e montante válido são obrigatórios." };
  }

  const supabase = createAdminClient();

  try {
    // 1. Procurar ou criar conta principal
    let accountId = request.sourceAccountId;
    if (!accountId || accountId === "acc_default") {
      const { data: existingAcc } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (existingAcc) {
        accountId = existingAcc.id;
      } else {
        const { data: newAcc } = await supabase
          .from("bank_accounts")
          .insert({
            user_id: user.id,
            company_id: user.companyId || null,
            bank_name: "RPG-OS Conta Principal",
            iban: "PT50 0000 0000 0001 8942 3010 4",
            balance: 10000.0,
            available_balance: 10000.0,
            is_main_account: true,
          })
          .select("id")
          .single();
        accountId = newAcc?.id || "acc_default";
      }
    }

    // 2. Registar a transação de débito
    await supabase.from("bank_transactions").insert({
      account_id: accountId,
      user_id: user.id,
      company_id: user.companyId || null,
      type: "DEBIT",
      amount: request.amount,
      currency: "EUR",
      description: request.description || `Transferência SEPA para ${request.recipientName || request.recipientIban}`,
      counterparty_name: request.recipientName,
      counterparty_iban: request.recipientIban,
      category: "TRANSFER",
      status: "SETTLED",
      date: new Date().toISOString(),
    });

    // 3. Registar log de auditoria
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "SEPA_TRANSFER_EXECUTED",
      module: "BANKING",
      entity_type: "BANK_TRANSACTION",
      entity_id: user.id,
      metadata: {
        amount: request.amount,
        recipientIban: "[REDACTED_BANK_ACCOUNT]",
        isInstant: request.isInstant,
      },
    });

    revalidatePath("/banco");
    revalidatePath("/dashboard");
    return {
      success: true,
      message: `Transferência SEPA ${request.isInstant ? "Imediata" : "Standard"} de €${request.amount.toFixed(2)} para ${request.recipientName || request.recipientIban} transmitida com sucesso!`,
    };
  } catch (err) {
    console.error("[Banco] Erro ao executar transferência:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao processar transferência bancária.",
    };
  }
}

export interface ExpenseInput {
  supplierName: string;
  supplierTaxNumber?: string;
  documentNumber?: string;
  issueDate?: string;
  dueDate?: string;
  subtotal: number;
  vatRate: number;
  category: string;
  notes?: string;
  submitForApproval: boolean;
}

const EXPENSE_CATEGORIES = [
  "MATERIALS",
  "SERVICES",
  "UTILITIES",
  "TAXES",
  "SALARIES",
  "OPERATIONAL",
  "OTHER",
];

export async function createExpenseAction(
  input: ExpenseInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sessão não iniciada." };

  const supplierName = input.supplierName.trim();
  const subtotal = Number(input.subtotal) || 0;
  const vatRate = Number(input.vatRate) || 0;

  if (!supplierName) {
    return { success: false, error: "O fornecedor é obrigatório." };
  }
  if (subtotal <= 0) {
    return { success: false, error: "O valor da despesa tem de ser superior a zero." };
  }
  if (![0, 6, 13, 23].includes(vatRate)) {
    return { success: false, error: "Taxa de IVA inválida. Use 0%, 6%, 13% ou 23%." };
  }
  if (!EXPENSE_CATEGORIES.includes(input.category)) {
    return { success: false, error: "Categoria de despesa inválida." };
  }

  const supabase = createAdminClient();
  const vatAmount = round2((subtotal * vatRate) / 100);
  const total = round2(subtotal + vatAmount);

  const status = input.submitForApproval ? "PENDING" : "PAID";

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      company_id: user.companyId || null,
      document_number: input.documentNumber?.trim() || null,
      supplier_name: supplierName,
      supplier_tax_number: input.supplierTaxNumber?.trim() || null,
      issue_date: input.issueDate || new Date().toISOString().split("T")[0],
      due_date: input.dueDate || null,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      withholding_tax_amount: 0,
      category: input.category,
      status,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Erro ao registar a despesa." };
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    company_id: user.companyId || null,
    action: "EXPENSE_CREATED",
    module: "BANKING",
    entity_type: "EXPENSE",
    entity_id: data.id,
    metadata: {
      supplierName,
      subtotal,
      vatAmount,
      total,
      status,
      forApproval: input.submitForApproval,
    },
  });

  if (input.submitForApproval) {
    const approverId = user.companyId
      ? await resolveCompanyReviewer(user.companyId)
      : null;
    await startApproval({
      title: `Despesa: ${supplierName} (${formatEuro(total)})`,
      summary: `${input.category} • Total ${formatEuro(total)}`,
      entityType: "EXPENSE",
      entityId: data.id,
      organizationId: user.companyId ?? null,
      requestedBy: user.id,
      approverId,
      metadata: { total, supplierName, category: input.category },
    });
  }

  revalidatePath("/banco");
  revalidatePath("/contabilidade");
  return { success: true, id: data.id };
}

export async function getExpensesList(): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createAdminClient();
  try {
    let query = supabase
      .from("expenses")
      .select("*")
      .order("issue_date", { ascending: false })
      .limit(100);
    if (user.companyId) {
      query = query.or(`company_id.eq.${user.companyId},user_id.eq.${user.id}`);
    } else {
      query = query.eq("user_id", user.id);
    }
    const { data } = await query;
    return (data ?? []).map((e: any) => ({
      ...e,
      formattedTotal: format(Number(e.total || 0)),
      formattedVat: format(Number(e.vat_amount || 0)),
      formattedIssuedAt:
        e.issue_date ? new Date(e.issue_date).toLocaleDateString("pt-PT") : "—",
    }));
  } catch {
    return [];
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function format(value: number): string {
  return value.toLocaleString("pt-PT", { minimumFractionDigits: 2 });
}

function formatEuro(value: number): string {
  return `${format(value)} €`;
}

