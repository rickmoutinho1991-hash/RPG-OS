
"use server";

import {
  PortugueseTaxObligation,
  calculateSocialSecurity,
  SocialSecurityContributionCalculation,
  hasPermission,
} from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getSessionContext } from "@/lib/session";

export async function getTaxObligationsList(): Promise<
  PortugueseTaxObligation[]
> {
  // Mesmo padrão da Vida: sessão → permissão → só depois dados.
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "fiscal.view")) {
    return [];
  }
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.floor((now.getMonth() + 3) / 3);

  if (!user) {
    return [];
  }

  try {
    // 1. Procurar obrigações fiscais personalizadas registadas
    let query = supabase
      .from("fiscal_obligations")
      .select("*")
      .order("due_date", { ascending: true });

    if (user.companyId) {
      query = query.or(`company_id.eq.${user.companyId},user_id.eq.${user.id}`);
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data: customObligations } = await query;

    if (customObligations && customObligations.length > 0) {
      return customObligations.map((o: any) => ({
        id: o.id,
        code: o.code,
        title: o.title,
        category: o.category,
        dueDate: o.due_date,
        status: o.status,
        period: o.period,
        estimatedAmount: o.estimated_amount ? Number(o.estimated_amount) : undefined,
        paymentReference: o.payment_reference || undefined,
      }));
    }

    // 2. Calcular obrigações fiscais e prazos regulamentares da AT para o período corrente com base em faturas reais
    // HIGH-1: invoices não tem user_id — sem companyId válido não existe
    // scope possível, por isso a query NÃO é executada (nunca global via service_role).
    let invoices: Array<{ tax_amount?: number | string | null }> = [];
    if (user.companyId) {
      const { data } = await supabase
        .from("invoices")
        .select("subtotal, tax_amount, total")
        .neq("status", "CANCELLED")
        .eq("company_id", user.companyId);
      invoices = data ?? [];
    }
    const totalTax = (invoices || []).reduce((s, i) => s + Number(i.tax_amount || 0), 0);

    // Próximas datas limites do calendário fiscal oficial português
    const vatQuarterDueMonth = currentQuarter === 1 ? 5 : currentQuarter === 2 ? 8 : currentQuarter === 3 ? 11 : 2;
    const vatQuarterDueYear = currentQuarter === 4 ? currentYear + 1 : currentYear;
    const vatDueDate = `${vatQuarterDueYear}-${String(vatQuarterDueMonth).padStart(2, "0")}-20`;

    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const saftDueDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-05`;
    const tsuDueDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-20`;

    const dynamicObligations: PortugueseTaxObligation[] = [
      {
        id: `tax_iva_${currentYear}_q${currentQuarter}`,
        code: `IVA-Q${currentQuarter}-${currentYear}`,
        title: `Declaração Periódica de IVA (${currentQuarter}.º Trimestre)`,
        category: "IVA",
        dueDate: vatDueDate,
        status: "PENDING",
        period: `${currentYear}-Q${currentQuarter}`,
        estimatedAmount: totalTax > 0 ? Number(totalTax.toFixed(2)) : undefined,
      },
      {
        id: `tax_saft_${currentYear}_m${currentMonth}`,
        code: `SAFT-${currentYear}-${String(currentMonth).padStart(2, "0")}`,
        title: "Comunicação Mensal de Faturação SAF-T (e-Fatura)",
        category: "SAFT",
        dueDate: saftDueDate,
        status: "PENDING",
        period: `${currentYear}-${String(currentMonth).padStart(2, "0")}`,
      },
      {
        id: `tax_tsu_${currentYear}_m${currentMonth}`,
        code: `TSU-${currentYear}-${String(currentMonth).padStart(2, "0")}`,
        title: "Declaração Mensal de Remunerações & Guia TSU",
        category: "SEG_SOCIAL",
        dueDate: tsuDueDate,
        status: "PENDING",
        period: `${currentYear}-${String(currentMonth).padStart(2, "0")}`,
      },
      {
        id: `tax_irs_${currentYear}`,
        code: `IRS-${currentYear}`,
        title: "Declaração de Rendimentos IRS Modelo 3",
        category: "IRS",
        dueDate: `${currentYear}-06-30`,
        status: "PENDING",
        period: String(currentYear - 1),
      },
    ];

    return dynamicObligations;
  } catch (err) {
    console.error("[Fiscal] Erro ao carregar obrigações fiscais:", err);
    return [];
  }
}

export async function calculateTsuAction(data: {
  taxpayerType: "EMPLOYEE" | "EMPLOYER" | "SOLE_TRADER_RECIBOS_VERDES";
  amount: number;
}): Promise<SocialSecurityContributionCalculation> {
  return calculateSocialSecurity({
    taxpayerType: data.taxpayerType,
    amount: data.amount,
  });
}
