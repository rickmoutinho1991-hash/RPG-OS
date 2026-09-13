import { describe, it, expect, beforeEach } from "vitest";
import { FakeSegurancaSocialProvider, SegurancaSocialProvider } from "../segurancaSocialProvider";
import { GovernmentEnvironment, GovernmentCapability, GovernmentConnectionConfig } from "../governmentIntegration";

describe("SegurancaSocialProvider - Phase 10J-E", () => {
  describe("FakeSegurancaSocialProvider", () => {
    let provider: FakeSegurancaSocialProvider;

    beforeEach(() => {
      provider = new FakeSegurancaSocialProvider();
    });

    describe("metadata", () => {
      it("has correct provider metadata", () => {
        expect(provider.metadata.providerId).toBe("SEGURANCA_SOCIAL");
        expect(provider.metadata.country).toBe("PT");
        expect(provider.metadata.environment).toBe("development");
        expect(provider.metadata.capabilities).toContain("QUERY_OBLIGATIONS");
        expect(provider.metadata.capabilities).toContain("SUBMIT_DECLARATION");
        expect(provider.metadata.capabilities).toContain("QUERY_PAYMENTS");
        expect(provider.metadata.capabilities).toContain("WEBHOOK_NOTIFICATIONS");
        expect(provider.metadata.authMethod).toBe("OAUTH2_PKCE");
        expect(provider.metadata.sandboxAvailable).toBe(true);
        expect(provider.metadata.officialAvailable).toBe(true);
      });
    });

    describe("supports", () => {
      it("returns supported for Segurança Social capabilities", () => {
        const result = provider.supports("QUERY_OBLIGATIONS");
        expect(result.providerId).toBe("SEGURANCA_SOCIAL");
        expect(result.capability).toBe("QUERY_OBLIGATIONS");
        expect(result.supported).toBe(true);
      });

      it("returns unsupported for AT capabilities", () => {
        const result = provider.supports("SUBMIT_INVOICE");
        expect(result.supported).toBe(false);
        expect(result.details).toContain("not supported");
      });

      it("returns unsupported for authentication capabilities", () => {
        const result = provider.supports("AUTHENTICATION");
        expect(result.supported).toBe(false);
      });
    });

    describe("getHealth", () => {
      it("reports healthy status", async () => {
        const health = await provider.getHealth();

        expect(health.providerId).toBe("SEGURANCA_SOCIAL");
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
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["obligations.read"],
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
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["obligations.read"],
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
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["obligations.read"],
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
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["obligations.read", "declarations.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);
        const status = await provider.getConnectionStatus("conn-001");

        expect(status).toBeDefined();
        expect(status?.connectionId).toBe("conn-001");
        expect(status?.organizationId).toBe("org-123");
        expect(status?.scopes).toEqual(["obligations.read", "declarations.submit"]);
      });

      it("returns null for non-existent connection", async () => {
        const status = await provider.getConnectionStatus("non-existent");
        expect(status).toBeNull();
      });
    });

    describe("submitDocument", () => {
      it("throws - not supported for Segurança Social", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["declarations.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        await expect(provider.submitDocument("conn-001", {}, "idem-001")).rejects.toThrow(
          "Segurança Social provider does not support invoice submission"
        );
      });
    });

    describe("getDocumentStatus", () => {
      it("throws - not supported for Segurança Social", async () => {
        await expect(provider.getDocumentStatus("conn-001", "doc-001")).rejects.toThrow("Not supported");
      });
    });

    describe("cancelDocument", () => {
      it("returns not supported", async () => {
        const result = await provider.cancelDocument("conn-001", "doc-001", "Test");
        expect(result.success).toBe(false);
        expect(result.error).toBe("Not supported");
      });
    });

    describe("queryDocuments", () => {
      it("throws - not supported for Segurança Social", async () => {
        await expect(provider.queryDocuments("conn-001", {})).rejects.toThrow("Not supported");
      });
    });

    describe("exportDocuments", () => {
      it("throws - not supported for Segurança Social", async () => {
        await expect(
          provider.exportDocuments("conn-001", "SAFT-PT", {
            startDate: "2025-01-01",
            endDate: "2025-01-31",
          })
        ).rejects.toThrow("Not supported");
      });
    });

    describe("synchronize", () => {
      it("performs sync successfully", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "SEGURANCA_SOCIAL",
          environment: "development",
          scopes: ["obligations.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const result = await provider.synchronize("conn-001");

        expect(result.success).toBe(true);
        expect(result.syncedCount).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.lastSyncAt).toBeDefined();
      });
    });
  });

  describe("SegurancaSocialProvider (official)", () => {
    let provider: SegurancaSocialProvider;
    const config = {
      apiEndpoint: "https://api.seg-social.pt",
      organizationNiss: "123456789",
      clientId: "test-client",
      clientSecret: "test-secret",
    };

    beforeEach(() => {
      provider = new SegurancaSocialProvider(config, "OFFICIAL", "production");
    });

    it("has correct metadata for official provider", () => {
      expect(provider.metadata.providerId).toBe("SEGURANCA_SOCIAL");
      expect(provider.metadata.environment).toBe("production");
      expect(provider.metadata.officialAvailable).toBe(true);
      expect(provider.metadata.sandboxAvailable).toBe(true);
    });

    it("validates capabilities correctly", () => {
      const result = provider.supports("QUERY_OBLIGATIONS");
      expect(result.supported).toBe(true);

      const unsupported = provider.supports("SUBMIT_INVOICE");
      expect(unsupported.supported).toBe(false);
    });

    it("connect fails without credentials", async () => {
      const providerWithoutCreds = new SegurancaSocialProvider(
        { apiEndpoint: "https://api.seg-social.pt", organizationNiss: "123456789" },
        "OFFICIAL",
        "production"
      );

      const connectionConfig: GovernmentConnectionConfig = {
        connectionId: "conn-001",
        organizationId: "org-123",
        userId: "user-123",
        providerId: "SEGURANCA_SOCIAL",
        environment: "production",
        scopes: ["obligations.read"],
        status: "DISCONNECTED",
        connectedAt: new Date().toISOString(),
      };

      const result = await providerWithoutCreds.connect(connectionConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain("OAuth2 credentials");
    });

    it("connect fails without organization NISS", async () => {
      const providerWithoutNiss = new SegurancaSocialProvider(
        { apiEndpoint: "https://api.seg-social.pt", clientId: "test-client", clientSecret: "test-secret", organizationNiss: "" },
        "OFFICIAL",
        "production"
      );

      const connectionConfig: GovernmentConnectionConfig = {
        connectionId: "conn-001",
        organizationId: "org-123",
        userId: "user-123",
        providerId: "SEGURANCA_SOCIAL",
        environment: "production",
        scopes: ["obligations.read"],
        status: "DISCONNECTED",
        connectedAt: new Date().toISOString(),
      };

      const result = await providerWithoutNiss.connect(connectionConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain("organization NISS");
    });
  });
});