import { describe, it, expect, beforeEach } from "vitest";
import { FakeAutenticacaoGovProvider, AutenticacaoGovProvider } from "../autenticacaoGovProvider";
import { GovernmentEnvironment, GovernmentCapability, GovernmentConnectionConfig } from "../governmentIntegration";

describe("AutenticacaoGovProvider - Phase 10J-F", () => {
  describe("FakeAutenticacaoGovProvider", () => {
    let provider: FakeAutenticacaoGovProvider;

    beforeEach(() => {
      provider = new FakeAutenticacaoGovProvider();
    });

    describe("metadata", () => {
      it("has correct provider metadata", () => {
        expect(provider.metadata.providerId).toBe("AUTENTICACAO_GOV");
        expect(provider.metadata.country).toBe("PT");
        expect(provider.metadata.environment).toBe("development");
        expect(provider.metadata.capabilities).toContain("AUTHENTICATION");
        expect(provider.metadata.capabilities).toContain("IDENTITY_VERIFICATION");
        expect(provider.metadata.capabilities).toContain("ORGANIZATION_REPRESENTATION");
        expect(provider.metadata.capabilities).toContain("DIGITAL_SIGNING");
        expect(provider.metadata.authMethod).toBe("OAUTH2_PKCE");
        expect(provider.metadata.sandboxAvailable).toBe(true);
        expect(provider.metadata.officialAvailable).toBe(true);
      });
    });

    describe("supports", () => {
      it("returns supported for Autenticação.gov capabilities", () => {
        const result = provider.supports("AUTHENTICATION");
        expect(result.providerId).toBe("AUTENTICACAO_GOV");
        expect(result.capability).toBe("AUTHENTICATION");
        expect(result.supported).toBe(true);
      });

      it("returns unsupported for AT capabilities", () => {
        const result = provider.supports("SUBMIT_INVOICE");
        expect(result.supported).toBe(false);
        expect(result.details).toContain("not supported");
      });

      it("returns unsupported for Segurança Social capabilities", () => {
        const result = provider.supports("QUERY_OBLIGATIONS");
        expect(result.supported).toBe(false);
      });
    });

    describe("getHealth", () => {
      it("reports healthy status", async () => {
        const health = await provider.getHealth();

        expect(health.providerId).toBe("AUTENTICACAO_GOV");
        expect(health.healthy).toBe(true);
        expect(health.latencyMs).toBeGreaterThanOrEqual(0);
        expect(health.message).toBeDefined();
        expect(health.checkedAt).toBeDefined();
      });
    });

    describe("connect", () => {
      it("connects successfully with valid organizationId", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AUTENTICACAO_GOV",
          environment: "development",
          scopes: ["identity.read", "authenticate"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        const result = await provider.connect(config);

        expect(result.success).toBe(true);
        expect(result.connectionId).toBe("conn-001");
        expect(result.expiresAt).toBeDefined();
      });

      it("fails without organizationId", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "",
          userId: "user-123",
          providerId: "AUTENTICACAO_GOV",
          environment: "development",
          scopes: ["identity.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        const result = await provider.connect(config);

        expect(result.success).toBe(false);
        expect(result.error).toContain("organizationId");
      });
    });

    describe("disconnect", () => {
      it("disconnects existing connection", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AUTENTICACAO_GOV",
          environment: "development",
          scopes: ["identity.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);
        const result = await provider.disconnect("conn-001");

        expect(result.success).toBe(true);
      });

      it("fails for non-existent connection", async () => {
        const result = await provider.disconnect("non-existent");
        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      });
    });

    describe("getConnectionStatus", () => {
      it("returns connection status without sensitive data", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AUTENTICACAO_GOV",
          environment: "development",
          scopes: ["identity.read", "authenticate", "organization.represent"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);
        const status = await provider.getConnectionStatus("conn-001");

        expect(status).toBeDefined();
        expect(status?.connectionId).toBe("conn-001");
        expect(status?.organizationId).toBe("org-123");
        expect(status?.scopes).toEqual(["identity.read", "authenticate", "organization.represent"]);
      });

      it("returns null for non-existent connection", async () => {
        const status = await provider.getConnectionStatus("non-existent");
        expect(status).toBeNull();
      });
    });

    // Note: FakeAutenticacaoGovProvider does not implement authentication-specific methods
    // (initiateChaveMovelLogin, verifyChaveMovelCallback, verifyCartaoCidadao)
    // Those are only available on the real AutenticacaoGovProvider class
  });

  describe("AutenticacaoGovProvider (official)", () => {
    let provider: AutenticacaoGovProvider;
    const config = {
      apiEndpoint: "https://autenticacao.gov.pt",
      clientId: "test-client",
      clientSecret: "test-secret",
      redirectUri: "https://app.example.com/callback",
    };

    beforeEach(() => {
      provider = new AutenticacaoGovProvider(config, "OFFICIAL", "production");
    });

    it("has correct metadata for official provider", () => {
      expect(provider.metadata.providerId).toBe("AUTENTICACAO_GOV");
      expect(provider.metadata.environment).toBe("production");
      expect(provider.metadata.officialAvailable).toBe(true);
      expect(provider.metadata.sandboxAvailable).toBe(true);
    });

    it("connect fails without credentials", async () => {
      const providerWithoutCreds = new AutenticacaoGovProvider(
        { apiEndpoint: "https://autenticacao.gov.pt" },
        "OFFICIAL",
        "production"
      );

      const connectionConfig: GovernmentConnectionConfig = {
        connectionId: "conn-001",
        organizationId: "org-123",
        userId: "user-123",
        providerId: "AUTENTICACAO_GOV",
        environment: "production",
        scopes: ["authenticate"],
        status: "DISCONNECTED",
        connectedAt: new Date().toISOString(),
      };

      const result = await providerWithoutCreds.connect(connectionConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain("OAuth2 credentials");
    });

    it("connect fails without redirectUri", async () => {
      const providerWithoutRedirect = new AutenticacaoGovProvider(
        { apiEndpoint: "https://autenticacao.gov.pt", clientId: "test-client", clientSecret: "test-secret" },
        "OFFICIAL",
        "production"
      );

      const connectionConfig: GovernmentConnectionConfig = {
        connectionId: "conn-001",
        organizationId: "org-123",
        userId: "user-123",
        providerId: "AUTENTICACAO_GOV",
        environment: "production",
        scopes: ["authenticate"],
        status: "DISCONNECTED",
        connectedAt: new Date().toISOString(),
      };

      const result = await providerWithoutRedirect.connect(connectionConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain("redirectUri");
    });

    it("supports authentication-specific methods on official provider", () => {
      expect(typeof provider.initiateChaveMovelLogin).toBe("function");
      expect(typeof provider.verifyChaveMovelCallback).toBe("function");
      expect(typeof provider.verifyCartaoCidadao).toBe("function");
    });
  });
});