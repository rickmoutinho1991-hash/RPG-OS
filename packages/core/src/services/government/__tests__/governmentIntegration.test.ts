import { describe, it, expect, beforeEach } from "vitest";
import {
  GovernmentProviderId,
  GovernmentProviderType,
  GovernmentEnvironment,
  GovernmentCapability,
  GovernmentProviderStatus,
  GovernmentAuthMethod,
  GovernmentProviderMetadata,
  GovernmentConnectionConfig,
  GovernmentConsent,
  GovernmentDocumentSubmission,
  GovernmentDocumentStatusQuery,
  GovernmentProviderHealth,
  CapabilityCheckResult,
  GovernmentIntegrationProvider,
  GovernmentProviderRegistry,
  GovernmentProviderFactory,
  GovernmentIntegrationErrorCode,
  GovernmentIntegrationError,
  GovernmentResult,
  governmentSuccess,
  governmentError,
} from "../governmentIntegration";
import { FakeATProvider } from "../atProvider";
import { FakeSegurancaSocialProvider } from "../segurancaSocialProvider";
import { FakeAutenticacaoGovProvider } from "../autenticacaoGovProvider";

describe("Government Integration Architecture - Phase 10J", () => {
  describe("GovernmentProviderMetadata", () => {
    it("has correct provider IDs for Portugal", () => {
      const providers: GovernmentProviderId[] = [
        "AT",
        "EFATURA",
        "SEGURANCA_SOCIAL",
        "AUTENTICACAO_GOV",
        "CMD",
        "GOV_PT",
      ];
      expect(providers).toHaveLength(6);
    });

    it("has correct provider types", () => {
      const types: GovernmentProviderType[] = ["FAKE", "SANDBOX", "OFFICIAL", "UNAVAILABLE"];
      expect(types).toHaveLength(4);
    });

    it("has correct environment types", () => {
      const envs: GovernmentEnvironment[] = ["development", "sandbox", "production"];
      expect(envs).toHaveLength(3);
    });
  });

  describe("GovernmentCapability", () => {
    it("defines all required capabilities", () => {
      const capabilities: GovernmentCapability[] = [
        "SUBMIT_INVOICE",
        "QUERY_INVOICE",
        "CANCEL_INVOICE",
        "VALIDATE_INVOICE",
        "SAFT_EXPORT",
        "REAL_TIME_STATUS",
        "AUTHENTICATION",
        "IDENTITY_VERIFICATION",
        "ORGANIZATION_REPRESENTATION",
        "DIGITAL_SIGNING",
        "QUERY_OBLIGATIONS",
        "SUBMIT_DECLARATION",
        "QUERY_PAYMENTS",
        "WEBHOOK_NOTIFICATIONS",
      ];
      expect(capabilities).toHaveLength(14);
    });
  });

  describe("GovernmentIntegrationError", () => {
    it("creates error with all required fields", () => {
      const error = new GovernmentIntegrationError(
        "PROVIDER_UNAVAILABLE",
        "Provider not available",
        "AT",
        "conn-123",
        { detail: "test" }
      );

      expect(error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(error.message).toBe("Provider not available");
      expect(error.providerId).toBe("AT");
      expect(error.connectionId).toBe("conn-123");
      expect(error.details).toEqual({ detail: "test" });
      expect(error.name).toBe("GovernmentIntegrationError");
    });

    it("creates error without optional fields", () => {
      const error = new GovernmentIntegrationError(
        "VALIDATION_FAILED",
        "Validation failed",
        "EFATURA"
      );

      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.providerId).toBe("EFATURA");
      expect(error.connectionId).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe("governmentSuccess / governmentError helpers", () => {
    it("creates success result", () => {
      const result = governmentSuccess({ data: "test" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual({ data: "test" });
    });

    it("creates error result", () => {
      const result = governmentError("SUBMISSION_FAILED", "Failed to submit", "AT", "conn-123");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("SUBMISSION_FAILED");
        expect(result.error.providerId).toBe("AT");
        expect(result.error.connectionId).toBe("conn-123");
      }
    });
  });
});

describe("GovernmentProviderRegistry", () => {
  let registry: GovernmentProviderRegistry;

  beforeEach(() => {
    registry = new (class implements GovernmentProviderRegistry {
      private providers = new Map<GovernmentProviderId, GovernmentIntegrationProvider>();

      register(provider: GovernmentIntegrationProvider): void {
        this.providers.set(provider.metadata.providerId, provider);
      }

      unregister(providerId: GovernmentProviderId): void {
        this.providers.delete(providerId);
      }

      get(providerId: GovernmentProviderId): GovernmentIntegrationProvider | undefined {
        return this.providers.get(providerId);
      }

      getAll(): GovernmentIntegrationProvider[] {
        return Array.from(this.providers.values());
      }

      getByCapability(capability: GovernmentCapability): GovernmentIntegrationProvider[] {
        return this.getAll().filter((p) => p.supports(capability).supported);
      }

      getByCountry(country: string): GovernmentIntegrationProvider[] {
        return this.getAll().filter((p) => p.metadata.country === country);
      }

      getByType(type: GovernmentProviderType): GovernmentIntegrationProvider[] {
        return this.getAll().filter((p) => p.metadata.providerType === type);
      }

      clear(): void {
        this.providers.clear();
      }
    })();
  });

  it("registers and retrieves providers", () => {
    const fakeAT = new FakeATProvider();
    registry.register(fakeAT);

    const retrieved = registry.get("AT");
    expect(retrieved).toBeDefined();
    expect(retrieved?.metadata.providerId).toBe("AT");
  });

  it("returns undefined for unknown provider", () => {
    const retrieved = registry.get("UNKNOWN" as GovernmentProviderId);
    expect(retrieved).toBeUndefined();
  });

  it("unregisters providers", () => {
    const fakeAT = new FakeATProvider();
    registry.register(fakeAT);
    registry.unregister("AT");

    const retrieved = registry.get("AT");
    expect(retrieved).toBeUndefined();
  });

  it("gets all providers", () => {
    const fakeAT = new FakeATProvider();
    const fakeSS = new FakeSegurancaSocialProvider();
    registry.register(fakeAT);
    registry.register(fakeSS);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it("filters by capability", () => {
    const fakeAT = new FakeATProvider();
    const fakeSS = new FakeSegurancaSocialProvider();
    registry.register(fakeAT);
    registry.register(fakeSS);

    const submitProviders = registry.getByCapability("SUBMIT_INVOICE");
    expect(submitProviders).toHaveLength(1);
    expect(submitProviders[0].metadata.providerId).toBe("AT");

    const queryObligations = registry.getByCapability("QUERY_OBLIGATIONS");
    expect(queryObligations).toHaveLength(1);
    expect(queryObligations[0].metadata.providerId).toBe("SEGURANCA_SOCIAL");
  });

  it("filters by country", () => {
    const fakeAT = new FakeATProvider();
    registry.register(fakeAT);

    const ptProviders = registry.getByCountry("PT");
    expect(ptProviders).toHaveLength(1);

    const otherProviders = registry.getByCountry("US");
    expect(otherProviders).toHaveLength(0);
  });
});

describe("Provider Instantiation", () => {
  it("creates FakeATProvider", () => {
    const provider = new FakeATProvider({ organizationNif: "501234560" });
    expect(provider).toBeInstanceOf(FakeATProvider);
    expect(provider.metadata.providerId).toBe("AT");
    expect(provider.metadata.environment).toBe("development");
  });

  it("creates FakeSegurancaSocialProvider", () => {
    const provider = new FakeSegurancaSocialProvider();
    expect(provider).toBeInstanceOf(FakeSegurancaSocialProvider);
    expect(provider.metadata.providerId).toBe("SEGURANCA_SOCIAL");
  });

  it("creates FakeAutenticacaoGovProvider", () => {
    const provider = new FakeAutenticacaoGovProvider();
    expect(provider).toBeInstanceOf(FakeAutenticacaoGovProvider);
    expect(provider.metadata.providerId).toBe("AUTENTICACAO_GOV");
  });
});

describe("registerDefaultProviders", () => {
  it("registers fake AT provider in global registry", async () => {
    // Import the actual registry
    const { governmentProviderRegistry, registerDefaultProviders } = await import("../governmentIntegration");
    
    // Clear and re-register using the public clear method
    governmentProviderRegistry.clear();
    registerDefaultProviders();

    const atProvider = governmentProviderRegistry.get("AT");
    expect(atProvider).toBeDefined();
    expect(atProvider?.metadata.providerId).toBe("AT");
    expect(atProvider?.metadata.environment).toBe("development");
  });
});