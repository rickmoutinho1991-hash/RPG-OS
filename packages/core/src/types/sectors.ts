export type BusinessSector =
  | "CONSTRUCTION" // Construção, Obras, Remodelações, Eletricidade, Canalização
  | "HEALTHCARE" // Clínicas, Médicos, Dentistas, Fisioterapia, Psicologia
  | "FITNESS" // Ginásios, Personal Trainers, Nutrição, Bem-Estar
  | "LEGAL_CONSULTING" // Advogados, Contabilistas, Solicitadores, Consultoria TI
  | "RETAIL_COMMERCE" // Lojas, E-commerce, Distribuição, Restauração
  | "AUTOMOTIVE" // Oficinas Mecânicas, Pintura Auto, Inspeções
  | "GENERAL_SERVICES"; // Polivalências, Limpezas, Jardinagem, Manutenção

export interface SectorDefinition {
  id: BusinessSector;
  title: string;
  defaultCae: string;
  description: string;
  taxNotes: string;
  defaultVatExemption?: string; // ex: M07 (Art. 9.º CIVA para Médicos)
  suggestedUnits: string[];
  templateItems: Array<{
    description: string;
    itemType: "LABOR" | "MATERIAL" | "SERVICE" | "EQUIPMENT";
    unit: string;
    estimatedPrice: number;
    vatRate: number;
    vatExemptionReason?: string;
  }>;
}

export const BUSINESS_SECTORS: Record<BusinessSector, SectorDefinition> = {
  CONSTRUCTION: {
    id: "CONSTRUCTION",
    title: "Construção, Obras & Instalações",
    defaultCae: "41200",
    description:
      "Empreitadas, remodelações, instalações elétricas, AVAC e obras públicas.",
    taxNotes:
      "Sujeito a IVA normal (23%) ou taxa reduzida (6%) em reabilitação urbana (Verba 2.27 CIVA).",
    suggestedUnits: ["m2", "m3", "ml", "h", "un", "vg", "kg", "ton"],
    templateItems: [
      {
        description: "Mão-de-obra de assentamento e trolha",
        itemType: "LABOR",
        unit: "h",
        estimatedPrice: 22.5,
        vatRate: 23,
      },
      {
        description: "Reabilitação de fachada com isolamento térmico (Capoto)",
        itemType: "SERVICE",
        unit: "m2",
        estimatedPrice: 48.0,
        vatRate: 6,
        vatExemptionReason: "Verba 2.27 CIVA",
      },
      {
        description: "Fornecimento de betão pronto C25/30",
        itemType: "MATERIAL",
        unit: "m3",
        estimatedPrice: 95.0,
        vatRate: 23,
      },
    ],
  },
  HEALTHCARE: {
    id: "HEALTHCARE",
    title: "Saúde, Medicina & Terapias",
    defaultCae: "86210",
    description:
      "Consultas médicas, medicina dentária, fisioterapia, enfermagem e psicologia.",
    taxNotes:
      "Isento de IVA ao abrigo do Artigo 9.º do CIVA (Prestações de serviços de saúde).",
    defaultVatExemption: "M07",
    suggestedUnits: ["un", "h", "sessao", "consulta"],
    templateItems: [
      {
        description: "Consulta de Especialidade / Avaliação Clínica",
        itemType: "SERVICE",
        unit: "un",
        estimatedPrice: 75.0,
        vatRate: 0,
        vatExemptionReason: "Isento Artigo 9.º do CIVA",
      },
      {
        description: "Sessão de Fisioterapia e Reabilitação Motora",
        itemType: "SERVICE",
        unit: "sessao",
        estimatedPrice: 45.0,
        vatRate: 0,
        vatExemptionReason: "Isento Artigo 9.º do CIVA",
      },
      {
        description: "Relatório Médico Pericial",
        itemType: "SERVICE",
        unit: "un",
        estimatedPrice: 120.0,
        vatRate: 0,
        vatExemptionReason: "Isento Artigo 9.º do CIVA",
      },
    ],
  },
  FITNESS: {
    id: "FITNESS",
    title: "Fitness, Desporto & Bem-Estar",
    defaultCae: "93130",
    description:
      "Personal training, planos de treino, coaching desportivo e consultas de nutrição.",
    taxNotes:
      "Sujeito a IVA normal (23%) para treinos desportivos ou isenção de IVA para consultas de nutrição clínica (Art. 9.º).",
    suggestedUnits: ["sessao", "mes", "un", "h"],
    templateItems: [
      {
        description:
          "Pack Mensal de Acompanhamento Personal Trainer (8 Sessões)",
        itemType: "SERVICE",
        unit: "mes",
        estimatedPrice: 240.0,
        vatRate: 23,
      },
      {
        description:
          "Prescrição de Plano de Treino e Periodização Personalizada",
        itemType: "SERVICE",
        unit: "un",
        estimatedPrice: 50.0,
        vatRate: 23,
      },
      {
        description:
          "Consulta e Avaliação de Composição Corporal (Bioimpedância)",
        itemType: "SERVICE",
        unit: "sessao",
        estimatedPrice: 40.0,
        vatRate: 0,
        vatExemptionReason: "Isento Artigo 9.º do CIVA",
      },
    ],
  },
  LEGAL_CONSULTING: {
    id: "LEGAL_CONSULTING",
    title: "Advocacia, Consultoria, TI & Contabilidade",
    defaultCae: "69101",
    description:
      "Serviços jurídicos, consultoria de gestão, desenvolvimento de software e apoio contabilístico.",
    taxNotes:
      "Sujeito a IVA (23%) com eventual retenção na fonte de IRS (11.5% ou 25% para IRC).",
    suggestedUnits: ["h", "dia", "mes", "vg", "un"],
    templateItems: [
      {
        description:
          "Honorários de Consultoria Estratégica / Assessoria Jurídica",
        itemType: "SERVICE",
        unit: "h",
        estimatedPrice: 90.0,
        vatRate: 23,
      },
      {
        description:
          "Desenvolvimento e Integração de Sistemas de Software à Medida",
        itemType: "SERVICE",
        unit: "dia",
        estimatedPrice: 350.0,
        vatRate: 23,
      },
      {
        description:
          "Avença Mensal de Fecho Contabilístico e Obrigações Fiscais",
        itemType: "SERVICE",
        unit: "mes",
        estimatedPrice: 200.0,
        vatRate: 23,
      },
    ],
  },
  RETAIL_COMMERCE: {
    id: "RETAIL_COMMERCE",
    title: "Comércio, Venda a Retalho & Distribuição",
    defaultCae: "47190",
    description:
      "Venda de mercadorias, lojas físicas, distribuição por grosso e comércio eletrónico.",
    taxNotes:
      "Aplicação de taxas de IVA consoante a cesta de bens (6% alimentação essencial, 13%, 23% geral).",
    suggestedUnits: ["un", "kg", "pack", "cx"],
    templateItems: [
      {
        description: "Fornecimento de Mercadorias e Equipamentos de Consumo",
        itemType: "MATERIAL",
        unit: "un",
        estimatedPrice: 49.99,
        vatRate: 23,
      },
      {
        description: "Taxa de Entrega e Logística ao Domicílio",
        itemType: "SERVICE",
        unit: "un",
        estimatedPrice: 7.5,
        vatRate: 23,
      },
    ],
  },
  AUTOMOTIVE: {
    id: "AUTOMOTIVE",
    title: "Oficinas Automóvel & Mecânica",
    defaultCae: "45200",
    description:
      "Manutenção automóvel, mecânica geral, bate-chapas, pintura e diagnóstico eletrónico.",
    taxNotes:
      "Taxa normal de IVA (23%) com discriminação clara de peças e mão-de-obra mecânica.",
    suggestedUnits: ["h", "un", "l", "conj"],
    templateItems: [
      {
        description:
          "Mão-de-obra de Mecânica e Diagnóstico Eletrónico Computorizado",
        itemType: "LABOR",
        unit: "h",
        estimatedPrice: 38.0,
        vatRate: 23,
      },
      {
        description: "Mudança de Óleo 100% Sintético 5W30 com Filtros",
        itemType: "MATERIAL",
        unit: "conj",
        estimatedPrice: 110.0,
        vatRate: 23,
      },
      {
        description: "Substituição de Pastilhas e Discos de Travão Dianteiros",
        itemType: "SERVICE",
        unit: "un",
        estimatedPrice: 160.0,
        vatRate: 23,
      },
    ],
  },
  GENERAL_SERVICES: {
    id: "GENERAL_SERVICES",
    title: "Serviços Gerais, Limpezas & Manutenção",
    defaultCae: "81210",
    description:
      "Limpezas industriais e domésticas, jardinagem, mudanças e pequenos arranjos polivalentes.",
    taxNotes:
      "Taxa normal de IVA (23%) ou isenção Art. 53.º para pequenos prestadores independentes.",
    suggestedUnits: ["h", "dia", "m2", "vg", "un"],
    templateItems: [
      {
        description: "Serviço de Limpeza Profissional Pós-Obra / Escritórios",
        itemType: "SERVICE",
        unit: "h",
        estimatedPrice: 16.0,
        vatRate: 23,
      },
      {
        description:
          "Manutenção de Espaços Verdes e Jardinagem com Equipamento",
        itemType: "SERVICE",
        unit: "dia",
        estimatedPrice: 120.0,
        vatRate: 23,
      },
      {
        description: "Pequenos Reparos Polivalentes e Manutenção Preventiva",
        itemType: "LABOR",
        unit: "h",
        estimatedPrice: 25.0,
        vatRate: 23,
      },
    ],
  },
};
