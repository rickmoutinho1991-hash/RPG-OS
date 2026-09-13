import { describe, it, expect } from "vitest";
import { isDemoRequest } from "@/lib/demoGate";

describe("demoGate", () => {
  it("demo só ativo com ALLOW_DEMO_ACCESS=true E demo=1 (c, d)", () => {
    expect(isDemoRequest(false, "1")).toBe(false); // env false
    expect(isDemoRequest(true, undefined)).toBe(false); // sem param
    expect(isDemoRequest(true, null)).toBe(false); // null param
    expect(isDemoRequest(true, "0")).toBe(false); // param errado
    expect(isDemoRequest(true, "1")).toBe(true); // ambos true
  });

  it("case-sensitive: apenas '1' string exato ativa (c)", () => {
    expect(isDemoRequest(true, "true")).toBe(false);
    expect(isDemoRequest(true, "yes")).toBe(false);
    expect(isDemoRequest(true, "demo")).toBe(false);
  });
});