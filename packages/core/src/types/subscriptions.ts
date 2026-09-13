export type SubscriptionTier =
  | "DAILY"
  | "WEEKLY"
  | "PERSONAL"
  | "STARTER"
  | "PRO"
  | "ENTERPRISE";

export interface SaasPlanDefinition {
  id: SubscriptionTier;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  dailyPrice?: number;
  weeklyPrice?: number;
  popular?: boolean;
  badge?: string;
  targetAudience: string;
  description: string;
  features: string[];
  maxUsers: number;
  maxInvoicesPerMonth: number;
  unlimitedProjects: boolean;
  aiAssistantIncluded: boolean;
  saftExportIncluded: boolean;
  transportGuidesIncluded: boolean;
  openBankingIncluded: boolean;
  taxAssistantIncluded: boolean;
  paymentGatewayFeePercent: number;
}


export const RPG_OS_PLANS: Record<SubscriptionTier, SaasPlanDefinition> = {
  DAILY: {
    id: "DAILY",
    name: "Passe Diário 24h",
    monthlyPrice: 1.5,
    annualPrice: 350.0,
    dailyPrice: 1.5,
    badge: "Uso Pontual",
    targetAudience: "Qualquer Cidadão / Acesso Imediato",
    description: "Acesso total a todas as funcionalidades do RPG-OS durante 24 horas consecutivas.",
    features: [
      "Acesso completo por 24 horas",
      "Emissão ilimitada de faturas e orçamentos no dia",
      "Geração de SAF-T PT e Guias de Transporte",
      "Acesso ao Homebanking e Contabilista IA",
      "Sem fidelização nem renovação automática",
    ],
    maxUsers: 1,
    maxInvoicesPerMonth: 50,
    unlimitedProjects: true,
    aiAssistantIncluded: true,
    saftExportIncluded: true,
    transportGuidesIncluded: true,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 1.5,
  },
  WEEKLY: {
    id: "WEEKLY",
    name: "Semanada (7 Dias)",
    monthlyPrice: 19.6,
    annualPrice: 240.0,
    dailyPrice: 1.5,
    weeklyPrice: 4.9,
    badge: "Passe Semanal",
    targetAudience: "Trabalhos Temporários e Uso Flexível",
    description: "Acesso integral durante 7 dias consecutivos para fecho de obras ou trabalhos pontuais.",
    features: [
      "Acesso completo por 7 dias",
      "Emissão ilimitada de faturas, orçamentos e guias",
      "Contabilista IA e Homebanking ativos",
      "Sem renovação automática obrigatória",
    ],
    maxUsers: 1,
    maxInvoicesPerMonth: 100,
    unlimitedProjects: true,
    aiAssistantIncluded: true,
    saftExportIncluded: true,
    transportGuidesIncluded: true,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 1.3,
  },
  PERSONAL: {
    id: "PERSONAL",
    name: "Pessoal & Família",
    monthlyPrice: 7.9,
    annualPrice: 79.0, // 2 meses grátis
    dailyPrice: 1.5,
    badge: "Mais Acessível",
    targetAudience: "Particulares, Famílias e Qualquer Profissão",
    description: "Sistema operativo pessoal: Homebanking Revolut-style, despesas, IRS, saúde/medicação e diário.",
    features: [
      "1 Utilizador + Modo Pessoal & Familiar",
      "Conta Digital e Agregação Bancária (Open Banking)",
      "Gestor de Finanças Pessoais, Despesas e Orçamento Doméstico",
      "Agenda Universal, Rotinas e Controlo de Medicação Diária",
      "Simulador e Preparador de IRS Modelo 3",
      "Arquivo Digital de Documentos Pessoais e Faturas e-Fatura",
      "Diário Pessoal com Assistente IA",
    ],
    maxUsers: 1,
    maxInvoicesPerMonth: 20,
    unlimitedProjects: false,
    aiAssistantIncluded: true,
    saftExportIncluded: false,
    transportGuidesIncluded: false,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 1.2,
  },
  STARTER: {
    id: "STARTER",
    name: "Profissional Individual & ENI",
    monthlyPrice: 19.0,
    annualPrice: 190.0,
    dailyPrice: 1.5,
    badge: "Recibos Verdes / ENI",
    targetAudience: "Trabalhadores Independentes, Freelancers e ENI",
    description: "Faturação certificada, apuramento de IVA trimestral, retenção de IRS e Segurança Social Direta.",
    features: [
      "Até 1 Utilizador Profissional",
      "Faturação Certificada AT com QR Code e ATCUD",
      "Apuramento Trimestral de IVA e Retenções na Fonte",
      "Simulador de Segurança Social para Trabalhadores Independentes",
      "Exportação oficial de SAF-T (PT) XML",
      "Cobranças por MBWay, Multibanco e Cartão",
      "Homebanking Integrado e Conciliação Bancária",
    ],
    maxUsers: 1,
    maxInvoicesPerMonth: 100,
    unlimitedProjects: true,
    aiAssistantIncluded: true,
    saftExportIncluded: true,
    transportGuidesIncluded: false,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 1.0,
  },
  PRO: {
    id: "PRO",
    name: "PME & Empresas em Crescimento",
    monthlyPrice: 49.0,
    annualPrice: 490.0,
    dailyPrice: 1.5,
    popular: true,
    badge: "Mais Popular",
    targetAudience: "Micro e Pequenas Empresas de Qualquer Setor",
    description: "Tudo em um empresarial: Obras, Contabilidade, Guias AT, Salários TSU e Homebanking Empresarial.",
    features: [
      "Até 5 Colaboradores / Postos de Trabalho",
      "Gestão de Obras, Tarefas, Materiais e Diário de Empreitada",
      "Guias de Transporte com comunicação direta AT Doc Code",
      "Contabilista Digital: Mapas de IVA, TSU e Fecho Fiscal",
      "Homebanking Multibanco/SEPA com Débitos Diretos",
      "Assistente de IA Preditivo para Orçamentos e Custos",
      "Arquivo Digital de Alvarás, Certidões e Contratos",
    ],
    maxUsers: 5,
    maxInvoicesPerMonth: 500,
    unlimitedProjects: true,
    aiAssistantIncluded: true,
    saftExportIncluded: true,
    transportGuidesIncluded: true,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 0.8,
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Corporativo & Multi-Empresa",
    monthlyPrice: 99.0,
    annualPrice: 990.0,
    dailyPrice: 1.5,
    badge: "Sem Limites",
    targetAudience: "Médias/Grandes Empresas e Grupos Económicos",
    description: "Capacidade ilimitada, multi-entidade, conformidade fiscal integral e suporte prioritário 24/7.",
    features: [
      "Colaboradores e Utilizadores Ilimitados",
      "Gestão Multi-Empresa e Multi-Setorial",
      "Open Banking Avançado com Transferências em Lote",
      "Auditoria Total e Conformidade Rigorosa com RGPD",
      "Exportação de Relatórios Oficiais para Contabilistas Certificados",
      "Acesso total à API RPG-OS, Webhooks e Dispositivos",
      "Gestor de Conta Dedicado em Portugal",
    ],
    maxUsers: 9999,
    maxInvoicesPerMonth: 99999,
    unlimitedProjects: true,
    aiAssistantIncluded: true,
    saftExportIncluded: true,
    transportGuidesIncluded: true,
    openBankingIncluded: true,
    taxAssistantIncluded: true,
    paymentGatewayFeePercent: 0.5,
  },
};


export interface ProfitMarginCalculation {
  revenueGross: number; // Preço de venda ao cliente (sem IVA)
  directLaborCost: number; // Custo de mão-de-obra direta
  directMaterialsCost: number; // Custo de materiais e consumíveis
  overheadPercent: number; // Custos indiretos / estrutura (ex: 10%)
  totalCosts: number;
  grossProfitAmount: number; // Lucro bruto em Euros
  grossMarginPercentage: number; // Margem bruta em %
  rpgOsPlatformFee: number; // Comissão / taxa da plataforma RPG-OS
  netProfitAmount: number; // Lucro líquido final
}

export function calculateProfitMargins(input: {
  revenueGross: number;
  directLaborCost: number;
  directMaterialsCost: number;
  overheadPercent?: number;
  platformFeePercent?: number;
}): ProfitMarginCalculation {
  const revenue = Math.max(0, input.revenueGross);
  const labor = Math.max(0, input.directLaborCost);
  const materials = Math.max(0, input.directMaterialsCost);
  const overheadRatio = (input.overheadPercent || 10) / 100;
  const overheadAmount = (labor + materials) * overheadRatio;

  const totalCosts =
    Math.round((labor + materials + overheadAmount) * 100) / 100;
  const grossProfitAmount = Math.round((revenue - totalCosts) * 100) / 100;
  const grossMarginPercentage =
    revenue > 0 ? Math.round((grossProfitAmount / revenue) * 1000) / 10 : 0;

  const feeRatio = (input.platformFeePercent || 1.0) / 100;
  const rpgOsPlatformFee = Math.round(revenue * feeRatio * 100) / 100;
  const netProfitAmount =
    Math.round((grossProfitAmount - rpgOsPlatformFee) * 100) / 100;

  return {
    revenueGross: revenue,
    directLaborCost: labor,
    directMaterialsCost: materials,
    overheadPercent: input.overheadPercent || 10,
    totalCosts,
    grossProfitAmount,
    grossMarginPercentage,
    rpgOsPlatformFee,
    netProfitAmount,
  };
}
