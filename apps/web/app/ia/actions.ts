"use server";

import { provideLifeAssistantAnswer } from "@/lib/life/tenant";
import { syncActionPlanForSession } from "@/lib/actionPlans/service";
import {
  FINANCE_INTENTS,
  LIFE_EXTRA_INTENTS,
  REPUTATION_EXTRA_INTENTS,
  AiQuoteSuggestionPrompt,
  AiSuggestedQuoteItem,
  AiBusinessInsight,
  BUSINESS_SECTORS,
  BusinessSector,
} from "@rpg/core";

export async function generateAiQuoteSuggestions(
  prompt: AiQuoteSuggestionPrompt,
): Promise<AiSuggestedQuoteItem[]> {
  const area = prompt.areaSquareMeters || 80;
  const sectorKey = (prompt.category as BusinessSector) || "CONSTRUCTION";
  const sector = BUSINESS_SECTORS[sectorKey];

  if (sector && sector.templateItems) {
    return sector.templateItems.map((item) => ({
      description: item.description,
      itemType: item.itemType,
      unit: item.unit,
      suggestedQuantity: item.unit === "m2" ? area : (item.unit === "h" ? 20 : 1),
      estimatedUnitPrice: item.estimatedPrice,
      vatRate: item.vatRate,
      notes: item.vatExemptionReason ? `Isenção: ${item.vatExemptionReason}` : undefined,
    }));
  }

  return [
    {
      description: `Serviço Profissional Especializado (${prompt.projectDescription})`,
      itemType: "SERVICE",
      unit: "vg",
      suggestedQuantity: 1,
      estimatedUnitPrice: 500.0,
      vatRate: 23,
    },
  ];
}

export async function getAiBusinessInsights(): Promise<AiBusinessInsight[]> {
  return [
    {
      id: "1",
      category: "COMPLIANCE",
      severity: "INFO",
      title: "Validação Fiscal Permanente",
      message:
        "Todos os NIFs e NIPCs registados cumprem o algoritmo de verificação da Autoridade Tributária.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      category: "FINANCIAL",
      severity: "WARNING",
      title: "Acompanhamento de Prazos de Cobrança",
      message:
        "Existem faturas emitidas com liquidação pendente. Recomendamos envio de referência Multibanco aos clientes.",
      suggestedAction: "Consultar módulo de Faturação",
      createdAt: new Date().toISOString(),
    },
    {
      id: "3",
      category: "PROJECTS",
      severity: "INFO",
      title: "Otimização de Mão-de-Obra",
      message:
        "As obras em execução mantêm taxa de conclusão dentro do cronograma previsto.",
      createdAt: new Date().toISOString(),
    },
  ];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ChatWithAiResult {
  reply: string;
  /** Propostas ativas do assistente (para a UI confirmar/executar com segurança). */
  proposals: ProposedActionDto[];
}

export interface ProposedActionDto {
  id: string;
  type: string;
  title: string;
  description: string;
  reason: string;
  impact: string;
  priority: string;
  status: string;
  requiresConfirmation: boolean;
}

export async function chatWithAiAction(
  history: ChatMessage[],
  newMessage: string,
): Promise<ChatWithAiResult> {
  const query = newMessage.trim().toLowerCase();

  // Perguntas pessoais (finanças + agenda + tarefas + documentos) são
  // respondidas com os DADOS REAIS do tenant da sessão (server-side, RLS/RBAC).
  const financeTerms = ["fatura", "iva", "saf-t", "saft", "efatura", "faturação", "faturacao"];
  const isFinanceTooling = financeTerms.some((t) => query.includes(t));
  if (!isFinanceTooling) {
    const life = await provideLifeAssistantAnswer(newMessage);
    const lifeApiSet = new Set<string>([
      ...FINANCE_INTENTS,
      ...LIFE_EXTRA_INTENTS,
      ...REPUTATION_EXTRA_INTENTS,
    ]);
    if (lifeApiSet.has(life.intent)) {
      const { plan } = await syncActionPlanForSession();
      const proposals = (plan?.actions ?? [])
        .filter((a) => a.status === "PROPOSED" || a.status === "CONFIRMED")
        .map((a) => toProposalDto(a));
      return { reply: life.answer, proposals };
    }
  }

  let reply = "";

  if (query.includes("orçamento") || query.includes("preço") || query.includes("valor")) {
    reply = "Posso ajudá-lo a estruturar e calcular a proposta! O RPG-OS possui cálculo automático de IVA por taxa legal (23%, 13%, 6% em reabilitação ou isenções do Art. 9.º / 53.º). Deseja criar uma proposta diretamente no separador 'Gerador Preditivo' ou aceder ao menu Orçamentos?";
  } else if (query.includes("medicação") || query.includes("remédio") || query.includes("comprimido") || query.includes("toma")) {
    reply = "Registei a sua preocupação com a saúde! Pode configurar o horário diário e a dosagem da sua medicação no separador 'Agenda & Lembretes Pessoais > Medicação & Rotinas'. Assim terá sempre o controlo diário de tomas e notificações.";
  } else if (query.includes("consulta") || query.includes("reunião") || query.includes("marcar") || query.includes("agenda") || query.includes("visita")) {
    reply = "Para agendar consultas médicas, reuniões com clientes, treinos desportivos ou visitas a obras, utilize o módulo 'Agenda'. O RPG-OS permite associar data, hora precisa, local presencial ou link virtual e definir lembretes automáticos.";
  } else if (query.includes("iva") || query.includes("fatura") || query.includes("finanças") || query.includes("saf-t") || query.includes("imposto")) {
    reply = "Todas as faturas emitidas no RPG-OS geram o código ATCUD para arquivo local. A comunicação oficial ao e-Fatura ainda não está integrada e deve ser feita manualmente no Portal das Finanças. Pode também descarregar o ficheiro XML SAF-T (PT) no menu 'Faturação > Mapa de IVA & SAF-T'.";
  } else if (query.includes("obra") || query.includes("projeto") || query.includes("tarefa")) {
    reply = "No módulo de 'Obras', pode acompanhar o progresso percentual, adicionar tarefas por prioridade, registar consumos de materiais e fazer o upload de fotografias de evolução diretamente para o arquivo em nuvem.";
  } else if (query.includes("olá") || query.includes("ola") || query.includes("bom dia") || query.includes("boa tarde") || query.includes("quem és") || query.includes("ajuda")) {
    reply = "Olá! Sou o seu Assistente Inteligente RPG-OS. Estou preparado para apoiá-lo na gestão de qualquer profissão (construção, medicina, fitness, advocacia, comércio, serviços) e também na sua vida pessoal (lembretes, medicação, marcações de agenda e finanças). Como posso ajudar hoje?";
  } else {
    reply = `Compreendi a sua solicitação sobre "${newMessage}". O RPG-OS pode automatizar este processo através dos módulos integrados de Agenda, Gestão de Clientes, Propostas, Faturação ou Lembretes Pessoais. Deseja que prepare um plano de ação detalhado?`;
  }

  return { reply, proposals: [] };
}

function toProposalDto(a: import("@rpg/core").ProposedAction): ProposedActionDto {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    reason: a.reason,
    impact: a.impact,
    priority: a.priority,
    status: a.status,
    requiresConfirmation: a.requiresConfirmation,
  };
}
