/**
 * DADOS FICTÍCIOS PARA O MODO DEMONSTRAÇÃO DO DASHBOARD.
 * Nunca usar como dados reais. Um anónimo com ?demo=1 vê apenas estes dados,
 * nunca tabelas reais do Supabase (§2.2, modo demo sintético).
 */

export const demoDashboardBanner =
  "Demonstração com dados fictícios — nada aqui é real.";

export const demoMetrics = {
  clientes: 128,
  obras: 7,
  orcamentos: 23,
  faturacao: 148920.5,
  recebido: 112433.75,
};

export const demoUpcomingEvents = [
  {
    id: "de-1",
    title: "Reunião de arranque — Obra Vale Formoso",
    start_time: "2026-09-15T09:00:00",
    location: "Vale Formoso, Matosinhos",
    event_type: "obra",
  },
  {
    id: "de-2",
    title: "Entrega de guia — Transporte Norte",
    start_time: "2026-09-16T11:30:00",
    location: "Porto",
    event_type: "logistica",
  },
  {
    id: "de-3",
    title: "Prazo SAF-T — Faturação mensal",
    start_time: "2026-09-20T18:00:00",
    location: null,
    event_type: "fiscal",
  },
] as const;

export const demoReminders = [
  {
    id: "dr-1",
    title: "Revisão da câmara de frio",
    scheduled_time: "07:30",
    dosage: null,
    is_completed_today: true,
  },
  {
    id: "dr-2",
    title: "Persiana exterior — pedido de orçamentos",
    scheduled_time: "10:00",
    dosage: null,
    is_completed_today: false,
  },
  {
    id: "dr-3",
    title: "Validação do milestone 3",
    scheduled_time: "15:00",
    dosage: null,
    is_completed_today: false,
  },
] as const;

export const demoProjects = [
  {
    id: "dp-1",
    code: "OBR-2026-014",
    title: "Obra Vale Formoso — pavimento",
    status: "IN_PROGRESS",
    progress_percentage: 62,
    budget_estimated: 48500,
  },
  {
    id: "dp-2",
    code: "OBR-2026-011",
    title: "Reabilitação Rua das Flores",
    status: "IN_PROGRESS",
    progress_percentage: 35,
    budget_estimated: 72000,
  },
  {
    id: "dp-3",
    code: "OBR-2026-007",
    title: "Loja Centro Comercial Mar",
    status: "COMPLETED",
    progress_percentage: 100,
    budget_estimated: 31400,
  },
] as const;

export const demoQuotes = [
  {
    id: "dq-1",
    quote_number: "ORC-2026-051",
    title: "Reparação persiana exterior",
    status: "ACCEPTED",
    total: 340,
  },
  {
    id: "dq-2",
    quote_number: "ORC-2026-049",
    title: "Pintura armazém Norte",
    status: "SENT",
    total: 12800,
  },
  {
    id: "dq-3",
    quote_number: "ORC-2026-047",
    title: "Manutenção anual AVAC",
    status: "CONVERTED_TO_PROJECT",
    total: 9600,
  },
] as const;

export const demoAuditLogs = [
  {
    id: "da-1",
    action: "Orçamento aceite",
    module: "orcamentos",
    timestamp: "2026-09-12T17:02:00",
  },
  {
    id: "da-2",
    action: "Guia de transporte emitida",
    module: "guias",
    timestamp: "2026-09-12T11:47:00",
  },
  {
    id: "da-3",
    action: "Milestone 2 validado",
    module: "obras",
    timestamp: "2026-09-11T16:30:00",
  },
  {
    id: "da-4",
    action: "Fatura eletrónica emitida",
    module: "faturacao",
    timestamp: "2026-09-11T10:15:00",
  },
] as const;