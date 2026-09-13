/**
 * RPG-OS — FiscalLifeCollector tests (FISCAL R1)
 *
 * Dados FICTÍCIOS de teste — nunca dados reais, nunca apresentados na UI.
 * Cobrem: tenant-scope por construção (inputs explícitos, sem queries),
 * PENDING/OVERDUE, inbox UNREAD, invoices com company scope, partial
 * failure e proibição de pay/submit/validate/download.
 */
import { describe, it, expect } from "vitest";
import { aggregateLife } from "../LifeAggregationService";
import { FiscalLifeCollector, type FiscalLifeInput } from "../LifeCollectors";

const CTX = { today: "2026-09-04", nowIso: "2026-09-04T10:00:00.000Z" };

function input(overrides: Partial<FiscalLifeInput> = {}): FiscalLifeInput {
  return { obligations: [], inboxItems: [], invoices: [], ...overrides };
}

describe("FiscalLifeCollector — obligations", () => {
  it("PENDING futura gera tax_deadline LIVE com action view", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [
          { id: "o1", title: "IVA Q3", category: "IVA", dueDate: "2026-09-20", status: "PENDING" },
        ],
      }),
    );
    const items = c.collectItems(CTX);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.type).toBe("tax_deadline");
    expect(item.domain).toBe("fiscal");
    expect(item.sourceDomain).toBe("fiscal");
    expect(item.sourceEntityId).toBe("o1");
    expect(item.status).toBe("LIVE");
    expect(item.capabilityConfidence).toBe("verified");
    expect(item.action).toBe("view");
    expect(item.privacyLevel).toBe("personal");
  });

  it("OVERDUE tem prioridade high; PENDING vencida também", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [
          { id: "o1", title: "IVA Q2", category: "IVA", dueDate: "2026-09-20", status: "OVERDUE" },
          { id: "o2", title: "SAFT", category: "SAFT", dueDate: "2026-08-05", status: "PENDING" },
        ],
      }),
    );
    const items = c.collectItems(CTX);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.priority === "high")).toBe(true);
  });

  it("SUBMITTED e PAID nunca geram itens", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [
          { id: "o1", title: "IVA", category: "IVA", dueDate: "2026-09-20", status: "SUBMITTED" },
          { id: "o2", title: "IRS", category: "IRS", dueDate: "2026-06-30", status: "PAID" },
          { id: "o3", title: "Rascunho", category: "IVA", dueDate: "2026-09-20", status: "DRAFT" },
        ],
      }),
    );
    expect(c.collectItems(CTX)).toEqual([]);
  });

  it("obrigação sem dueDate é excluída", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [
          { id: "o1", title: "Sem prazo", category: "IVA", dueDate: "", status: "PENDING" },
        ],
      }),
    );
    expect(c.collectItems(CTX)).toEqual([]);
  });

  it("obrigação vencida gera evento overdue (padrão Finance)", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [
          { id: "o1", title: "IVA", category: "IVA", dueDate: "2026-08-01", status: "PENDING" },
        ],
      }),
    );
    const events = c.collectEvents(CTX);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("overdue");
    expect(events[0].domain).toBe("fiscal");
    expect(events[0].sourceEntityId).toBe("o1");
  });
});

describe("FiscalLifeCollector — inbox", () => {
  it("UNREAD com due_date gera item; READ e sem due_date não", () => {
    const c = new FiscalLifeCollector(
      input({
        inboxItems: [
          { id: "i1", title: "Guia TSU", status: "UNREAD", dueDate: "2026-09-10", entityType: "DEADLINE" },
          { id: "i2", title: "Lida", status: "READ", dueDate: "2026-09-10" },
          { id: "i3", title: "Sem prazo", status: "UNREAD", dueDate: null },
        ],
      }),
    );
    const items = c.collectItems(CTX);
    expect(items.map((i) => i.sourceEntityId)).toEqual(["i1"]);
  });

  it("entity INVOICE gera document_received; outras geram tax_deadline", () => {
    const c = new FiscalLifeCollector(
      input({
        inboxItems: [
          { id: "i1", title: "Fatura", status: "UNREAD", dueDate: "2026-09-10", entityType: "INVOICE" },
          { id: "i2", title: "Prazo", status: "UNREAD", dueDate: "2026-09-10", entityType: "DEADLINE" },
        ],
      }),
    );
    const byId = Object.fromEntries(c.collectItems(CTX).map((i) => [i.sourceEntityId, i.type]));
    expect(byId).toEqual({ i1: "document_received", i2: "tax_deadline" });
  });
});

describe("FiscalLifeCollector — invoices (company scope)", () => {
  it("ISSUED/PARTIALLY_PAID com saldo geram invoice_due; resto não", () => {
    const c = new FiscalLifeCollector(
      input({
        invoices: [
          { id: "f1", invoiceNumber: "FT 1", balanceDue: 100, dueDate: "2026-09-10", status: "ISSUED" },
          { id: "f2", invoiceNumber: "FT 2", balanceDue: 50, dueDate: "2026-09-10", status: "PARTIALLY_PAID" },
          { id: "f3", invoiceNumber: "FT 3", balanceDue: 100, dueDate: "2026-09-10", status: "DRAFT" },
          { id: "f4", invoiceNumber: "FT 4", balanceDue: 0, dueDate: "2026-09-10", status: "ISSUED" },
          { id: "f5", invoiceNumber: "FT 5", balanceDue: 100, dueDate: "2026-09-10", status: "PAID" },
          { id: "f6", invoiceNumber: "FT 6", balanceDue: 100, dueDate: "2026-09-10", status: "CANCELLED" },
        ],
      }),
    );
    expect(c.collectItems(CTX).map((i) => i.sourceEntityId)).toEqual(["f1", "f2"]);
  });
});

describe("FiscalLifeCollector — proibições e estados", () => {
  it("nenhum item fiscal usa pay/submit/validate/download", () => {
    const c = new FiscalLifeCollector(
      input({
        obligations: [{ id: "o1", title: "IVA", category: "IVA", dueDate: "2026-08-01", status: "OVERDUE" }],
        inboxItems: [{ id: "i1", title: "Guia", status: "UNREAD", dueDate: "2026-08-01" }],
        invoices: [{ id: "f1", invoiceNumber: "FT 1", balanceDue: 10, dueDate: "2026-08-01", status: "ISSUED" }],
      }),
    );
    const actions = c.collectItems(CTX).map((i) => i.action);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a === "view" || a === "consult")).toBe(true);
    for (const forbidden of ["pay", "submit", "validate", "download", "communicate"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("sem dados devolve [] e status LIVE 'sem registos' (empty state, sem fake)", () => {
    const c = new FiscalLifeCollector(input());
    expect(c.collectItems(CTX)).toEqual([]);
    expect(c.collectEvents(CTX)).toEqual([]);
    const s = c.status();
    expect(s.state).toBe("LIVE");
    expect(s.label).toBe("Ligado, sem registos");
  });

  it("falha do collector fiscal não derruba a agregação (partial failure)", async () => {
    const failing = new FiscalLifeCollector(input());
    const broken: typeof failing = {
      ...failing,
      collectItems: () => {
        throw new Error("fiscal down");
      },
    } as unknown as FiscalLifeCollector;
    const res = await aggregateLife([broken], CTX);
    expect(res.items).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].domain).toBe("fiscal");
    expect(res.domainStatuses[0].state).toBe("ERROR");
  });
});
