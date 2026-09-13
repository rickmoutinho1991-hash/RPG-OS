
export type TransactionCategory =
  | "INCOME"
  | "HOUSING"
  | "UTILITIES"
  | "FOOD_DINING"
  | "HEALTH_MEDICAL"
  | "TAXES_CONTRIBUTIONS"
  | "SALARIES"
  | "MATERIALS_SUPPLIES"
  | "TRANSPORTATION"
  | "SERVICES"
  | "LEISURE"
  | "OTHER";

export interface BankAccount {
  id: string;
  userId: string;
  companyId?: string;
  bankName: string; // Caixa Geral de Depósitos, Millennium BCP, Santander, Revolut, ActivoBank, Novo Banco
  bankCode: string; // CGD, BCP, SAN, NB, ACT, REV, BPI, CTT
  accountNumber: string;
  iban: string; // PT50...
  swiftBic: string;
  currency: string; // EUR
  balance: number;
  availableBalance: number;
  isMainAccount: boolean;
  connectedViaOpenBanking: boolean;
  lastSyncedAt: string;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
  description: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  category: TransactionCategory;
  date: string;
  status: "SETTLED" | "PENDING" | "FAILED";
  reference?: string;
  invoiceId?: string;
}

export interface VirtualCard {
  id: string;
  userId: string;
  cardName: string;
  last4Digits: string;
  cardBrand: "VISA" | "MASTERCARD";
  expiryDate: string;
  spendingLimitMonthly: number;
  currentMonthSpent: number;
  isFrozen: boolean;
  isSingleUse: boolean;
  colorTheme: string;
}

export interface SepaTransferRequest {
  sourceAccountId: string;
  recipientName: string;
  recipientIban: string;
  amount: number;
  description: string;
  isInstant: boolean;
}

export interface DirectDebitMandate {
  id: string;
  creditorName: string;
  creditorIban: string;
  mandateReference: string;
  maxAmount?: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
}
