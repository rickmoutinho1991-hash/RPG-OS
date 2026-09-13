import { describe, expect, it } from "vitest";
import {
  actionAuthorizationError,
  cancelAction,
  canTransitionActionStatus,
  confirmProposedAction,
  createProposedAction,
  markActionExecuted,
  markActionFailed,
  proposeLifeActions,
  requiresExplicitConfirmation,
  validateProposedAction,
  type ActionPlanScope,
  type ProposedAction,
} from "../ActionPlanService";
import type { LifeContextInput } from "../LifeAssistantService";
import type { ReputationReviewInput } from "../ReputationService";

const SCOPE: ActionPlanScope = {
  userId: "u-owner",
  organizationId: "org-a",
  companyId: null,
};

const TODAY = "2026-08-30";

function lifeCtx(overrides: Partial<LifeContextInput> = {}): LifeContextInput {
  return {
    finance: {
      currentBalance: 1000,
      bills: [],
      debts: [],
      incomes: [],
      expenses: [],
      today: TODAY,
    },
    events: [],
    tasks: [],
    documents: [],
    reminders: [],
    reviews: [],
    ...overrides,
  };
}

function proposal(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return createProposedAction({
    type: "REMINDER",
    title: "Renovar documento",
    description: "Renovar o documento.",
    reason: "O documento expira em 3 dia(s).",
    impact: "Cria um lembrete para não te esqueceres.",
    relatedEntity: { kind: "document", id: "doc-1", label: "Cartão de Cidadão" },
    priority: "HIGH",
    scope: SCOPE,
  }) as ProposedAction;
}

function complaint(overrides: Partial<ReputationReviewInput> = {}): ReputationReviewInput {
  return {
    id: "rev-1",
    authorUserId: "u-client",
    authorName: "Cliente A",
    organizationId: "org-a",
    companyId: null,
    entryType: "COMPLAINT",
    relationType: "CUSTOMER_TO_COMPANY",
    targetType: "COMPANY",
    targetUserId: null,
    targetCompanyId: "comp-1",
    targetProjectId: null,
    targetServiceId: null,
    targetLabel: "Cliente A",
    rating: 2,
    score10: 4,
    title: "Atraso na entrega",
    comment: "O serviço atrasou.",
    status: "SUBMITTED",
    moderation: "APPROVED",
    isPublic: false,
    responseDueAt: null,
    respondedAt: null,
    resolvedAt: null,
    createdBy: "u-client",
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
    ...overrides,
  };
}

describe("ActionPlanService — modelo e transições", () => {
  it("propor nunca executa: createProposedAction só produz PROPOSED e sem efeitos laterais", () => {
    const a = proposal();
    expect(a.status).toBe("PROPOSED");
    expect(a.executedAt).toBeUndefined();
    expect(a.confirmedAt).toBeUndefined();
    expect(validateProposedAction(a)).toEqual([]);
  });

  it("a matriz de transições está conforme o modelo", () => {
    expect(canTransitionActionStatus("PROPOSED", "CONFIRMED")).toBe(true);
    expect(canTransitionActionStatus("PROPOSED", "CANCELLED")).toBe(true);
    expect(canTransitionActionStatus("PROPOSED", "EXECUTED")).toBe(false);
    expect(canTransitionActionStatus("CONFIRMED", "EXECUTED")).toBe(true);
    expect(canTransitionActionStatus("CONFIRMED", "FAILED")).toBe(true);
    expect(canTransitionActionStatus("EXECUTED", "CANCELLED")).toBe(false);
    expect(canTransitionActionStatus("CANCELLED", "EXECUTED")).toBe(false);
  });

  it("ações financeiras exigem confirmação explícita; as outras não", () => {
    expect(requiresExplicitConfirmation("BILL_PAYMENT")).toBe(true);
    expect(requiresExplicitConfirmation("MARK_BILL_PAID")).toBe(true);
    for (const t of ["REMINDER", "TASK", "OBLIGATION_TASK", "EVENT", "FOLLOW_UP", "REPLY_REVIEW"]) {
      expect(requiresExplicitConfirmation(t as never)).toBe(false);
    }
  });

  it("confirmar precisa estar PROPOSED; executar precisa estar CONFIRMED", () => {
    const a = proposal();
    const confirmed = confirmProposedAction(a);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).toBeTruthy();
    const executed = markActionExecuted(confirmed);
    expect(executed.status).toBe("EXECUTED");
    expect(() => markActionExecuted(a)).toThrow(/EXECUTE_INVALID_FROM:PROPOSED/);
    expect(() => confirmProposedAction(confirmed)).toThrow(/CONFIRM_INVALID_FROM:CONFIRMED/);
  });

  it("cancelamento é possível a partir de PROPOSED e CONFIRMED, mas não de terminais", () => {
    const cancelledProposed = cancelAction(proposal(), "deixou de ser necessário");
    expect(cancelledProposed.status).toBe("CANCELLED");
    expect(cancelledProposed.cancelledAt).toBeTruthy();

    const cancelledConfirmed = cancelAction(confirmProposedAction(proposal()));
    expect(cancelledConfirmed.status).toBe("CANCELLED");

    const executed = markActionExecuted(confirmProposedAction(proposal()));
    expect(() => cancelAction(executed)).toThrow(/CANCEL_INVALID_FROM:EXECUTED/);
  });

  it("falha só é registada a partir de CONFIRMED e guarda o motivo", () => {
    const failed = markActionFailed(confirmProposedAction(proposal()), "provedor indisponível");
    expect(failed.status).toBe("FAILED");
    expect(failed.failedReason).toBe("provedor indisponível");
    expect(() => markActionFailed(proposal(), "x")).toThrow(/FAIL_INVALID_FROM:PROPOSED/);
  });

  it("a autorização é do dono e escopada ao mesmo tenant (cross-tenant nega)", () => {
    const a = proposal();
    expect(actionAuthorizationError(a, SCOPE)).toBeNull();
    expect(actionAuthorizationError(a, { ...SCOPE, userId: "u-outro" })).toMatch(/OWNER/);
    const outraOrg: ProposedAction = { ...a, scope: { ...a.scope, organizationId: "org-b" } };
    expect(actionAuthorizationError(outraOrg, SCOPE)).toMatch(/TENANT/);
  });
});

describe("ActionPlanService — motor de decisão", () => {
  it("não propõe nada quando está tudo em dia", () => {
    const { plan, staleActionIds } = proposeLifeActions({
      ...SCOPE,
      ctx: lifeCtx(),
      today: TODAY,
    });
    expect(plan.actions).toHaveLength(0);
    expect(staleActionIds).toEqual([]);
    expect(plan.summary).toContain("Está tudo em dia");
  });

  it("conta vencida vira MARK_BILL_PAID CRITICAL com confirmação e impacto real", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        finance: {
          currentBalance: 500,
          bills: [
            {
              id: "bill-1",
              userId: "u-owner",
              name: "Renda",
              amount: 700,
              dueDate: "2026-08-10",
              recurrence: "MONTHLY",
              category: "RENT",
              status: "PENDING",
              priority: "HIGH",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          ],
          debts: [],
          incomes: [],
          expenses: [],
          today: TODAY,
        },
      }),
    });

    const [a] = plan.actions;
    expect(a.type).toBe("MARK_BILL_PAID");
    expect(a.priority).toBe("CRITICAL");
    expect(a.requiresConfirmation).toBe(true);
    expect(a.relatedEntity).toMatchObject({ kind: "finance_bill", id: "bill-1" });
    expect(a.impact).toContain("descoberto");
  });

  it("conta a vencer dentro de 7 dias vira BILL_PAYMENT com prioridade por dias", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        finance: {
          currentBalance: 1000,
          bills: [
            {
              id: "bill-2",
              userId: "u-owner",
              name: "Luz",
              amount: 80,
              dueDate: "2026-09-01",
              recurrence: "MONTHLY",
              category: "ELECTRICITY",
              status: "PENDING",
              priority: "MEDIUM",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
            {
              id: "bill-3",
              userId: "u-owner",
              name: "Água",
              amount: 40,
              dueDate: "2026-09-05",
              recurrence: "MONTHLY",
              category: "WATER",
              status: "PENDING",
              priority: "MEDIUM",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          ],
          debts: [],
          incomes: [],
          expenses: [],
          today: TODAY,
        },
      }),
    });

    const near = plan.actions.find((a) => a.relatedEntity?.id === "bill-2");
    const far = plan.actions.find((a) => a.relatedEntity?.id === "bill-3");
    expect(near).toBeDefined();
    expect(near?.type).toBe("BILL_PAYMENT");
    expect(near?.priority).toBe("HIGH");
    expect(far).toBeDefined();
    expect(far?.priority).toBe("NORMAL");
  });

  it("documento a expirar gera REMINDER com prioridade por proximidade", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        documents: [
          { id: "doc-x", fileName: "Cartão de Cidadão", expiresAt: "2026-09-02T00:00:00.000Z" },
          { id: "doc-y", fileName: "Carta de Condução", expiresAt: "2026-09-10T00:00:00.000Z" },
        ],
      }),
    });

    const d1 = plan.actions.find((a) => a.relatedEntity?.id === "doc-x");
    const d2 = plan.actions.find((a) => a.relatedEntity?.id === "doc-y");
    expect(d1?.type).toBe("REMINDER");
    expect(d1?.priority).toBe("HIGH");
    expect(d2?.type).toBe("REMINDER");
    expect(d2?.priority).toBe("NORMAL");
  });

  it("reclamação sem resposta vira REPLY_REVIEW (CRITICAL se avaliação baixa)", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({ reviews: [complaint()] }),
    });

    const a = plan.actions.find((x) => x.type === "REPLY_REVIEW");
    expect(a).toBeDefined();
    expect(a?.priority).toBe("CRITICAL");
    expect(a?.relatedEntity?.kind).toBe("reputation_review");
    expect(a?.requiredData.suggestedResponse).toContain("obrigado pelo teu feedback");

    const responded = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({ reviews: [complaint({ status: "RESPONDED", respondedAt: TODAY })] }),
    });
    expect(responded.plan.actions.some((x) => x.type === "REPLY_REVIEW")).toBe(false);
  });

  it("dívida com prestação próxima gera OBLIGATION_TASK", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        finance: {
          currentBalance: 0,
          bills: [],
          debts: [
            {
              id: "debt-1",
              userId: "u-owner",
              creditorName: "Banco Central",
              initialAmount: 5000,
              outstandingAmount: 4200,
              installmentAmount: 250,
              nextDueDate: "2026-09-03",
              status: "OPEN",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          incomes: [],
          expenses: [],
          today: TODAY,
        },
      }),
    });

    const a = plan.actions.find((x) => x.type === "OBLIGATION_TASK");
    expect(a).toBeDefined();
    expect(a?.priority).toBe("HIGH");
    expect(a?.requiresConfirmation).toBe(false);
  });

  it("saldo insuficiente após obrigações gera TASK CRITICAL de reavaliação", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        finance: {
          currentBalance: 100,
          bills: [
            {
              id: "bill-m",
              userId: "u-owner",
              name: "Renda",
              amount: 800,
              dueDate: "2026-09-01",
              recurrence: "MONTHLY",
              category: "RENT",
              status: "PENDING",
              priority: "HIGH",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          ],
          debts: [],
          incomes: [],
          expenses: [],
          today: TODAY,
        },
      }),
    });

    const a = plan.actions.find((x) => x.type === "TASK" && x.relatedEntity === null);
    expect(a).toBeDefined();
    expect(a?.priority).toBe("CRITICAL");
    expect(a?.reason).toContain("saldo");
  });

  it("as ações vêm ordenadas por prioridade e com ids determinísticos", () => {
    const { plan } = proposeLifeActions({
      ...SCOPE,
      today: TODAY,
      ctx: lifeCtx({
        documents: [{ id: "doc-z", fileName: "Seguro", expiresAt: "2026-09-01T00:00:00.000Z" }],
        reviews: [complaint()],
        finance: {
          currentBalance: 1000,
          bills: [],
          debts: [],
          incomes: [],
          expenses: [],
          today: TODAY,
        },
      }),
    });

    const order = plan.actions.map((a) => a.priority);
    expect([...order].sort()).toEqual(order);
    expect(plan.actions[0].type).toBe("REPLY_REVIEW");
    const ids = plan.actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toContain(SCOPE.userId);
  });
});