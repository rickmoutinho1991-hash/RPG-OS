import { describe, expect, it } from "vitest";
import {
  analyzeReputationContent,
  askReputationAssistant,
  assertReputationImmutables,
  buildReputationMetrics,
  buildReputationOverview,
  canCreateReputation,
  canDeleteDraft,
  canEditDraft,
  canManageReputation,
  canModerateReputation,
  canRequestDeleteReputation,
  canRespondReputation,
  canTransitionReputation,
  canViewReputationReview,
  moderationForSubmission,
  planReputationAutomation,
  RELATION_TARGET_MAP,
  validateReputationCreate,
  type ReputationActor,
  type ReputationReviewInput,
} from "../ReputationService";

const T0 = "2026-08-01T09:00:00.000Z";

function review(overrides: Partial<ReputationReviewInput> = {}): ReputationReviewInput {
  return {
    id: "r1",
    authorUserId: "u-author",
    authorName: "Autor Teste",
    organizationId: "org-rpgos",
    companyId: null,
    entryType: "COMPLAINT",
    relationType: "CUSTOMER_TO_COMPANY",
    targetType: "COMPANY",
    targetUserId: null,
    targetCompanyId: "c-target",
    targetProjectId: null,
    targetServiceId: null,
    targetLabel: "Cliente X",
    rating: 2,
    score10: 4,
    title: "Atraso na entrega",
    comment: "O serviço atrasou duas semanas.",
    status: "SUBMITTED",
    moderation: "APPROVED",
    isPublic: false,
    responseDueAt: null,
    respondedAt: null,
    resolvedAt: null,
    createdBy: "u-author",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function actor(userId: string, permissions: string[]): ReputationActor {
  return { userId, permissions };
}

describe("ReputationService — criação", () => {
  it("valida a combinação relação → alvo", () => {
    expect(RELATION_TARGET_MAP.CUSTOMER_TO_COMPANY).toBe("COMPANY");
    const bad = validateReputationCreate(
      review({
        relationType: "CUSTOMER_TO_COMPANY",
        targetType: "EMPLOYEE",
        rating: 4,
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("COMPANY");
  });

  it("exige avaliação 1–5 em reclamações e avaliações", () => {
    const missing = validateReputationCreate(review({ rating: null }));
    expect(missing.ok).toBe(false);
    const invalid = validateReputationCreate(review({ rating: 0 }));
    expect(invalid.ok).toBe(false);
    const valid = validateReputationCreate(
      review({ entryType: "REVIEW", rating: 4, score10: 7 }),
    );
    expect(valid.ok).toBe(true);
    const praise = validateReputationCreate(
      review({ entryType: "PRAISE", rating: null, score10: null }),
    );
    expect(praise.ok).toBe(true);
  });

  it("exige título e limita comentário", () => {
    expect(validateReputationCreate(review({ title: "   " })).ok).toBe(false);
    expect(validateReputationCreate(review({ title: "Ok" })).ok).toBe(true);
    expect(validateReputationCreate(review({ title: "Ok", comment: "x".repeat(5001) })).ok).toBe(false);
  });

  it("exige destinatário na avaliação de colaborador", () => {
    const r = validateReputationCreate(
      review({
        relationType: "CUSTOMER_TO_EMPLOYEE",
        targetType: "EMPLOYEE",
        targetUserId: null,
        rating: 5,
      }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("ReputationService — permissões", () => {
  it("autor vê, responde e gere drafts; anónimo sem permissão não vê", () => {
    const r = review();
    const author = actor("u-author", []);
    const outsider = actor("u-x", []);
    expect(canViewReputationReview(author, r)).toBe(true);
    expect(canViewReputationReview(outsider, r)).toBe(false);
    expect(canCreateReputation(author, r)).toBe(true);
  });

  it("alvo pode responder; outsiders só com permissão", () => {
    const r = review({ targetUserId: "u-target" });
    expect(canRespondReputation(actor("u-target", []), r)).toBe(true);
    expect(canRespondReputation(actor("u-x", []), r)).toBe(false);
    expect(canRespondReputation(actor("u-x", ["*"]), r)).toBe(true);
  });

  it("wildcards de módulo: manage/admin implicam ações do módulo", () => {
    expect(canViewReputationReview(actor("u-x", ["reputation.manage"]), review())).toBe(true);
    expect(canRespondReputation(actor("u-x", ["reputation.manage"]), review())).toBe(true);
    expect(canManageReputation(actor("u-x", ["reputation.admin"]))).toBe(true);
    expect(canManageReputation(actor("u-x", ["reputation.view"]))).toBe(false);
  });

  it("editar/apagar drafts apenas pelo autor", () => {
    const draft = review({ status: "DRAFT" });
    expect(canEditDraft(actor("u-author", []), draft)).toBe(true);
    expect(canEditDraft(actor("u-x", ["*"]), draft)).toBe(false);
    expect(canDeleteDraft(actor("u-author", []), draft)).toBe(true);
    expect(canDeleteDraft(actor("u-author", []), review({ status: "SUBMITTED" }))).toBe(false);
  });

  it("pedido de eliminação do autor ou com gestão; moderação só com permissão", () => {
    const r = review();
    expect(canRequestDeleteReputation(actor("u-author", []), r)).toBe(true);
    expect(canModerateReputation(actor("u-x", ["reputation.moderate"]))).toBe(true);
    expect(canModerateReputation(actor("u-x", ["reputation.view"]))).toBe(false);
  });
});

describe("ReputationService — imutabilidade de autor/tenant/relação", () => {
  it("bloqueia alteração de autor", () => {
    expect(assertReputationImmutables(review(), { authorUserId: "u-outro" })).toContain("autor");
  });
  it("bloqueia alteração de tenant (org e empresa)", () => {
    expect(assertReputationImmutables(review(), { organizationId: "org-outra" })).toContain("tenant");
    expect(assertReputationImmutables(review(), { companyId: "c-outra" })).toContain("tenant");
  });
  it("bloqueia alteração de tipo/relação/alvo", () => {
    expect(assertReputationImmutables(review(), { entryType: "PRAISE" })).toContain("tipo");
    expect(assertReputationImmutables(review(), { relationType: "COMPANY_TO_CUSTOMER" })).toContain("relação");
    expect(assertReputationImmutables(review(), { targetType: "EMPRAISE" as never })).not.toBeNull();
  });
  it("permite editar campos livres", () => {
    expect(assertReputationImmutables(review(), { title: "Novo título", comment: "nova descrição" })).toBeNull();
  });
});

describe("ReputationService — máquina de estados", () => {
  it("DRAFT → SUBMITTED apenas pelo autor", () => {
    const r = review({ status: "DRAFT" });
    expect(canTransitionReputation("DRAFT", "SUBMITTED", actor("u-author", []), r).allowed).toBe(true);
    expect(canTransitionReputation("DRAFT", "SUBMITTED", actor("u-x", ["reputation.manage"]), r).allowed).toBe(false);
  });

  it("SUBMITTED → RESPONDED é do alvo (targetOnly)", () => {
    const r = review({ targetUserId: "u-target", status: "SUBMITTED" });
    expect(canTransitionReputation("SUBMITTED", "RESPONDED", actor("u-target", []), r).allowed).toBe(true);
    expect(canTransitionReputation("SUBMITTED", "RESPONDED", actor("u-manager", ["reputation.respond"]), r).allowed).toBe(true);
    expect(canTransitionReputation("SUBMITTED", "RESPONDED", actor("u-x", []), r).allowed).toBe(false);
  });

  it("transições de gestão exigem reputation.manage; rejeição exige moderação", () => {
    const r = review();
    expect(canTransitionReputation("SUBMITTED", "RESOLVED", actor("u-x", ["reputation.manage"]), r).allowed).toBe(true);
    expect(canTransitionReputation("SUBMITTED", "RESOLVED", actor("u-x", ["reputation.view"]), r).allowed).toBe(false);
    expect(canTransitionReputation("SUBMITTED", "REJECTED", actor("u-x", ["reputation.moderate"]), r).allowed).toBe(true);
  });

  it("CLOSED é terminal", () => {
    expect(canTransitionReputation("CLOSED", "RESOLVED", actor("u-x", ["*"]), review()).allowed).toBe(false);
  });
});

describe("ReputationService — moderação (nunca rejeita automaticamente)", () => {
  it("marca ABUSE", () => {
    const a = analyzeReputationContent("Este gajo é um idiota de marca maior");
    expect(a.flags).toContain("ABUSE");
    expect(a.moderation).toBe("FLAGGED");
  });

  it("marca informação pessoal (NIF) sem apagar", () => {
    const a = analyzeReputationContent("O NIF é 509123456 e o email x@x.pt");
    expect(a.flags).toContain("PERSONAL_INFO");
    expect(a.moderation).toBe("FLAGGED");
  });

  it("marca SPAM e conteúdos DEFAMATORY como exigindo moderação", () => {
    expect(analyzeReputationContent("olá!!! impróprio!!! spam!!!").flags).toContain("SPAM");
    const d = analyzeReputationContent("Este senhor é um vigarista e enganou-me.");
    expect(d.flags).toContain("DEFAMATORY");
    expect(d.moderation).toBe("MODERATION_REQUIRED");
  });

  it("marca anexos suspeitos e nunca devolve REJECTED", () => {
    const ext = analyzeReputationContent("fatura", { fileName: "virus.exe", mimeType: "application/x-msdownload" });
    expect(ext.flags).toContain("SUSPICIOUS_ATTACHMENT");
    expect(ext.moderation).toBe("MODERATION_REQUIRED");
    expect(moderationForSubmission("comportamento normal")).toEqual({ flags: [], moderation: "APPROVED" });
  });
});

describe("ReputationService — métricas", () => {
  it("calcula média, distribuição e totais", () => {
    const m = buildReputationMetrics([
      review({
        id: "a",
        authorName: "Cliente A",
        targetLabel: "Cliente A",
        entryType: "COMPLAINT",
        rating: 2,
        status: "SUBMITTED",
        createdAt: "2026-08-02T10:00:00.000Z",
      }),
      review({
        id: "b",
        authorName: "Cliente B",
        targetLabel: "Cliente B",
        entryType: "REVIEW",
        rating: 5,
        status: "RESOLVED",
        moderation: "APPROVED",
        createdAt: "2026-08-15T10:00:00.000Z",
      }),
      review({
        id: "c",
        authorName: "Cliente C",
        targetLabel: "Cliente C",
        entryType: "PRAISE",
        rating: 5,
        status: "CLOSED",
        moderation: "APPROVED",
        createdAt: "2026-08-20T10:00:00.000Z",
      }),
      review({ id: "d", rating: 1, status: "DRAFT", targetLabel: "Rascunho" }),
    ]);
    // 3 visíveis (draft excluído): média (2+5+5)/3 = 4
    expect(m.globalRating).toBe(4);
    expect(m.reviewCount).toBe(3);
    expect(m.totalCount).toBe(3);
    expect(m.complaints).toBe(1);
    expect(m.complaintsOpen).toBe(1);
    expect(m.praises).toBe(1);
    expect(m.starDistribution["2"]).toBe(1);
    expect(m.starDistribution["5"]).toBe(2);
    expect(m.monthlyEvolution).toHaveLength(1);
    expect(m.monthlyEvolution[0].month).toBe("2026-08");
  });

  it("calcula taxa de resolução e tempo médio de resposta", () => {
    const m = buildReputationMetrics([
      review({
        id: "a",
        entryType: "COMPLAINT",
        status: "RESOLVED",
        createdAt: "2026-08-01T09:00:00.000Z",
        respondedAt: "2026-08-01T11:00:00.000Z",
      }),
      review({ id: "b", entryType: "COMPLAINT", status: "SUBMITTED", rating: 3 }),
      review({ id: "c", entryType: "COMPLAINT", status: "CLOSED", rating: 4 }),
      review({ id: "d", entryType: "COMPLAINT", status: "SUBMITTED", rating: 4 }),
    ]);
    expect(m.resolutionRate).toBeCloseTo(50);
    expect(m.avgResponseHours).toBe(2);
  });

  it("buildReputationOverview agrupa recentes, queixas ativas, elogios e recomendações", () => {
    const ov = buildReputationOverview([
      review(),
      review({ id: "b", entryType: "RECOMMENDATION", rating: 5, targetLabel: "Cliente Y" }),
      review({ id: "c", entryType: "PRAISE", rating: 5, targetLabel: "Colaborador Pedro" }),
    ]);
    expect(ov.recent).toHaveLength(3);
    expect(ov.activeComplaints).toHaveLength(1);
    expect(ov.praise).toHaveLength(1);
    expect(ov.recommendations).toHaveLength(1);
  });
});

describe("ReputationService — plano de automação", () => {
  it("reclamação crítica → caso CRITICAL + notificação + tarefa com prazo 24h", () => {
    const actions = planReputationAutomation(
      review({ rating: 1, score10: 2, createdBy: "u-author", createdAt: "2026-08-01T09:00:00.000Z" }),
      { responsibleUserId: "u-responsavel", now: "2026-08-01T09:00:00.000Z" },
    );
    expect(actions.some((a) => a.type === "CREATE_CASE" && a.caseType === "CRITICAL")).toBe(true);
    expect(actions.some((a) => a.type === "NOTIFY" && a.recipientUserId === "u-responsavel")).toBe(true);
    const task = actions.find((a) => a.type === "CREATE_TASK");
    expect(task?.taskDueAt).toBe("2026-08-02T09:00:00.000Z");
  });

  it("elogio → reconhecimento ao elogiado", () => {
    const actions = planReputationAutomation(
      review({ entryType: "PRAISE", rating: 5, targetUserId: "u-pedro", title: "Excelente obra" }),
      { responsibleUserId: null, now: T0 },
    );
    expect(actions.some((a) => a.type === "NOTIFY" && a.recipientUserId === "u-pedro")).toBe(true);
  });

  it("reclamação sem resposta após 48h → caso UNANSWERED", () => {
    const actions = planReputationAutomation(
      review({ createdAt: "2026-07-30T09:00:00.000Z", respondedAt: null }),
      { responsibleUserId: null, now: "2026-08-01T10:00:00.000Z" },
    );
    expect(actions.some((a) => a.type === "CREATE_CASE" && a.caseType === "UNANSWERED")).toBe(true);
  });
});

describe("ReputationService — assistente (10 perguntas)", () => {
  const data = {
    reviews: [
      review({
        id: "a",
        authorName: "Mariana",
        targetLabel: "Mariana",
        entryType: "COMPLAINT",
        rating: 2,
        status: "SUBMITTED",
        title: "Atraso na remessa",
        createdAt: "2026-08-02T09:00:00.000Z",
      }),
      review({
        id: "b",
        authorName: "João",
        targetLabel: "João",
        entryType: "RECOMMENDATION",
        rating: 5,
        status: "CLOSED",
        title: "Recomendo",
        createdAt: "2026-08-05T09:00:00.000Z",
      }),
      review({
        id: "c",
        authorName: "Sofia",
        targetLabel: "Colaborador Pedro",
        entryType: "PRAISE",
        targetUserId: "u-pedro",
        rating: 5,
        status: "RESPONDED",
        title: "Trabalho excelente",
        createdAt: "2026-08-10T09:00:00.000Z",
      }),
      review({
        id: "d",
        authorName: "Carla",
        targetLabel: "Serviço Pintura",
        entryType: "REVIEW",
        targetType: "SERVICE",
        rating: 1,
        status: "SUBMITTED",
        title: "Pintura mal acabada",
        createdAt: "2026-08-12T09:00:00.000Z",
      }),
      review({
        id: "e",
        authorName: "Rita",
        targetLabel: "Serviço Canalização",
        entryType: "REVIEW",
        targetType: "EMPLOYEE",
        targetUserId: "u-pedro",
        rating: 5,
        status: "RESOLVED",
        title: "Rápido e profissional",
        createdAt: "2026-08-15T09:00:00.000Z",
      }),
      review({
        id: "f",
        authorName: "António",
        targetLabel: "António",
        entryType: "COMPLAINT",
        rating: 3,
        status: "SUBMITTED",
        title: "Facturação confusa",
        createdAt: "2026-08-18T09:00:00.000Z",
      }),
      review({ id: "g", entryType: "COMPLAINT", rating: 4, status: "RESOLVED", title: "Garantia", createdAt: "2026-08-20T09:00:00.000Z", respondedAt: "2026-08-21T09:00:00.000Z" }),
    ],
    today: "2026-08-30",
  };

  it("responde às 10 perguntas previstas", () => {
    const cases: Array<[string, string, (s: string) => boolean]> = [
      ["Como está a minha reputação?", "REP_GLOBAL", (s) => s.includes("reputação média")],
      ["Tenho reclamações abertas?", "REP_OPEN_COMPLAINTS", (s) => s.includes("reclamação(ões) em aberto")],
      ["Que clientes estão insatisfeitos?", "REP_UNSATISFIED_CLIENTS", (s) => s.includes("avaliação(ões) negativa(s)")],
      ["Quais serviços têm pior avaliação?", "REP_WORST_SERVICES", (s) => s.includes("Serviços com pior avaliação")],
      ["Quem recebeu mais elogios?", "REP_MOST_PRAISED", (s) => s.includes("elogio(s)")],
      ["Qual colaborador tem melhor avaliação?", "REP_BEST_EMPLOYEE", (s) => s.includes("melhor avaliação")],
      ["Qual é a taxa de resolução?", "REP_RESOLUTION_RATE", (s) => s.includes("Taxa de resolução")],
      ["Tenho reclamações sem resposta?", "REP_UNANSWERED", (s) => s.includes("por responder")],
      ["Que clientes recomendaram a empresa?", "REP_RECOMMENDERS", (s) => s.includes("recomendação(ões)")],
      ["Qual é a média deste mês?", "REP_MONTHLY_AVERAGE", (s) => s.includes("média deste mês")],
    ];
    for (const [q, intent, pred] of cases) {
      const res = askReputationAssistant(q, data);
      expect(res.intent, q).toBe(intent);
      expect(pred(res.answer), q).toBe(true);
    }
  });

  it("perguntas desconhecidas devolvem UNKNOWN", () => {
    expect(askReputationAssistant("Quando vence a renda?", data).intent).toBe("UNKNOWN");
  });

  it("responde às novas perguntas de produção (FASE 3.1)", () => {
    const cases: Array<[string, string, (s: string) => boolean]> = [
      ["Quantas avaliações de 5 estrelas tivemos?", "REP_FIVE_STAR_COUNT", (s) => s.includes("5 estrelas")],
      ["Quais clientes reclamaram este mês?", "REP_MONTH_COMPLAINTS", (s) => s.includes("este mês")],
      ["Quem está com pior avaliação?", "REP_UNSATISFIED_CLIENTS", (s) => s.includes("avaliação(ões) negativa(s)")],
      ["Mostra as reclamações abertas.", "REP_OPEN_COMPLAINTS", (s) => s.includes("em aberto")],
      ["Qual serviço tem pior reputação?", "REP_WORST_SERVICES", (s) => s.includes("pior avaliação")],
      ["Qual funcionário recebeu melhor avaliação?", "REP_BEST_EMPLOYEE", (s) => s.includes("melhor avaliação")],
      ["Temos reclamações sem resposta?", "REP_UNANSWERED", (s) => s.includes("por responder")],
      ["Como evoluiu a nossa reputação?", "REP_EVOLUTION", (s) => s.includes("Evolução da reputação")],
    ];
    for (const [q, intent, pred] of cases) {
      const res = askReputationAssistant(q, data);
      expect(res.intent, q).toBe(intent);
      expect(pred(res.answer), q + " => " + res.answer).toBe(true);
    }
  });
});