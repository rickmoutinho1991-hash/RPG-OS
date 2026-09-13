import { describe, expect, it } from "vitest";
import {
  buildFollowUpProposal,
  buildOperationsAlerts,
  buildOrgTimeline,
  computeOperationsOverview,
  type OperationsBundle,
  type OperationsTaskInput,
} from "../OperationsService";
import type { ReputationReviewInput } from "../ReputationService";
import type { FinanceBill } from "../../types/finance";

const NOW = "2026-08-31T12:00:00.000Z";

function task(over: Partial<OperationsTaskInput> = {}): OperationsTaskInput {
  return {
    id: "t1",
    title: "Tarefa X",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    completedAt: null,
    ...over,
  };
}

function review(over: Partial<ReputationReviewInput> = {}): ReputationReviewInput {
  return {
    id: "r1",
    authorUserId: "u1",
    authorName: "Ana",
    organizationId: "org1",
    companyId: null,
    entryType: "COMPLAINT",
    relationType: "CUSTOMER_TO_COMPANY",
    targetType: "COMPANY",
    targetLabel: "RPG-OS",
    rating: 1,
    score10: 2,
    title: "Atraso na entrega",
    comment: "Vieram tarde.",
    status: "SUBMITTED",
    moderation: "APPROVED",
    isPublic: true,
    respondedAt: null,
    resolvedAt: null,
    createdBy: "u1",
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
    ...over,
  };
}

function bill(over: Partial<Pick<FinanceBill, "id" | "name" | "amount" | "dueDate" | "status">> = {}): FinanceBill {
  return {
    id: "b1",
    userId: "u1",
    name: "Luz",
    amount: 120.5,
    dueDate: "2026-08-10",
    recurrence: "MONTHLY",
    category: "ELECTRICITY",
    status: "PENDING",
    priority: "HIGH",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...over,
  } as FinanceBill;
}

function bundle(over: Partial<OperationsBundle> = {}): OperationsBundle {
  return {
    organizationId: "org1",
    tasks: [task()],
    approvals: [],
    reviews: [review()],
    documents: [],
    bills: [],
    members: [{ id: "u1", name: "Ana" }],
    activity: [],
    currentBalance: 1200,
    now: NOW,
    ...over,
  };
}

describe("computeOperationsOverview", () => {
  it("marked critical when overdue urgent task exists", () => {
    const overview = computeOperationsOverview(
      bundle({ tasks: [task({ priority: "URGENT", dueDate: "2026-08-20" })] }),
    );
    expect(overview.tone).toBe("CRITICAL");
    expect(overview.kpi.overdueTasks).toBe(1);
    expect(overview.kpi.overdueUrgentTasks).toBe(1);
    expect(overview.kpi.openTasks).toBe(1);
  });

  it("counts completed tasks within last 7 days", () => {
    const overview = computeOperationsOverview(
      bundle({
        tasks: [
          task({ id: "a", status: "DONE", completedAt: "2026-08-29T10:00:00.000Z" }),
          task({ id: "b", status: "DONE", completedAt: "2026-08-01T10:00:00.000Z" }),
          task({ id: "c" }),
        ],
      }),
    );
    expect(overview.kpi.completedTasks7d).toBe(1);
    expect(overview.kpi.openTasks).toBe(1);
  });

  it("detects stale approvals, unanswered complaints and stale/unpaid bills", () => {
    const overview = computeOperationsOverview(
      bundle({
        approvals: [
          { id: "a1", title: "Orçamento", status: "PENDING", createdAt: "2026-08-30T09:00:00.000Z" },
          { id: "a2", title: "Contrato", status: "PENDING", createdAt: "2026-08-01T09:00:00.000Z" },
          { id: "a3", title: "Feito", status: "APPROVED", createdAt: "2026-08-01T09:00:00.000Z" },
        ],
        bills: [
          bill({ id: "vencida", dueDate: "2026-08-05" }),
          bill({ id: "aPrazo", dueDate: "2026-09-02", status: "PAID" }),
          bill({ id: "emBreve", dueDate: "2026-09-03" }),
        ],
      }),
    );
    expect(overview.kpi.pendingApprovals).toBe(2);
    expect(overview.kpi.staleApprovals).toBe(1);
    expect(overview.kpi.unansweredComplaints).toBe(1);
    expect(overview.kpi.overdueBills).toBe(1);
    expect(overview.kpi.billsDue7d).toBe(1);
    expect(overview.tone).toBe("CRITICAL");
  });

  it("marks attention when only upcoming obligations exist", () => {
    const overview = computeOperationsOverview(
      bundle({
        tasks: [],
        reviews: [],
        bills: [bill({ dueDate: "2026-09-03" })],
        documents: [{ id: "d1", fileName: "Seguro", status: "ACTIVE", expiresAt: "2026-09-06" }],
      }),
    );
    expect(overview.kpi.billsDue7d).toBe(1);
    expect(overview.tone).toBe("ATTENTION");
    expect(overview.statusLabel).toMatch(/estável/);
  });

  it("marks calm when everything is in order", () => {
    const overview = computeOperationsOverview(
      bundle({
        tasks: [task({ status: "IN_PROGRESS", dueDate: "2026-09-20" })],
        reviews: [review({ respondedAt: "2026-08-22T10:00:00.000Z" })],
      }),
    );
    expect(overview.tone).toBe("CALM");
  });
});

describe("buildOperationsAlerts", () => {
  it("derives alerts for stale approval, unanswered complaint, overdue bill, urgent task and expiring doc", () => {
    const alerts = buildOperationsAlerts(
      bundle({
        tasks: [task({ priority: "URGENT", dueDate: "2026-08-20" })],
        approvals: [{ id: "a1", title: "Orçamento", status: "PENDING", createdAt: "2026-08-20T09:00:00.000Z" }],
        bills: [bill({ id: "vencida", name: "Renda", amount: 850, dueDate: "2026-08-05" })],
        documents: [{ id: "d1", fileName: "Seguro", status: "ACTIVE", expiresAt: "2026-09-02" }],
      }),
    );
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain("STALE_APPROVAL");
    expect(kinds).toContain("UNANSWERED_COMPLAINT");
    expect(kinds).toContain("OVERDUE_BILL");
    expect(kinds).toContain("OVERDUE_URGENT_TASK");
    expect(kinds).toContain("DOC_EXPIRING");
    const billAlert = alerts.find((a) => a.kind === "OVERDUE_BILL");
    expect(billAlert?.severity).toBe("URGENT");
    const complaintAlert = alerts.find((a) => a.kind === "UNANSWERED_COMPLAINT");
    expect(complaintAlert?.severity).toBe("URGENT");
  });

  it("ignores recent approvals and bills due later than 7 days", () => {
    const alerts = buildOperationsAlerts(
      bundle({
        approvals: [{ id: "a1", title: "Novo", status: "PENDING", createdAt: "2026-08-30T09:00:00.000Z" }],
        bills: [bill({ id: "longe", dueDate: "2026-10-01" })],
      }),
    );
    expect(alerts).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "STALE_APPROVAL" })]));
    expect(alerts).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "BILL_DUE_SOON" })]));
  });

  it("caps each alert kind to avoid flooding the cockpit", () => {
    const stale = buildOperationsAlerts(
      bundle({
        approvals: Array.from({ length: 12 }, (_, i) => ({
          id: `a${i}`,
          title: `A${i}`,
          status: "PENDING" as const,
          createdAt: "2026-08-01T09:00:00.000Z",
        })),
      }),
    ).filter((a) => a.kind === "STALE_APPROVAL");
    expect(stale.length).toBeLessThanOrEqual(5);
  });

  it("attaches actionable targets with navigation hrefs", () => {
    const [alert] = buildOperationsAlerts(
      bundle({
        approvals: [{ id: "a1", title: "Orçamento", status: "PENDING", createdAt: "2026-08-01T09:00:00.000Z" }],
      }),
    );
    expect(alert.target).toEqual({ kind: "APPROVAL", id: "a1", label: "Orçamento", href: "/aprovacoes" });
  });
});

describe("buildOrgTimeline", () => {
  it("sorts descending and labels events by source", () => {
    const timeline = buildOrgTimeline(
      bundle({
        activity: [
          {
            id: "ev1",
            source: "TASK",
            action: "CREATE_FOLLOW_UP",
            kind: "TASK",
            label: "Follow-up",
            actorName: "Ana",
            timestamp: "2026-08-31T10:00:00.000Z",
          },
          {
            id: "ev0",
            source: "REPUTATION",
            action: "RESPOND",
            kind: "REPUTATION",
            label: "Resposta",
            timestamp: "2026-08-31T11:00:00.000Z",
          },
          {
            id: "ev2",
            source: "AUDIT",
            action: "WORKFLOW_APPROVED",
            kind: "APPROVAL",
            label: "Aprovação",
            timestamp: "2026-08-30T09:00:00.000Z",
          },
        ],
      }),
    );
    expect(timeline.map((e) => e.id)).toEqual(["REPUTATION:ev0", "TASK:ev1", "AUDIT:ev2"]);
    expect(timeline[0].label).toBe("publicou uma resposta");
    expect(timeline[1].label).toContain("follow-up");
    expect(timeline[2].label).toBe("aprovou um pedido");
  });

  it("respects the max entries cap", () => {
    const timeline = buildOrgTimeline(
      bundle({
        activity: Array.from({ length: 60 }, (_, i) => ({
          id: `a${i}`,
          source: "TASK" as const,
          action: "UPDATE" as const,
          kind: "TASK" as const,
          label: "T",
          timestamp: new Date(NOW).getTime() - i * 1000 > 0 ? new Date(new Date(NOW).getTime() - i * 1000).toISOString() : NOW,
        })),
      }),
      20,
    );
    expect(timeline.length).toBe(20);
  });
});

describe("buildFollowUpProposal", () => {
  it("normalizes defaults with priority MEDIUM and custom title", () => {
    const res = buildFollowUpProposal({
      alertKind: "OVERDUE_BILL",
      targetLabel: "Luz",
      title: "Pagar faturação",
      priority: "HIGH",
      dueDate: "2026-09-05",
      note: "Pedir fatura em nome da empresa.",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.title).toBe("Pagar faturação");
    expect(res.proposal.priority).toBe("HIGH");
    expect(res.proposal.dueDate).toBe("2026-09-05T00:00:00.000Z");
    expect(res.proposal.note).toBe("Pedir fatura em nome da empresa.");
  });

  it("rejects invalid alert kinds and invalid dates", () => {
    expect(buildFollowUpProposal({ alertKind: "NOT_A_KIND" as never }).ok).toBe(false);
    expect(buildFollowUpProposal({ alertKind: "OVERDUE_BILL", dueDate: "not-a-date" }).ok).toBe(false);
  });
});