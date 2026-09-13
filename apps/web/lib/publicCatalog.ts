import { NAV_GROUPS } from "@/lib/navigation";
import { demoProposalSteps } from "@/lib/demo/marketplaceStory";

export type ActorTag = "Pessoa" | "Independente" | "Empresa" | "Fornecedor";

export const ACTORS: ActorTag[] = [
  "Pessoa",
  "Independente",
  "Empresa",
  "Fornecedor",
];

export interface CatalogService {
  href: string;
  label: string;
  description: string;
  badges: string[];
  actors: ActorTag[];
}

export interface CatalogDomain {
  id: string;
  title: string;
  tagline: string;
  services: CatalogService[];
  demo?: boolean;
}

const ALL: ActorTag[] = ["Pessoa", "Independente", "Empresa", "Fornecedor"];
const PESSOA: ActorTag[] = ["Pessoa", "Independente", "Empresa"];
const NEGOCIO: ActorTag[] = ["Independente", "Empresa"];
const OBRAS: ActorTag[] = ["Independente", "Empresa", "Fornecedor"];

/** Relevância por página — usada pelos chips (realçam, nunca escondem). */
const ACTOR_BY_HREF: Record<string, ActorTag[]> = {
  "/vida": ["Pessoa"],
  "/perfil": ["Pessoa"],
  "/diario": ["Pessoa"],
  "/documentos": ["Pessoa", "Independente", "Empresa", "Fornecedor"],
  "/conhecimento": ["Pessoa", "Independente", "Empresa", "Fornecedor"],
  "/rgpd": ["Pessoa", "Empresa"],
  "/": ALL,
  "/operacoes": NEGOCIO,
  "/tarefas": ALL,
  "/agenda": ALL,
  "/aprovacoes": NEGOCIO,
  "/comunicacao": ALL,
  "/clientes": NEGOCIO,
  "/empresas": NEGOCIO,
  "/orcamentos": OBRAS,
  "/faturacao": NEGOCIO,
  "/obras": OBRAS,
  "/guias": OBRAS,
  "/banco": NEGOCIO,
  "/financas": NEGOCIO,
  "/contabilidade": NEGOCIO,
  "/fiscal": NEGOCIO,
  "/administracao/fiscal": NEGOCIO,
  "/reputacao": ALL,
  "/reputacao/reclamacoes": ALL,
  "/reputacao/recomendacoes": ALL,
  "/reputacao/elogios": ALL,
  "/reputacao/avaliacoes": ALL,
  "/reputacao/metricas": ALL,
  "/ia": ALL,
  "/auditoria": ["Empresa"],
  "/integracoes": ["Empresa"],
  "/planos": PESSOA,
  "/dispositivos": PESSOA,
  "/administracao": ["Empresa"],
  "/administracao/receita": ["Empresa"],
  "/administracao/governo": ["Empresa"],
  "/administracao/at": ["Empresa"],
  "/administracao/empresas": ["Empresa"],
};

/** Descrição de 1 linha PT-PT por página — fonte do catálogo público. */
const DESC_BY_HREF: Record<string, string> = {
  "/vida": "Contexto pessoal em um único lugar — contactos, preferências e dados que dão resposta a cada fluxo.",
  "/": "Visão diária: briefing matinal, ações urgentes, KPIs e o que precisa de si.",
  "/operacoes": "Centro de operações para quem executa — obras, entregas e prestadores no terreno.",
  "/tarefas": "Tarefas com prioridade, prazo e histórico, pessoais e de equipa.",
  "/agenda": "Compromissos, rotinas de saúde e lembretes num calendário único.",
  "/aprovacoes": "Fluxos de aprovação com rasto, responsabilidade e histórico.",
  "/comunicacao": "Mensagens e pedidos ligados ao contexto de cada processo.",
  "/diario": "Registo diário com reflexões e eventos, com gravação em áudio opcional.",
  "/clientes": "Carteira de clientes com histórico, avaliações e contexto partilhado.",
  "/empresas": "Empresas próprias e associadas com estrutura e permissões.",
  "/orcamentos": "Orçamentos estruturados que convertem em obra com um único passo.",
  "/faturacao": "Faturação SAF-T com taxas automáticas e documentos de transporte.",
  "/obras": "Obras e projetos com marcos, evidências e pagamento por fase.",
  "/guias": "Guias de transporte AT com rastreio e documento fiscal por movimento.",
  "/banco": "Contas, movimentos e previsão financeira em tempo real.",
  "/financas": "Indicadores consolidados — receitas, custos e liquidez.",
  "/contabilidade": "Lançamentos, plano de contas e fechos com base documental.",
  "/fiscal": "Declarações, retenções e marcos de Segurança Social.",
  "/administracao/fiscal": "Ligações ao e-fatura e validação de contribuintes.",
  "/reputacao": "Reputação agregada — avaliações, recomendações e contestações.",
  "/reputacao/reclamacoes": "Contestações documentadas com histórico e resolução.",
  "/reputacao/recomendacoes": "Recomendações verificáveis como prova social.",
  "/reputacao/elogios": "Elogios com contexto e timestamps.",
  "/reputacao/avaliacoes": "Avaliações por critério, com verificação.",
  "/reputacao/metricas": "Indicadores de reputação ao longo do tempo.",
  "/documentos": "Documentação com categorias, versões e acesso controlado.",
  "/conhecimento": "Wiki e procedimentos internos com contexto e histórico.",
  "/perfil": "Dados pessoais, preferências e definições de privacidade.",
  "/ia": "Assistente que separa factos, inferências e recomendações.",
  "/auditoria": "Registo imutável de eventos e ações para conformidade.",
  "/integracoes": "Ligações a serviços externos e APIs com controlo de acesso.",
  "/rgpd": "Consentimentos, apagamento e portabilidade de dados.",
  "/planos": "Planos e subscrição com gestão de acesso.",
  "/dispositivos": "Sessões e dispositivos ativos com revogação rápida.",
  "/administracao": "Configuração da organização e controlo de acesso.",
  "/administracao/receita": "Métricas de utilização e receita da plataforma.",
  "/administracao/governo": "Ligações seguras a serviços do Estado (AT/SS).",
  "/administracao/at": "Conexão e validação fiscal junto da Autoridade Tributária.",
  "/administracao/empresas": "Gestão de empresas registadas e respetivas permissões.",
};

const DOMAIN_TAGLINE: Record<string, string> = {
  vida: "A sua vida organizada — contexto pessoal, saúde, rotinas e o que é importante para si, num só lugar.",
  trabalho:
    "O dia-a-dia do trabalho: tarefas, agenda, aprovações e comunicação sempre com contexto.",
  negocio:
    "Da carteira de clientes à faturação — obras, guias e banco com visão integrada de negócio.",
  financas:
    "Centro financeiro, contabilidade e fiscal como marcos com data certa, não como surpresas.",
  operacoes:
    "Command Center, operações e administração — a camada que decide, executa e audita tudo.",
  mercado:
    "Um mercado onde o pedido descreve o problema, as propostas chegam comparáveis e o pagamento acompanha as entregas.",
};

/**
 * Catálogo público de capacidades — derivado de NAV_SOURCE (lib/navigation.ts),
 * a fonte única da navegação do produto (sem listas duplicadas, §159).
 * O domínio "mercado" reutiliza o dataset sintético da demonstração (§2.2).
 */
export function buildPublicCatalog(): CatalogDomain[] {
  const groupByNav = (navLabel: string): CatalogDomain => {
    const group = NAV_GROUPS.find((g) => g.label === navLabel);
    if (!group) return { id: "?", title: navLabel, tagline: "", services: [] };
    const domainId = (
      {
        Vida: "vida",
        Trabalho: "trabalho",
        Negócio: "negocio",
        Finanças: "financas",
      } as Record<string, string>
    )[navLabel];
    const id = domainId ?? "operacoes";
    return {
      id,
      title: navLabel,
      tagline: DOMAIN_TAGLINE[id],
      services: group.items.map((item) => ({
        href: item.href,
        label: item.label,
        description: DESC_BY_HREF[item.href] ?? item.label,
        badges: item.badge ? [item.badge] : [],
        actors: ACTOR_BY_HREF[item.href] ?? ALL,
      })),
    };
  };

  const navDomains = [
    groupByNav("Vida"),
    groupByNav("Trabalho"),
    groupByNav("Negócio"),
    groupByNav("Finanças"),
    {
      ...groupByNav("Operações"),
      title: "Operações",
      tagline: DOMAIN_TAGLINE.operacoes,
      services: [
        ...(["Início", "Operações", "Conhecimento", "Pessoas", "IA", "Administração"].flatMap(
          (label) => {
            const g = NAV_GROUPS.find((gr) => gr.label === label);
            if (!g) return [];
            return g.items.map((item) => ({
              href: item.href,
              label: item.label,
              description: DESC_BY_HREF[item.href] ?? item.label,
              badges: item.badge ? [item.badge] : [],
              actors: ACTOR_BY_HREF[item.href] ?? ALL,
            }));
          },
        )),
      ],
    },
  ];

  const mercadoDomain: CatalogDomain = {
    id: "mercado",
    title: "Mercado",
    tagline: DOMAIN_TAGLINE.mercado,
    demo: true,
    services: demoProposalSteps.map((step) => ({
      href: `#${step.id}`,
      label: step.title,
      description: step.short,
      badges: [],
      actors: ALL,
    })),
  };

  return [...navDomains, mercadoDomain];
}

/** Serviços cujo perfil de ator inclui o ator selecionado (realçar sem esconder). */
export function isRelevantForActor(service: CatalogService, actor: ActorTag): boolean {
  return service.actors.includes(actor);
}