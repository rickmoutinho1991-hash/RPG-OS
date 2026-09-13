/**
 * RPG-OS Marketing → Revenue Pipeline (CONTRATO FUTURO — só fundação).
 *
 * Trilho alvo:
 *   lead → quote → accepted quote → project/job → invoice → payment → platform fee
 *
 * NESTA FASE nada disto é criado automaticamente: os leads são simulados no
 * sandbox e o intake fica sempre na etapa LEAD, com os links vazios. Quando
 * existirem integrações reais, `buildLeadIntake` alimenta o fluxo comercial
 * (orçamentos/obras já existentes no RPG-OS) sem alterar estes contratos.
 */

export const MARKETING_REVENUE_PIPELINE_STAGES = [
  "LEAD",
  "QUOTE",
  "QUOTE_ACCEPTED",
  "PROJECT_JOB",
  "INVOICE",
  "PAYMENT",
  "PLATFORM_FEE",
] as const;

export type MarketingRevenuePipelineStage =
  (typeof MARKETING_REVENUE_PIPELINE_STAGES)[number];

/** Etapa em que o intake pode ser criado — nesta fase apenas LEAD. */
export const MARKETING_INTAKE_MIN_STAGE: MarketingRevenuePipelineStage = "LEAD";

/**
 * Payload de intake de um lead de marketing para o pipeline comercial.
 * Os campos `links` serão preenchidos por fases futuras, à medida que o lead
 * se converte (quote → project → invoice → payment → fee).
 */
export interface MarketingLeadIntake {
  /** ID interno do lead (futuro: marketing_leads.id). */
  leadId: string;
  /** ID externo no provider (sandbox ou real). */
  externalLeadId: string | null;
  companyId: string;
  campaignId: string | null;
  providerId: string;
  /** Contexto comercial sugerido pelo targeting da campanha. */
  service: string | null;
  zone: string | null;
  estimatedJobValueCents: number | null;
  receivedAt: string;
  /** Etapa atual do trilho — sempre "LEAD" nesta fase (fato persistido). */
  stage: MarketingRevenuePipelineStage;
  /** Trilho de conversão — vazio nesta fase; preenchido por fases futuras. */
  links: {
    quoteId?: string;
    acceptedQuoteId?: string;
    projectId?: string;
    invoiceId?: string;
    paymentId?: string;
    platformFeeId?: string;
  };
}

/**
 * Constrói o intake de um lead SIMULADO (sandbox). Puro, sem BD. A etapa é
 * fixada em LEAD e os links ficam vazios — a conversão é sempre humana,
 * via módulos existentes (Orçamentos → Obras → Faturação → Pagamentos).
 */
export function buildLeadIntake(input: {
  leadId: string;
  externalLeadId?: string | null;
  companyId: string;
  campaignId?: string | null;
  providerId: string;
  service?: string | null;
  zone?: string | null;
  estimatedJobValueCents?: number | null;
  receivedAt: string;
}): MarketingLeadIntake {
  return {
    leadId: input.leadId,
    externalLeadId: input.externalLeadId ?? null,
    companyId: input.companyId,
    campaignId: input.campaignId ?? null,
    providerId: input.providerId,
    service: input.service ?? null,
    zone: input.zone ?? null,
    estimatedJobValueCents: input.estimatedJobValueCents ?? null,
    receivedAt: input.receivedAt,
    stage: "LEAD",
    links: {},
  };
}
