import { describe, it, expect, vi } from "vitest";
import { loadVisibleQuotes } from "./requestQuotes";

const REQ = "33333333-3333-4333-8333-333333333333";
const VIEWER = "11111111-1111-4111-8111-111111111111";

function makeFrom() {
  const eqCalls: Array<{ col: string; val: unknown }> = [];
  const chain: any = {
    eq: (col: string, val: unknown) => {
      eqCalls.push({ col, val });
      return chain;
    },
    order: () => chain,
  };
  return {
    from: vi.fn((_table: string, _columns?: string) => chain),
    chain,
    eqCallsFor: (col: string) => eqCalls.filter((c) => c.col === col).map((c) => c.val),
  };
}

describe("mercado/pedidos - visibilidade de cotações", () => {
  it("provider não-owner vê apenas as próprias cotações (filter provider_id)", async () => {
    const m = makeFrom();
    await loadVisibleQuotes(m.from, REQ, VIEWER, false);
    expect(m.from).toHaveBeenCalledWith("service_quotes", expect.any(String));
    expect(m.eqCallsFor("request_id")).toContain(REQ);
    expect(m.eqCallsFor("provider_id")).toContain(VIEWER);
  });

  it("owner vê todas as cotações (sem filter provider_id)", async () => {
    const m = makeFrom();
    await loadVisibleQuotes(m.from, REQ, VIEWER, true);
    expect(m.eqCallsFor("request_id")).toContain(REQ);
    expect(m.eqCallsFor("provider_id")).toHaveLength(0);
  });
});