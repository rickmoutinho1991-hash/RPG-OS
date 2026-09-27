import { describe, it, expect } from "vitest";
import { PortugueseAuthAdapter } from "@rpg/core";

describe("PortugueseAuthAdapter - stub fail-closed em produção", () => {
  it("dev sem credenciais usa o mock de login (transação local)", async () => {
    const adapter = new PortugueseAuthAdapter({ isProduction: false });
    const res = await adapter.initiateChaveMovelLogin({
      callbackUrl: "https://example.com/callback",
    });
    expect(res.redirectUrl).toContain("mock_cmd=true");
  });

  it("produção sem provedor AMA recusa iniciar login", async () => {
    const adapter = new PortugueseAuthAdapter({ isProduction: true });
    await expect(
      adapter.initiateChaveMovelLogin({ callbackUrl: "https://example.com/callback" }),
    ).rejects.toThrow(/AMA não configurado/);
  });

  it("produção nunca autentica via callback sem validação real", async () => {
    const adapter = new PortugueseAuthAdapter({ isProduction: true });
    const res = await adapter.verifyChaveMovelCallback("token", "tx");
    expect(res.authenticated).toBe(false);
  });

  it("produção recusa Cartão de Cidadão mesmo com certificado e assinatura", async () => {
    const adapter = new PortugueseAuthAdapter({ isProduction: true });
    const res = await adapter.verifyCartaoCidadao({
      certificate: "cert",
      signature: "sig",
    } as never);
    expect(res.authenticated).toBe(false);
  });

  it("dev mantém o stub de verificação CMD funcional", async () => {
    const adapter = new PortugueseAuthAdapter({ isProduction: false });
    const res = await adapter.verifyChaveMovelCallback("token", "tx");
    expect(res.authenticated).toBe(true);
  });
});