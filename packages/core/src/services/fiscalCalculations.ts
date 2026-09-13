import {
  SocialSecurityContributionCalculation,
  VatSettlementPeriod,
} from "../types/fiscal";

/**
 * Calcula contribuições para a Segurança Social Portuguesa (TSU ou Trabalhador Independente)
 */
export function calculateSocialSecurity(input: {
  taxpayerType: "EMPLOYEE" | "EMPLOYER" | "SOLE_TRADER_RECIBOS_VERDES";
  amount: number;
}): SocialSecurityContributionCalculation {
  const gross = Math.max(0, input.amount);

  if (input.taxpayerType === "SOLE_TRADER_RECIBOS_VERDES") {
    // Rendimento relevante = 70% dos serviços prestados (Art. 162.º do Código dos Regimes Contributivos)
    const baseIncidencia = gross * 0.7;
    const soleTraderAmount = Math.round(baseIncidencia * 0.214 * 100) / 100;

    return {
      taxpayerType: input.taxpayerType,
      grossSalaryOrRevenue: gross,
      employerTsuPercentage: 0,
      employeeTsuPercentage: 0,
      soleTraderTsuPercentage: 21.4,
      employerAmount: 0,
      employeeAmount: 0,
      totalSocialSecurityDue: soleTraderAmount,
    };
  }

  // Trabalho Dependente / Remunerações de Quadros e Colaboradores
  const employerAmount = Math.round(gross * 0.2375 * 100) / 100;
  const employeeAmount = Math.round(gross * 0.11 * 100) / 100;
  const total = Math.round((employerAmount + employeeAmount) * 100) / 100;
  const netSalary = Math.round((gross - employeeAmount) * 100) / 100;

  return {
    taxpayerType: input.taxpayerType,
    grossSalaryOrRevenue: gross,
    employerTsuPercentage: 23.75,
    employeeTsuPercentage: 11.0,
    soleTraderTsuPercentage: 0,
    employerAmount,
    employeeAmount,
    totalSocialSecurityDue: total,
    netSalaryCalculated: netSalary,
  };
}

/**
 * Apuramento periódico de IVA (Liquidado vs Dedutível)
 */
export function calculateVatSettlement(input: {
  periodLabel: string;
  invoicesIssued: Array<{ netAmount: number; vatRate: number }>;
  expensesIncurred: Array<{ netAmount: number; vatRate: number }>;
}): VatSettlementPeriod {
  let col23 = 0,
    col13 = 0,
    col6 = 0;
  let ded23 = 0,
    ded13 = 0,
    ded6 = 0;

  for (const inv of input.invoicesIssued) {
    const vat = inv.netAmount * (inv.vatRate / 100);
    if (inv.vatRate === 23) col23 += vat;
    else if (inv.vatRate === 13) col13 += vat;
    else if (inv.vatRate === 6) col6 += vat;
  }

  for (const exp of input.expensesIncurred) {
    const vat = exp.netAmount * (exp.vatRate / 100);
    if (exp.vatRate === 23) ded23 += vat;
    else if (exp.vatRate === 13) ded13 += vat;
    else if (exp.vatRate === 6) ded6 += vat;
  }

  const totalCollected = Math.round((col23 + col13 + col6) * 100) / 100;
  const totalDeductible = Math.round((ded23 + ded13 + ded6) * 100) / 100;
  const netVatPayable =
    Math.round((totalCollected - totalDeductible) * 100) / 100;

  return {
    periodLabel: input.periodLabel,
    vatCollected23: Math.round(col23 * 100) / 100,
    vatCollected13: Math.round(col13 * 100) / 100,
    vatCollected6: Math.round(col6 * 100) / 100,
    totalVatCollected: totalCollected,
    vatDeductible23: Math.round(ded23 * 100) / 100,
    vatDeductible13: Math.round(ded13 * 100) / 100,
    vatDeductible6: Math.round(ded6 * 100) / 100,
    totalVatDeductible: totalDeductible,
    netVatPayable,
  };
}
