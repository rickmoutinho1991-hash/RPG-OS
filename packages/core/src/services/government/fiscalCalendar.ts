/**
 * RPG-OS Fiscal Calendar - Calendário Fiscal Português (FASE 10J-J)
 *
 * Architecture for Portuguese fiscal compliance deadlines.
 * Supports VAT, SAF-T, TSU, IRS, IRC, IES, and configurable organization deadlines.
 * Deadline rules stored with source, effective dates, jurisdiction, obligation type.
 * System allows future legal rule updates.
 */

import type { GovernmentProviderId } from "./governmentIntegration";

/** Fiscal obligation categories */
export type FiscalObligationCategory =
  | "IVA"              // Imposto sobre o Valor Acrescentado
  | "SAFT"             // SAF-T PT / e-Fatura
  | "TSU"              // Taxa Social Única / Segurança Social
  | "IRS"              // Imposto sobre Rendimentos Singulares
  | "IRC"              // Imposto sobre Rendimentos Coletivos
  | "IES"              // Informação Empresarial Simplificada
  | "STAMP_DUTY"       // Imposto do Selo
  | "VEHICLE_TAX"      // Imposto Único de Circulação
  | "PROPERTY_TAX"     // IMI / AIMI
  | "CUSTOMS"          // Alfândegas / IVA Importação
  | "OTHER";           // Outras obrigações

/** Recurrence patterns for deadlines */
export type FiscalRecurrence =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL"
  | "ONE_TIME"
  | "ON_DEMAND";       // Quando aplicável (ex: fatura emitida)

/** Deadline status */
export type FiscalDeadlineStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "OVERDUE"
  | "COMPLETED"
  | "EXTENDED"
  | "CANCELLED";

/** Jurisdiction for multi-region support */
export type FiscalJurisdiction =
  | "PT_CONTINENT"
  | "PT_AZORES"
  | "PT_MADEIRA"
  | "EU"
  | "INTERNATIONAL";

/** Fiscal deadline rule definition */
export interface FiscalDeadlineRule {
  id: string;
  /** Código único da regra */
  code: string;
  /** Nome descritivo */
  name: string;
  /** Descrição detalhada */
  description: string;
  /** Categoria da obrigação */
  category: FiscalObligationCategory;
  /** Recorrência */
  recurrence: FiscalRecurrence;
  /** Cálculo da data de vencimento */
  due_date_calculation: FiscalDueDateCalculation;
  /** Jurisdição aplicável */
  jurisdiction: FiscalJurisdiction[];
  /** Fonte legal */
  legal_source: string;
  /** Artigo/Lei de referência */
  legal_reference?: string;
  /** Válido a partir de */
  effective_from: string;
  /** Válido até (se aplicável) */
  effective_until?: string;
  /** Se a regra está ativa */
  active: boolean;
  /** Aviso antecipado (dias) */
  advance_notice_days: number;
  /** Permite prorrogação */
  allows_extension: boolean;
  /** Dias máximos de prorrogação */
  max_extension_days?: number;
  /** Metadados */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Cálculo da data de vencimento */
export interface FiscalDueDateCalculation {
  /** Tipo de cálculo */
  type: "FIXED_DATE" | "RELATIVE_TO_PERIOD" | "RELATIVE_TO_EVENT" | "BUSINESS_DAYS_OFFSET";
  /** Para FIXED_DATE: dia do mês (1-31) */
  fixed_day?: number;
  /** Para FIXED_DATE: mês (1-12) - se anual */
  fixed_month?: number;
  /** Para RELATIVE_TO_PERIOD: offset em dias do fim do período */
  period_end_offset_days?: number;
  /** Para RELATIVE_TO_EVENT: evento de referência */
  reference_event?: "PERIOD_END" | "INVOICE_ISSUE" | "PAYMENT_RECEIVED" | "DECLARATION_SUBMITTED";
  /** Para RELATIVE_TO_EVENT: offset em dias do evento */
  event_offset_days?: number;
  /** Para BUSINESS_DAYS_OFFSET: dias úteis após evento */
  business_days_offset?: number;
  /** Considera apenas dias úteis */
  business_days_only?: boolean;
  /** Ajusta para dia útil seguinte se fim de semana/feriado */
  adjust_for_holidays?: boolean;
}

/** Instância de prazo fiscal para uma organização */
export interface FiscalDeadline {
  id: string;
  organization_id: string;
  rule_id: string;
  rule_code: string;
  /** Período de referência */
  period: string;           // Ex: "2024-Q1", "2024-01", "2024"
  /** Data de vencimento calculada */
  due_date: string;
  /** Data de vencimento com prorrogação (se aplicável) */
  extended_due_date?: string;
  /** Status do prazo */
  status: FiscalDeadlineStatus;
  /** Categoria */
  category: FiscalObligationCategory;
  /** Título */
  title: string;
  /** Descrição */
  description: string;
  /** Valor estimado em cêntimos */
  estimated_amount_cents?: number;
  /** Referência de pagamento */
  payment_reference?: string;
  /** URL de pagamento/submissão */
  action_url?: string;
  /** Referência externa (ex: AT process ID) */
  external_reference?: string;
  /** Data de conclusão */
  completed_at?: string;
  /** Completado por */
  completed_by?: string;
  /** Notas */
  notes?: string;
  /** Metadados */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Calendário fiscal da organização */
export interface OrganizationFiscalCalendar {
  organization_id: string;
  /** Regras ativas aplicáveis */
  active_rules: FiscalDeadlineRule[];
  /** Prazos do período atual */
  current_deadlines: FiscalDeadline[];
  /** Prazos vencidos */
  overdue_deadlines: FiscalDeadline[];
  /** Próximos prazos (30 dias) */
  upcoming_deadlines: FiscalDeadline[];
  /** Estatísticas */
  stats: {
    total_upcoming: number;
    total_overdue: number;
    total_completed_this_month: number;
    critical_count: number;
  };
  /** Última sincronização */
  last_synced_at: string;
}

/** Evento de calendário para UI */
export interface FiscalCalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  category: FiscalObligationCategory;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  deadline?: FiscalDeadline;
  rule?: FiscalDeadlineRule;
  all_day: boolean;
}

/** Filtros para listar prazos */
export interface FiscalDeadlineFilters {
  categories?: FiscalObligationCategory[];
  statuses?: FiscalDeadlineStatus[];
  date_from?: string;
  date_to?: string;
  jurisdiction?: FiscalJurisdiction;
  include_completed?: boolean;
  include_cancelled?: boolean;
}

/** Estatísticas de compliance */
export interface FiscalComplianceStats {
  organization_id: string;
  period: string;
  total_obligations: number;
  completed_on_time: number;
  completed_late: number;
  overdue: number;
  cancelled: number;
  compliance_rate: number;        // 0-100
  average_days_late: number;
  by_category: Record<FiscalObligationCategory, {
    total: number;
    completed: number;
    overdue: number;
    rate: number;
  }>;
  trends: {
    month: string;
    completed: number;
    overdue: number;
  }[];
}

/** Serviço de calendário fiscal */
export class FiscalCalendarService {
  private rules: Map<string, FiscalDeadlineRule> = new Map();
  private deadlines: Map<string, FiscalDeadline> = new Map();
  private organizationRules: Map<string, Set<string>> = new Map(); // org_id -> rule_ids

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Inicializa regras padrão do calendário fiscal português
   */
  private initializeDefaultRules(): void {
    const now = new Date().toISOString();
    const defaultRules: FiscalDeadlineRule[] = [
      // IVA - Declaração Periódica (Mensal/Trimestral)
      {
        id: "rule_iva_monthly",
        code: "IVA_MONTHLY",
        name: "Declaração Periódica de IVA (Mensal)",
        description: "Entrega da declaração periódica de IVA para sujeitos passivos com regime mensal",
        category: "IVA",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "BUSINESS_DAYS_OFFSET",
          reference_event: "PERIOD_END",
          event_offset_days: 10,
          business_days_only: true,
          adjust_for_holidays: true,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do IVA",
        legal_reference: "Art. 41.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 5,
        allows_extension: true,
        max_extension_days: 30,
        created_at: now,
        updated_at: now,
      },
      {
        id: "rule_iva_quarterly",
        code: "IVA_QUARTERLY",
        name: "Declaração Periódica de IVA (Trimestral)",
        description: "Entrega da declaração periódica de IVA para sujeitos passivos com regime trimestral",
        category: "IVA",
        recurrence: "QUARTERLY",
        due_date_calculation: {
          type: "BUSINESS_DAYS_OFFSET",
          reference_event: "PERIOD_END",
          event_offset_days: 15,
          business_days_only: true,
          adjust_for_holidays: true,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do IVA",
        legal_reference: "Art. 41.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 10,
        allows_extension: true,
        max_extension_days: 30,
        created_at: now,
        updated_at: now,
      },
      // SAF-T / e-Fatura - Comunicação Mensal
      {
        id: "rule_saft_monthly",
        code: "SAFT_MONTHLY",
        name: "Comunicação Mensal de Faturação SAF-T (e-Fatura)",
        description: "Comunicação dos elementos das faturas à AT até ao dia 5 do mês seguinte",
        category: "SAFT",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 5,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Decreto-Lei n.º 198/2012",
        legal_reference: "Art. 3.º",
        effective_from: "2013-01-01",
        active: true,
        advance_notice_days: 3,
        allows_extension: false,
        created_at: now,
        updated_at: now,
      },
      // TSU - Declaração Mensal de Remunerações
      {
        id: "rule_tsu_monthly",
        code: "TSU_MONTHLY",
        name: "Declaração Mensal de Remunerações e Guia TSU",
        description: "Entrega da declaração mensal de remunerações e pagamento da TSU até dia 20",
        category: "TSU",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 20,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código dos Regimes Contributivos",
        legal_reference: "Art. 121.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 5,
        allows_extension: true,
        max_extension_days: 30,
        created_at: now,
        updated_at: now,
      },
      // IRS - Declaração Anual (Modelo 3)
      {
        id: "rule_irs_annual",
        code: "IRS_ANNUAL",
        name: "Declaração de Rendimentos IRS (Modelo 3)",
        description: "Entrega da declaração anual de rendimentos (IRS Modelo 3) até 30 de junho",
        category: "IRS",
        recurrence: "ANNUAL",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 30,
          fixed_month: 6,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do IRS",
        legal_reference: "Art. 57.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 30,
        allows_extension: true,
        max_extension_days: 60,
        created_at: now,
        updated_at: now,
      },
      // IRC - Declaração Anual (Modelo 22)
      {
        id: "rule_irc_annual",
        code: "IRC_ANNUAL",
        name: "Declaração de Rendimentos IRC (Modelo 22)",
        description: "Entrega da declaração anual de rendimentos (IRC Modelo 22) até 31 de maio",
        category: "IRC",
        recurrence: "ANNUAL",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 31,
          fixed_month: 5,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do IRC",
        legal_reference: "Art. 120.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 30,
        allows_extension: true,
        max_extension_days: 60,
        created_at: now,
        updated_at: now,
      },
      // IES - Informação Empresarial Simplificada
      {
        id: "rule_ies_annual",
        code: "IES_ANNUAL",
        name: "Informação Empresarial Simplificada (IES)",
        description: "Entrega da IES até 15 de julho (prorrogação possível até 31 de julho)",
        category: "IES",
        recurrence: "ANNUAL",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 15,
          fixed_month: 7,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Decreto-Lei n.º 8/2017",
        legal_reference: "Art. 3.º",
        effective_from: "2017-01-01",
        active: true,
        advance_notice_days: 30,
        allows_extension: true,
        max_extension_days: 16,
        created_at: now,
        updated_at: now,
      },
      // Imposto do Selo - Mensal
      {
        id: "rule_stamp_duty_monthly",
        code: "STAMP_DUTY_MONTHLY",
        name: "Imposto do Selo (Mensal)",
        description: "Liquidação mensal do Imposto do Selo até dia 20 do mês seguinte",
        category: "STAMP_DUTY",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 20,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do Imposto do Selo",
        legal_reference: "Art. 29.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 5,
        allows_extension: true,
        max_extension_days: 30,
        created_at: now,
        updated_at: now,
      },
      // IMI - Anual (Abril/Setembro/Novembro)
      {
        id: "rule_imi_annual",
        code: "IMI_ANNUAL",
        name: "Imposto Municipal sobre Imóveis (IMI)",
        description: "Pagamento do IMI em prestações (Abril, Setembro, Novembro) ou único em Abril se < 100€",
        category: "PROPERTY_TAX",
        recurrence: "ANNUAL",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 30,
          fixed_month: 4,
        },
        jurisdiction: ["PT_CONTINENT", "PT_AZORES", "PT_MADEIRA"],
        legal_source: "Código do IMI",
        legal_reference: "Art. 44.º",
        effective_from: "2023-01-01",
        active: true,
        advance_notice_days: 30,
        allows_extension: false,
        created_at: now,
        updated_at: now,
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Adiciona ou atualiza uma regra
   */
  addRule(rule: FiscalDeadlineRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Obtém regra por ID
   */
  getRule(id: string): FiscalDeadlineRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Obtém regra por código
   */
  getRuleByCode(code: string): FiscalDeadlineRule | undefined {
    return Array.from(this.rules.values()).find(r => r.code === code);
  }

  /**
   * Lista regras ativas
   */
  listActiveRules(jurisdiction?: FiscalJurisdiction): FiscalDeadlineRule[] {
    let rules = Array.from(this.rules.values()).filter(r => r.active);
    if (jurisdiction) {
      rules = rules.filter(r => r.jurisdiction.includes(jurisdiction));
    }
    return rules.sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Calcula data de vencimento baseada na regra
   */
  calculateDueDate(rule: FiscalDeadlineRule, period: string, referenceDate?: Date): string {
    const calc = rule.due_date_calculation;
    const ref = referenceDate || new Date();

    switch (calc.type) {
      case "FIXED_DATE":
        if (calc.fixed_month && calc.fixed_day) {
          // Anual com mês e dia fixos
          const year = ref.getFullYear();
          return `${year}-${String(calc.fixed_month).padStart(2, "0")}-${String(calc.fixed_day).padStart(2, "0")}`;
        } else if (calc.fixed_day) {
          // Mensal com dia fixo - usar o período se disponível (formato "YYYY-MM")
          let year: number;
          let month: number;

          if (period.match(/^\d{4}-\d{2}$/)) {
            // Período mensal: "YYYY-MM" - usar o mês do período diretamente
            const [periodYear, periodMonth] = period.split("-").map(Number);
            year = periodYear;
            month = periodMonth;
          } else {
            // Fallback: usar data de referência
            year = ref.getFullYear();
            month = ref.getMonth() + 1;
          }

          // Para geração baseada em período, usar o mês do período diretamente
          // (não avançar para o próximo mês, pois o período define o mês de vencimento)
          return `${year}-${String(month).padStart(2, "0")}-${String(calc.fixed_day).padStart(2, "0")}`;
        }
        break;

      case "BUSINESS_DAYS_OFFSET":
        // Calcular fim do período
        let periodEnd = this.getPeriodEnd(period, ref);
        let dueDate = new Date(periodEnd);
        let daysAdded = 0;
        const offset = calc.event_offset_days ?? 0;

        while (daysAdded < offset) {
          dueDate.setDate(dueDate.getDate() + 1);
          if (calc.business_days_only) {
            const day = dueDate.getDay();
            if (day !== 0 && day !== 6) { // Não domingo (0) nem sábado (6)
              daysAdded++;
            }
          } else {
            daysAdded++;
          }
        }

        // Ajustar feriados se necessário
        if (calc.adjust_for_holidays) {
          dueDate = this.adjustForHolidays(dueDate);
        }

        return dueDate.toISOString().split("T")[0];

      case "RELATIVE_TO_PERIOD":
        if (calc.period_end_offset_days !== undefined) {
          const periodEnd = this.getPeriodEnd(period, ref);
          const dueDate = new Date(periodEnd);
          dueDate.setDate(dueDate.getDate() + calc.period_end_offset_days);
          return dueDate.toISOString().split("T")[0];
        }
        break;
    }

    // Fallback: hoje
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Obtém fim do período baseado no código do período
   */
  private getPeriodEnd(period: string, ref: Date): Date {
    // Formatos suportados: "2024-Q1", "2024-01", "2024", "2024-01-15"
    if (period.includes("-Q")) {
      // Trimestre: "2024-Q1"
      const [year, quarter] = period.split("-Q");
      const q = parseInt(quarter, 10);
      const endMonth = q * 3;
      const date = new Date(parseInt(year, 10), endMonth, 0); // Último dia do mês
      return date;
    } else if (period.match(/^\d{4}-\d{2}$/)) {
      // Mês: "2024-01"
      const [year, month] = period.split("-");
      const date = new Date(parseInt(year, 10), parseInt(month, 10), 0);
      return date;
    } else if (period.match(/^\d{4}$/)) {
      // Ano: "2024"
      return new Date(parseInt(period, 10), 11, 31);
    } else if (period.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Data específica
      return new Date(period);
    }
    // Fallback: fim do mês atual
    return new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  }

  /**
   * Ajusta data para dia útil se cair em fim de semana ou feriado
   */
  private adjustForHolidays(date: Date): Date {
    const adjusted = new Date(date);

    // Ajustar fim de semana
    while (adjusted.getDay() === 0 || adjusted.getDay() === 6) {
      adjusted.setDate(adjusted.getDate() + 1);
    }

    // TODO: Adicionar feriados nacionais portugueses
    // Feriados fixos: 1 Jan, 25 Abr, 1 Mai, 10 Jun, 15 Ago, 5 Out, 1 Nov, 1 Dez, 8 Dez, 25 Dez, 26 Dez
    // Feriados móveis: Carnaval, Sexta-feira Santa, Páscoa, Corpo de Deus

    return adjusted;
  }

  /**
   * Gera prazos para uma organização num período
   */
  generateDeadlinesForOrganization(
    organizationId: string,
    period: string,
    jurisdiction: FiscalJurisdiction = "PT_CONTINENT"
  ): FiscalDeadline[] {
    const activeRules = this.listActiveRules(jurisdiction);
    const deadlines: FiscalDeadline[] = [];

    for (const rule of activeRules) {
      if (!rule.active) continue;

      const dueDate = this.calculateDueDate(rule, period);
      const deadlineId = `dl_${organizationId}_${rule.id}_${period}`;

      const deadline: FiscalDeadline = {
        id: deadlineId,
        organization_id: organizationId,
        rule_id: rule.id,
        rule_code: rule.code,
        period,
        due_date: dueDate,
        status: "UPCOMING",
        category: rule.category,
        title: `${rule.code} - ${rule.name} - ${this.formatPeriod(period)}`,
        description: rule.description,
        metadata: {
          rule_id: rule.id,
          jurisdiction,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      deadlines.push(deadline);
      this.deadlines.set(deadlineId, deadline);
    }

    return deadlines;
  }

  /**
   * Formata período para exibição
   */
  private formatPeriod(period: string): string {
    if (period.includes("-Q")) {
      const [year, quarter] = period.split("-Q");
      return `${quarter}.º Trimestre ${year}`;
    } else if (period.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = period.split("-");
      const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      return `${months[parseInt(month, 10) - 1]} ${year}`;
    } else if (period.match(/^\d{4}$/)) {
      return `Ano ${period}`;
    }
    return period;
  }

  /**
   * Obtém prazos de uma organização
   */
  getOrganizationDeadlines(organizationId: string, filters: any = {}): any[] {
    let deadlines = Array.from(this.deadlines.values())
      .filter(d => d.organization_id === organizationId);

    if (filters.statuses?.length) {
      deadlines = deadlines.filter(d => filters.statuses.includes(d.status));
    }
    if (filters.categories?.length) {
      deadlines = deadlines.filter(d => filters.categories.includes(d.category));
    }
    if (filters.date_from) {
      deadlines = deadlines.filter(d => d.due_date >= filters.date_from);
    }
    if (filters.date_to) {
      deadlines = deadlines.filter(d => d.due_date <= filters.date_to);
    }

    // Atualizar status baseado na data atual
    const now = new Date();
    for (const d of deadlines) {
      const dueDate = new Date(d.due_date);
      if (d.status === "UPCOMING" || d.status === "DUE_SOON") {
        if (dueDate < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
          d.status = "OVERDUE";
        } else if (dueDate < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
          d.status = "DUE_SOON";
        }
      }
    }

    return deadlines.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }

  /**
   * Marca prazo como completado
   */
  completeDeadline(id: string, userId: string, notes?: string): FiscalDeadline | undefined {
    const deadline = this.deadlines.get(id);
    if (!deadline) return undefined;

    deadline.status = "COMPLETED";
    deadline.completed_at = new Date().toISOString();
    deadline.completed_by = notes ? `${notes} (por ${userId})` : userId;
    deadline.updated_at = new Date().toISOString();
    return deadline;
  }

  /**
   * Estende prazo
   */
  extendDeadline(id: string, newDueDate: string, userId: string, reason?: string): FiscalDeadline | undefined {
    const deadline = this.deadlines.get(id);
    if (!deadline) return undefined;

    const rule = this.rules.get(deadline.rule_id);
    if (!rule?.allows_extension) {
      throw new Error("Esta obrigação não permite prorrogação");
    }

    if (rule.max_extension_days) {
      const originalDue = new Date(deadline.due_date);
      const maxExtension = new Date(originalDue.getTime() + rule.max_extension_days * 24 * 60 * 60 * 1000);
      const requestedDate = new Date(newDueDate);
      if (requestedDate > maxExtension) {
        throw new Error(`Prorrogação excede o máximo de ${rule.max_extension_days} dias permitidos`);
      }
    }

    deadline.extended_due_date = newDueDate;
    deadline.status = "EXTENDED";
    deadline.updated_at = new Date().toISOString();
    deadline.notes = `${deadline.notes || ""}\nProrrogado por ${userId} em ${new Date().toISOString()}: ${reason || "Sem justificação"}`;
    return deadline;
  }

  /**
   * Obtém eventos de calendário para UI
   */
  getCalendarEvents(organizationId: string, startDate: string, endDate: string): any[] {
    const deadlines = this.getOrganizationDeadlines(organizationId, {
      date_from: startDate,
      date_to: endDate,
    });

    return deadlines.map(d => ({
      id: d.id,
      date: d.due_date,
      title: d.title,
      description: d.description,
      category: d.category,
      priority: d.status === "OVERDUE" ? "CRITICAL" : d.status === "DUE_SOON" ? "HIGH" : "MEDIUM",
      deadline: d,
      all_day: true,
    }));
  }

  /**
   * Obtém estatísticas de compliance
   */
  getComplianceStats(organizationId: string, period: string): any {
    const deadlines = Array.from(this.deadlines.values())
      .filter(d => d.organization_id === organizationId && d.period === period);

    const total = deadlines.length;
    const completed = deadlines.filter(d => d.status === "COMPLETED").length;
    const overdue = deadlines.filter(d => d.status === "OVERDUE").length;
    const completedOnTime = deadlines.filter(d => d.status === "COMPLETED" && !d.extended_due_date).length;
    const completedLate = deadlines.filter(d => d.status === "COMPLETED" && d.extended_due_date).length;

    const byCategory: Record<string, any> = {};
    for (const d of deadlines) {
      if (!byCategory[d.category]) {
        byCategory[d.category] = { total: 0, completed: 0, overdue: 0 };
      }
      byCategory[d.category].total++;
      if (d.status === "COMPLETED") byCategory[d.category].completed++;
      if (d.status === "OVERDUE") byCategory[d.category].overdue++;
    }

    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].rate = byCategory[cat].total > 0
        ? Math.round((byCategory[cat].completed / byCategory[cat].total) * 100)
        : 100;
    }

    return {
      total_obligations: deadlines.length,
      completed_on_time: completedOnTime,
      completed_late: completedLate,
      overdue,
      cancelled: deadlines.filter(d => d.status === "CANCELLED").length,
      compliance_rate: total > 0 ? Math.round((completed / total) * 100) : 100,
      average_days_late: 0, // TODO: calcular
      by_category: byCategory,
      trends: [], // TODO: implementar
    };
  }
}

/** Instância global (para desenvolvimento) */
export const fiscalCalendarService = new FiscalCalendarService();

/** Helper para criar instância */
export function createFiscalCalendarService(): FiscalCalendarService {
  return new FiscalCalendarService();
}