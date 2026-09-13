/**
 * RPG-OS — testes do live execution harness AT TEST (D12).
 * Gate tests determinísticos (sem rede, sem credenciais, sem mocks de live):
 * qualquer falha de gate → BLOCKED antes de qualquer network call.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runAtTestHandshake } from "../handshakeHarness";

describe("D12 live execution harness — network gate", () => {
  it("sem sessão/autorização → BLOCKED, zero network, connectivity null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await runAtTestHandshake("00000000-0000-0000-0000-000000000000");
    expect(result.readiness).toBe("BLOCKED");
    expect(result.readinessReasons).toContain("AUTHORIZATION_REQUIRED");
    expect(result.handshake).toBe("NOT_EXECUTED");
    expect(result.connectivity).toBeNull();
    expect(result.environment).toBe("TEST");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("resultado de bloqueio não contém segredos", () => {
    return runAtTestHandshake("00000000-0000-0000-0000-000000000000").then((result) => {
      const raw = JSON.stringify(result).toLowerCase();
      for (const forbidden of ["begin private", "begin certificate", "test-password", "dummy-", "bearer "]) {
        expect(raw).not.toContain(forbidden);
      }
    });
  });
});

describe("D12 harness — incapaz de submeter", () => {
  it("fonte do harness nunca referencia operações de escrita fiscal", () => {
    const src = readFileSync("apps/web/lib/at/handshakeHarness.ts", "utf8");
    for (const forbidden of ["RegisterInvoice", "ChangeInvoice", "DeleteInvoice", "atSubmission", "RegisterPayment", "RegisterWork"]) {
      expect(src).not.toContain(forbidden);
    }
    // Dependência arquitetural permitida: só handshake (connectivity).
    expect(src).toContain("./connectivity");
  });
});
