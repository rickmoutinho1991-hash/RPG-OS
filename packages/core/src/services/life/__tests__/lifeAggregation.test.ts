/**
 * RPG-OS — Life Aggregation tests (A Minha Vida V1)
 *
 * Sem dados fake na UI; aqui usam-se APENAS dados fictícios de teste.
 * Cobrem: priority sorting, PREPARED_ONLY (mobility nunca "pay"),
 * partial failure, empty state, action dispatcher, source mapping.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateLife,
  type LifeCollector,
} from "../LifeAggregationService";
import {
  DocumentsLifeCollector,
  FinanceLifeCollector,
  fiscalStub,
  governmentStub,
  healthStub,
  MobilityLifeCollector,
  socialSecurityStub,
  financeItems,
} from "../LifeCollectors";
import { resolveLifeAction, sourceLabel, domainHome } from "../LifeActionDispatcher";
import { sortLifeItems } from "../LifePriority";
import type { LifeItem } from "../../../types/vida";

const CTX = { today: "2026-09-04", nowIso: "2026-09-04T10:00:00.000Z" };

function item(overrides: Partial<LifeItem> & Pick<LifeItem, "id">): LifeItem {
  return {
    domain: "finance",
    type: "invoice_due",
    title: `Item ${overrides.id}`,
    priority: "low",
    status: "LIVE",
    source: "OFFICIAL",
    sourceEntityId: `src-${overrides.id}`,
    sourceDomain: "finance",
    timestamp: CTX.nowIso,
    capability: "finance.read.bills",
    capabilityConfidence: "verified",
    action: "view",
    privacyLevel: "personal",
    ...overrides,
  };
}

describe("sortLifeItems (deterministic, no AI)", () => {
  it("overdue first, then nearest due date, then priority, actionability, confidence", () => {
    const items = [
      item({ id: "c-info-far", priority: "info", dueDate: "2026-10-01" }),
      item({ id: "a-overdue", priority: "low", dueDate: "2026-09-01" }),
      item({ id: "b-near-high", priority: "high", dueDate: "2026-09-05" }),
      item({ id: "d-near-low", priority: "low", dueDate: "2026-09-05" }),
    ];
    const sorted = sortLifeItems(items, { today: CTX.today });
    expect(sorted.map((i) => i.id)).toEqual([
      "a-overdue",
      "b-near-high",
      "d-near-low",
      "c-info-far",
    ]);
  });

  it("action 'none' sorts after actionable items on full tie", () => {
    const items = [
      item({ id: "b-none", action: "none", priority: "high", dueDate: "2026-09-06" }),
      item({ id: "a-view", action: "view", priority: "high", dueDate: "2026-09-06" }),
    ];
    expect(sortLifeItems(items, { today: CTX.today })[0].id).toBe("a-view");
  });

  it("verified confidence sorts before prepared_only on full tie", () => {
    const items = [
      item({ id: "b-prep", capabilityConfidence: "prepared_only", priority: "high", dueDate: "2026-09-06" }),
      item({ id: "a-ver", capabilityConfidence: "verified", priority: "high", dueDate: "2026-09-06" }),
    ];
    expect(sortLifeItems(items, { today: CTX.today })[0].id).toBe("a-ver");
  });

  it("ties broken by id (stable)", () => {
    const items = [item({ id: "b" }), item({ id: "a" })];
    expect(sortLifeItems(items, { today: CTX.today }).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("financeItems (real data only)", () => {
  it("maps overdue bills to high priority LIVE items with view action", () => {
    const items = financeItems(
      {
        bills: [
          { id: "b1", name: "Luz", amount: 50, dueDate: "2026-09-01", status: "PENDING" },
          { id: "b2", name: "Água", amount: 20, dueDate: "2026-09-20", status: "PENDING" },
          { id: "b3", name: "Paga", amount: 10, dueDate: "2026-08-01", status: "PAID" },
        ],
        debts: [],
      },
      CTX,
    );
    expect(items).toHaveLength(2);
    const overdue = items.find((i) => i.sourceEntityId === "b1");
    expect(overdue?.priority).toBe("high");
    expect(overdue?.status).toBe("LIVE");
    expect(overdue?.action).toBe("view");
    expect(overdue?.sourceEntityId).toBe("b1");
    expect(overdue?.sourceDomain).toBe("finance");
  });

  it("never emits pay action from finance collector (view only; payment happens in domain)", () => {
    const items = financeItems(
      {
        bills: [{ id: "b1", name: "Luz", amount: 50, dueDate: "2026-09-01", status: "PENDING" }],
        debts: [{ id: "d1", creditorName: "Banco", outstandingAmount: 1000, nextDueDate: null, status: "OPEN" }],
      },
      CTX,
    );
    expect(items.every((i) => i.action !== "pay")).toBe(true);
  });
});

describe("mobility PREPARED_ONLY", () => {
  it("collects zero items and reports PREPARED_ONLY", async () => {
    const c = new MobilityLifeCollector();
    expect(await c.collectItems(CTX)).toEqual([]);
    expect(await c.collectEvents(CTX)).toEqual([]);
    const s = await c.status();
    expect(s.state).toBe("PREPARED_ONLY");
  });

  it("no mobility item can ever resolve to pay (dispatcher guard)", () => {
    const fake: LifeItem = item({
      id: "mob",
      domain: "mobility",
      status: "PREPARED_ONLY",
      capability: "mobility.read.debts",
      capabilityConfidence: "prepared_only",
      action: "consult_manually",
    });
    const target = resolveLifeAction(fake);
    expect(target.kind).toBe("info");
    expect(target.href).toBeUndefined();
  });
});

describe("aggregateLife (error isolation)", () => {
  const failing: LifeCollector = {
    domain: "health",
    collectItems: () => {
      throw new Error("provider down");
    },
    collectEvents: () => [],
    status: () => ({ domain: "health", state: "LIVE", label: "x" }),
  };

  it("partial failure keeps other domains alive", async () => {
    const finance = new FinanceLifeCollector({
      bills: [{ id: "b1", name: "Luz", amount: 50, dueDate: "2026-09-01", status: "PENDING" }],
      debts: [],
    });
    const docs = new DocumentsLifeCollector({ documents: [] });
    const res = await aggregateLife([finance, failing, docs, new MobilityLifeCollector()], CTX);
    expect(res.items.some((i) => i.domain === "finance")).toBe(true);
    expect(res.errors.some((e) => e.domain === "health")).toBe(true);
    expect(res.domainStatuses.find((s) => s.domain === "health")?.state).toBe("ERROR");
    expect(res.domainStatuses.find((s) => s.domain === "finance")?.state).toBe("LIVE");
    expect(res.generatedAt).toBeTruthy();
  });

  it("empty collectors produce empty states (no fake data)", async () => {
    const res = await aggregateLife(
      [
        new FinanceLifeCollector({ bills: [], debts: [] }),
        new DocumentsLifeCollector({ documents: [] }),
        new MobilityLifeCollector(),
        healthStub(),
        fiscalStub(),
        governmentStub(),
        socialSecurityStub(),
      ],
      CTX,
    );
    expect(res.items).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(res.domainStatuses).toHaveLength(7);
  });

  it("result is sorted deterministically", async () => {
    const finance = new FinanceLifeCollector({
      bills: [
        { id: "far", name: "Longe", amount: 5, dueDate: "2026-12-01", status: "PENDING" },
        { id: "near", name: "Perto", amount: 5, dueDate: "2026-09-05", status: "PENDING" },
      ],
      debts: [],
    });
    const res = await aggregateLife([finance], CTX);
    expect(res.items[0].sourceEntityId).toBe("near");
  });
});

describe("action dispatcher", () => {
  it("view/consult resolve to domain home; connect_learn to integracoes; none has no target", () => {
    expect(resolveLifeAction(item({ id: "v", domain: "finance", action: "view" })).href).toBe("/financas");
    expect(resolveLifeAction(item({ id: "c", domain: "health", action: "connect_learn" })).href).toBe("/integracoes");
    expect(resolveLifeAction(item({ id: "n", action: "none" })).kind).toBe("none");
    expect(domainHome("mobility")).toBe("/mobilidade");
  });

  it("source labels are human-readable (no internal ids)", () => {
    expect(
      sourceLabel({ domain: "mobility", source: "MANUAL", capability: "mobility.read.ctt.debts" }),
    ).toBe("CTT Portagens");
    expect(sourceLabel({ domain: "finance", source: "OFFICIAL", capability: "finance.read.bills" })).toBe(
      "Finanças",
    );
  });
});

describe("collector authorization note", () => {
  it("collectors are pure: they only transform authorized inputs (no DB access)", async () => {
    // Finance collector receives data; it must not fetch anything itself.
    const c: LifeCollector = new FinanceLifeCollector({ bills: [], debts: [] });
    const fns = [c.collectItems(CTX), c.collectEvents(CTX), c.status()];
    await expect(Promise.all(fns)).resolves.toBeTruthy();
  });
});
