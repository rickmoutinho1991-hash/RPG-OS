export interface PortugueseTaxObligation {
  id: string;
  code: string;
  title: string;
  category: "IVA" | "IRS" | "IRC" | "SEG_SOCIAL" | "IES" | "SAFT";
  dueDate: string;
  status: "PENDING" | "SUBMITTED" | "PAID" | "EXEMPT";
  estimatedAmount?: number;
  period: string; // "2026-Q1", "2026-03", "2025"
  notes?: string;
  paymentReference?: string;
}

export interface SocialSecurityContributionCalculation {
  taxpayerType: "EMPLOYEE" | "EMPLOYER" | "SOLE_TRADER_RECIBOS_VERDES";
  grossSalaryOrRevenue: number;
  employerTsuPercentage: number; // 23.75%
  employeeTsuPercentage: number; // 11.00%
  soleTraderTsuPercentage: number; // 21.40% (base incidência 70% da prestação de serviços)
  employerAmount: number;
  employeeAmount: number;
  totalSocialSecurityDue: number;
  netSalaryCalculated?: number;
}

export interface VatSettlementPeriod {
  periodLabel: string;
  vatCollected23: number;
  vatCollected13: number;
  vatCollected6: number;
  totalVatCollected: number;
  vatDeductible23: number;
  vatDeductible13: number;
  vatDeductible6: number;
  totalVatDeductible: number;
  netVatPayable: number; // >0 a pagar, <0 a recuperar
}

export interface UniversalDiaryEntry {
  id: string;
  userId: string;
  date: string;
  title: string;
  category:
    | "PERSONAL"
    | "BUSINESS"
    | "HEALTH"
    | "FINANCIAL"
    | "PROJECT"
    | "ROUTINE";
  content: string;
  moodOrProductivityScore?: number; // 1-5
  tags: string[];
  expenseOrIncomeAmount?: number;
  isPrivate: boolean;
  createdAt: string;
}
