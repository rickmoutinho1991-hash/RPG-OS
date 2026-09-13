


import { describe, expect, it } from "vitest";
import { activeDelegation, hasDelegatedPermission } from "../delegation";

describe("delegações temporárias", () => {
  const delegation = {
    delegateUserId: "u2",
    permissions: ["faturacao.view"],
    startsAt: "2025-01-01T00:00:00Z",
    endsAt: "2025-01-02T00:00:00Z",
  };
  it("só concede dentro do período", () => {
    expect(activeDelegation(delegation, new Date("2025-01-01T12:00:00Z"))).toBe(
      true,
    );
    expect(
      hasDelegatedPermission(
        [delegation],
        "u2",
        "faturacao.view",
        new Date("2025-01-03T00:00:00Z"),
      ),
    ).toBe(false);
  });
  it("respeita revogação", () => {
    expect(
      activeDelegation(
        { ...delegation, revokedAt: "2025-01-01T13:00:00Z" },
        new Date("2025-01-01T12:00:00Z"),
      ),
    ).toBe(false);
  });
});
