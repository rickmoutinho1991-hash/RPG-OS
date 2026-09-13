import { describe, expect, it, beforeEach } from "vitest";
import { PolicyEngine } from "../granularRbac";
import type { AuthorizationPolicy, ABACContext } from "../granularRbac";

function baseContext(overrides: Partial<ABACContext> = {}): ABACContext {
  return {
    subject: {
      id: "user-1",
      type: "HUMAN",
      name: "Test User",
      status: "ACTIVE",
      verificationLevel: "FULL",
      metadata: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as unknown as ABACContext["subject"],
    resource: { type: "project", id: "proj-1", organizationId: "org-1" },
    action: "view",
    environment: { timeOfDay: 10, dayOfWeek: 2 },
    attributes: {},
    ...overrides,
  };
}

function addPermit(engine: PolicyEngine, overrides: Partial<AuthorizationPolicy> = {}) {
  engine.addPolicy({
    id: `permit-${Math.random().toString(36).slice(2)}`,
    name: "test permit",
    effect: "PERMIT",
    priority: 1,
    subject: {},
    resource: {},
    action: { equals: "view" },
    ...overrides,
  } as AuthorizationPolicy);
}

function addDeny(engine: PolicyEngine, overrides: Partial<AuthorizationPolicy> = {}) {
  engine.addPolicy({
    id: `deny-${Math.random().toString(36).slice(2)}`,
    name: "test deny",
    effect: "DENY",
    priority: 1,
    subject: {},
    resource: {},
    action: { equals: "view" },
    ...overrides,
  } as AuthorizationPolicy);
}

describe("PolicyEngine", () => {
  it("deny by default when no policies", () => {
    const engine = new PolicyEngine();
    expect(engine.evaluate(baseContext()).decision).toBe("DENY");
  });

  it("allows matching subject + resource + action policy", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      subject: { equals: { type: "HUMAN" } },
      resource: { equals: { type: "project" } },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
  });

  it("rejects non-matching action", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      subject: { equals: { type: "HUMAN" } },
      resource: { equals: { type: "project" } },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext({ action: "delete" })).decision).toBe("DENY");
  });

  it("explicit DENY takes precedence over lower-priority PERMIT", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      priority: 10,
      subject: { equals: { type: "HUMAN" } },
      resource: {},
      action: { equals: "delete" },
    });
    addDeny(engine, {
      priority: 1,
      subject: {},
      resource: {},
      action: { equals: "delete" },
    });
    expect(engine.evaluate(baseContext({ action: "delete" })).decision).toBe("DENY");
  });

  it("PERMIT policy wins when no DENY policy matches", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      priority: 1,
      subject: {},
      resource: {},
      action: { equals: "delete" },
    });
    addDeny(engine, {
      priority: 10,
      subject: {},
      resource: { equals: { organizationId: "org-2" } },
      action: { equals: "delete" },
    });
    expect(engine.evaluate(baseContext({ action: "delete" })).decision).toBe("PERMIT");
  });

  it("resource.id in-array match", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      resource: { in: { id: ["proj-1", "proj-2"] } },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
    expect(engine.evaluate(baseContext({ resource: { type: "project", id: "proj-99" } })).decision).toBe("DENY");
  });

  it("resource.id notIn-array match", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      resource: { notIn: { id: ["proj-archived"] } },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
  });

  it("environment time-of-day gate", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      action: { equals: "view" },
      environment: {
        in: { timeOfDay: [9, 10, 11, 12, 13, 14, 15, 16, 17] },
      },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
    expect(engine.evaluate(baseContext({ environment: { timeOfDay: 2, dayOfWeek: 0 } })).decision).toBe("DENY");
  });

  it("ABAC context attributes with in-array", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      action: { equals: "view" },
      attributes: { in: { "resource.organizationId": ["org-1", "org-2"] } },
    });
    expect(engine.evaluate(baseContext({ attributes: { "resource.organizationId": "org-1" } })).decision).toBe("PERMIT");
    expect(engine.evaluate(baseContext({ attributes: { "resource.organizationId": "org-99" } })).decision).toBe("DENY");
  });

  it("all (AND) matchers: all conditions must hold", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      subject: {
        all: [
          { equals: { type: "HUMAN" } },
          { equals: { status: "ACTIVE" } },
        ],
      },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
    expect(engine.evaluate(baseContext({ subject: { ...baseContext().subject, status: "SUSPENDED" } })).decision).toBe("DENY");
  });

  it("any (OR) matchers: at least one must hold", () => {
    const engine = new PolicyEngine();
    addPermit(engine, {
      subject: {
        any: [
          { equals: { type: "HUMAN" } },
          { equals: { type: "ORGANIZATION" } },
        ],
      },
      action: { equals: "view" },
    });
    expect(engine.evaluate(baseContext()).decision).toBe("PERMIT");
    expect(engine.evaluate(baseContext({ subject: { ...baseContext().subject, type: "AI_AGENT" } })).decision).toBe("DENY");
  });
});
