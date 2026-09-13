"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  type VatSettlementPeriod,
} from "@rpg/core";

export async function getAccountingOverview(): Promise<{
  vatPeriod: VatSettlementPeriod;
  incomeTotal: number;
  expensesTotal: number;
  netIncome: number;
  withholdingTaxTotal: number;
  hasRealData: boolean;
}> {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  const now = new Date();
  const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
  const currentYear = now.getFullYear();
  const periodLabel = `${currentQuarter}.º Trimestre ${currentYear}`;

  if (!user) {
    return {
      vatPeriod: {
        periodLabel,
        vatCollected23: 0,
        vatCollected13: 0,
        vatCollected6: 0,
        totalVatCollected: 0,
        vatDeductible23: 0,
        vatDeductible13: 0,
        vatDeductible6: 0,
        totalVatDeductible: 0,
        netVatPayable: 0,
      },
      incomeTotal: 0,
      expensesTotal: 0,
      netIncome: 0,
      withholdingTaxTotal: 0,
      hasRealData: false,
    };
  }

  try {
    // 1. Obter faturas emitidas da empresa/utilizador autenticado
    let invQuery = supabase
      .from("invoices")
      .select("id, subtotal, tax_amount, total, status, invoice_type")
      .neq("status", "CANCELLED");

    if (user.companyId) {
      invQuery = invQuery.eq("company_id", user.companyId);
    }

    const { data: invoices, error: invError } = await invQuery;
    if (invError) {
      console.error("[Contabilidade] Erro ao carregar faturas:", invError);
    }

    const invList = invoices ?? [];

    // Proveitos reais: soma dos subtotais (faturas emitidas excluindo notas de crédito que abatem)
    let incomeTotal = 0;
    let vatCollected = 0;

    for (const inv of invList) {
      const sub = Number(inv.subtotal ?? 0);
      const tax = Number(inv.tax_amount ?? 0);
      if (inv.invoice_type === "NC") {
        incomeTotal -= sub;
        vatCollected -= tax;
      } else {
        incomeTotal += sub;
        vatCollected += tax;
      }
    }

    // Calcular IVA liquidado por taxa a partir das linhas de fatura reais
    const vatByRate = { 23: 0, 13: 0, 6: 0, 0: 0 };
    const invoiceIds = invList.map((i) => i.id);

    if (invoiceIds.length > 0) {
      const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select("vat_rate, vat_amount, invoice_id")
        .in("invoice_id", invoiceIds);

      if (invoiceItems) {
        invoiceItems.forEach((item: any) => {
          const rate = Math.round(Number(item.vat_rate));
          const amt = Number(item.vat_amount ?? 0);
          if (rate in vatByRate) {
            vatByRate[rate as keyof typeof vatByRate] += amt;
          }
        });
      }
    }

    // 2. Obter despesas e compras reais da tabela expenses
    let expQuery = supabase
      .from("expenses")
      .select("subtotal, vat_rate, vat_amount, total, withholding_tax_amount")
      .neq("status", "CANCELLED");

    if (user.companyId) {
      expQuery = expQuery.eq("company_id", user.companyId);
    } else {
      expQuery = expQuery.eq("user_id", user.id);
    }

    const { data: expensesList } = await expQuery;
    const expenses = expensesList ?? [];

    let expensesTotal = 0;
    let vatDeductibleTotal = 0;
    let vatDeductible23 = 0;
    let vatDeductible13 = 0;
    let vatDeductible6 = 0;
    let withholdingTaxTotal = 0;

    for (const exp of expenses) {
      const sub = Number(exp.subtotal ?? 0);
      const vat = Number(exp.vat_amount ?? 0);
      const rate = Math.round(Number(exp.vat_rate ?? 23));
      const withTax = Number(exp.withholding_tax_amount ?? 0);

      expensesTotal += sub;
      vatDeductibleTotal += vat;
      withholdingTaxTotal += withTax;

      if (rate === 23) vatDeductible23 += vat;
      else if (rate === 13) vatDeductible13 += vat;
      else if (rate === 6) vatDeductible6 += vat;
    }

    // Resultado Líquido = Proveitos - Despesas Reais
    const netIncome = incomeTotal - expensesTotal;
    const netVatPayable = vatCollected - vatDeductibleTotal;
    const hasRealData = invList.length > 0 || expenses.length > 0;

    const vatPeriod: VatSettlementPeriod = {
      periodLabel,
      vatCollected23: Number(vatByRate[23].toFixed(2)),
      vatCollected13: Number(vatByRate[13].toFixed(2)),
      vatCollected6: Number(vatByRate[6].toFixed(2)),
      totalVatCollected: Number(vatCollected.toFixed(2)),
      vatDeductible23: Number(vatDeductible23.toFixed(2)),
      vatDeductible13: Number(vatDeductible13.toFixed(2)),
      vatDeductible6: Number(vatDeductible6.toFixed(2)),
      totalVatDeductible: Number(vatDeductibleTotal.toFixed(2)),
      netVatPayable: Number(netVatPayable.toFixed(2)),
    };

    return {
      vatPeriod,
      incomeTotal: Number(incomeTotal.toFixed(2)),
      expensesTotal: Number(expensesTotal.toFixed(2)),
      netIncome: Number(netIncome.toFixed(2)),
      withholdingTaxTotal: Number(withholdingTaxTotal.toFixed(2)),
      hasRealData,
    };
  } catch (error) {
    console.error("[Contabilidade] Falha ao obter dados contabilísticos:", error);
    return {
      vatPeriod: {
        periodLabel,
        vatCollected23: 0,
        vatCollected13: 0,
        vatCollected6: 0,
        totalVatCollected: 0,
        vatDeductible23: 0,
        vatDeductible13: 0,
        vatDeductible6: 0,
        totalVatDeductible: 0,
        netVatPayable: 0,
      },
      incomeTotal: 0,
      expensesTotal: 0,
      netIncome: 0,
      withholdingTaxTotal: 0,
      hasRealData: false,
    };
  }
}
