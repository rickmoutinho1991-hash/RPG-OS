/**
 * DADOS FICTÍCIOS PARA DEMONSTRAÇÃO PÚBLICA.
 * Nunca usar como dados reais. Não usar em produção como reais.
 * Servem apenas para a landing pré-registo (§2.2) poder mostrar um
 * "dia acompanhado" sem tocar em Supabase.
 */

export type DemoStep =
  | "pedido"
  | "propostas"
  | "comparacao"
  | "contrato"
  | "milestones"
  | "evidencia"
  | "pagamento"
  | "garantia";

export type DemoFactKind = "FACT" | "INFERENCIA" | "RECOMENDACAO";

export interface DemoProposal {
  id: string;
  provider: string;
  badge: "recomendada" | "alternativa" | "economica";
  value: number;
  timeframe: string;
  highlights: string[];
}

export interface DemoStepContent {
  id: DemoStep;
  title: string;
  short: string;
  explanation: string;
}

export interface DemoMemoryPreference {
  id: string;
  label: string;
  value: string;
  state: "nova" | "editar" | "apagar";
}

/** Uma persiana antiga, um briefing matinal e três propostas — tudo fictício. */
export const demoPersona = {
  name: "Sra. Moreira",
  context: "gestão de um pequeno restaurante em Matosinhos",
  briefing:
    "Bom dia. Duas coisas merecem atenção hoje: o compressor da câmara de frio está a fazer um barulho estranho desde ontem à noite, e o cliente da obra de Vale Formoso ainda não validou o terceiro milestone. O resto pode esperar.",
  unblocking:
    "Notei que usou a persiana da sala do escritório 14 vezes esta manhã. Quer que peça três orçamentos para a reparar? Posso tratar disso enquanto resolve o compressor.",
};

export const demoBriefingItems = [
  { id: "b1", label: "Compressor da câmara de frio", status: "URGENTE" },
  { id: "b2", label: "Milestone 3 — obra Vale Formoso", status: "PENDENTE" },
  { id: "b3", label: "Persiana do escritório — 14 usos", status: "IA NOTOU" },
] as const;

export const demoServiceRequest = {
  title: "Reparação de persiana exterior",
  description:
    "Persiana elétrica da sala do escritório não sobe por completo; faz um estalido no motor ao meio do percurso.",
  category: "Manutenção predial",
  location: "Matosinhos",
  preferredWindow: "Esta semana, horas de abertura",
};

const factFor = (step: DemoStep): string =>
  ({
    pedido:
      "Facto: pediu reparação da persiana exterior com janela preferencial 'esta semana'.",
    propostas:
      "Facto: chegarem 3 propostas de 3 prestadores com CVs validados, sem spam de contactos.",
    comparacao:
      "Facto: a comparação separa o que é factual (preço, prazo, tempo em obra) do que é inferência (risco, fiabilidade).",
    contrato:
      "Facto: o contrato é gerado a partir da proposta escolhida e assinado com o mesmo NIF, sem voltar a preencher.",
    milestones:
      "Facto: o pagamento fica dividido em marcos ligados a entregas — não é tudo à frente.",
    evidencia:
      "Facto: cada marco fecha com evidência (fotos, timestamps, assinatura de conclusão).",
    pagamento:
      "Facto: o pagamento só é libertado depois da evidência validada, dentro do portal.",
    garantia:
      "Facto: a garantia fica registada e pode ser acionada sem guardar papéis nem contactos.",
  })[step];

/**
 * Comparação entre propostas — FACT / INFERÊNCIA / RECOMENDAÇÃO separados (§38):
 * cada linha declara a natureza da informação, nunca as mistura.
 */
export const demoComparison: {
  proposalId: string;
  facts: string[];
  inference: string[];
  recommendation: string[];
}[] = [
  {
    proposalId: "p1",
    facts: [
      "€ 340,00 (peças e mão de obra incluídas)",
      "Prazo: 5 dias úteis",
      "2 anos de garantia",
    ],
    inference: [
      "Histórico de 94% de entregas dentro do prazo noutros clientes",
    ],
    recommendation: ["Melhor equilíbrio preço/prazo/garantia para este pedido"],
  },
  {
    proposalId: "p2",
    facts: [
      "€ 195,00 (só mão de obra; motor poderá ser cobrado à parte)",
      "Prazo: 8 dias úteis",
      "1 ano de garantia",
    ],
    inference: ["Sem histórico recente com pedidos idênticos"],
    recommendation: ["Opção económica — clarificar o escopo do motor antes de aceitar"],
  },
  {
    proposalId: "p3",
    facts: [
      "€ 510,00 (marca premium, montagem completa)",
      "Prazo: 2 dias úteis",
      "3 anos de garantia",
    ],
    inference: ["Custo inicial mais alto, melhor histórico de longevidade"],
    recommendation: ["A melhor se a prioridade for rapidez extrema e garantia longa"],
  },
];

export const demoProposalSteps: DemoStepContent[] = [
  {
    id: "pedido",
    title: "Pedido",
    short: "Descreve o problema, o sítio e a janela. Sem formulários de páginas e páginas.",
    explanation:
      "Num pedido só há o essencial: onde é, o que é, quando pode haver. A IA devolve já um preço de referência, não um convite para 'contactar para saber'. " + factFor("pedido"),
  },
  {
    id: "propostas",
    title: "Propostas",
    short: "Chegam prestadores verificados, com CV, seguro e referências — sem spam de contactos.",
    explanation:
      "A plataforma não entrega os vossos contactos a 'consulta' — as propostas chegam estruturadas, comparáveis e anónimas até escolherem. " + factFor("propostas"),
  },
  {
    id: "comparacao",
    title: "Comparação",
    short: "Lado a lado: preço, prazo, garantia — com factos, inferências e recomendações separados.",
    explanation:
      "Para decidir bem, a IA não mistura o que é certo com o que é provável: cada linha diz se é facto, inferência ou recomendação. " + factFor("comparacao"),
  },
  {
    id: "contrato",
    title: "Contrato",
    short: "Gerado a partir da proposta escolhida. Assinado, sem voltar a preencher nada.",
    explanation:
      "O contrato nasce da proposta aceite: mesmas condições, mesma garantia, mesmo NIF. Sem tabelas de termos ilegíveis. " + factFor("contrato"),
  },
  {
    id: "milestones",
    title: "Milestones",
    short: "O pagamento acompanha as entregas: fases pequenas, cada uma com data certa.",
    explanation:
      "Nada de pagar tudo à frente nem de discutir ao fim: o trabalho avança em marcos, e cada marco corresponde a uma parcela. " + factFor("milestones"),
  },
  {
    id: "evidencia",
    title: "Evidência",
    short: "Cada marco fecha com provas: fotos com timestamp, descrição e confirmação.",
    explanation:
      "O que foi feito documenta-se no próprio passo — sem precisar de 'pedir factura à parte' nem de o cliente deslocar-se. " + factFor("evidencia"),
  },
  {
    id: "pagamento",
    title: "Pagamento",
    short: "O valor de cada marco é libertado quando a evidência é validada.",
    explanation:
      "O dinheiro não sai por fora: fica no portal até o marco estar validado, e cada parcela gera documento fiscal próprio. " + factFor("pagamento"),
  },
  {
    id: "garantia",
    title: "Garantia",
    short: "Fica registada no processo, com datas e âmbito — e é acionável em dois toques.",
    explanation:
      "A garantia não é um 'papel para guardar': está no processo, com o âmbito e as datas, e qualquer anomalia arranca daí. " + factFor("garantia"),
  },
];

export const demoMemoryPreferences: DemoMemoryPreference[] = [
  {
    id: "m1",
    label: "Iluminação da sala de refeições",
    value: "Led quente, dimmer a 60% nas horas de ponta — confirmar com o Sr. Correia.",
    state: "nova",
  },
  {
    id: "m2",
    label: "Leitura de câmara de frio (registos)",
    value: "Check diário às 07:30, alerta se subir 2°C",
    state: "editar",
  },
  {
    id: "m3",
    label: "Cliente da obra de Vale Formoso",
    value: "Prefere resumos por telefone, avisos de marco em dia útil",
    state: "apagar",
  },
];

export const demoMemoryNotice =
  "Demonstração: o botão edita/apaga interage localmente, com dados fictícios — no produto estes passos ficam registados em auditoria.";
