import { describe, it, expect } from "vitest";
import {
  GovernmentConnection,
  GovernmentConsentRecord,
  CreateGovernmentConnectionRequest,
  GrantGovernmentConsentRequest,
  GOVERNMENT_PROVIDER_SCOPES,
  GOVERNMENT_PROVIDER_DISPLAY,
  GOVERNMENT_PROVIDER_TYPE_DISPLAY,
  GOVERNMENT_ENVIRONMENT_DISPLAY,
  GOVERNMENT_CONNECTION_STATUS_DISPLAY,
  validateConnectionRequest,
  validateConsentRequest,
  connectionHasScope,
  consentGrantsScopes,
} from "../governmentConnections";
import type { GovernmentProviderId, GovernmentEnvironment, GovernmentProviderType, GovernmentProviderStatus } from "../governmentIntegration";

describe("Government Connections & Consent Model - Phase 10J-C, 10J-D", () => {
  describe("GOVERNMENT_PROVIDER_SCOPES", () => {
    it("defines required and optional scopes for AT", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.AT;
      expect(scopes.required).toContain("invoices.submit");
      expect(scopes.required).toContain("invoices.read");
      expect(scopes.optional).toContain("invoices.cancel");
      expect(scopes.optional).toContain("saft.export");
      expect(scopes.optional).toContain("webhooks");
    });

    it("defines required and optional scopes for EFATURA", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.EFATURA;
      expect(scopes.required).toContain("invoices.submit");
      expect(scopes.required).toContain("invoices.read");
    });

    it("defines required and optional scopes for SEGURANCA_SOCIAL", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.SEGURANCA_SOCIAL;
      expect(scopes.required).toContain("obligations.read");
      expect(scopes.optional).toContain("declarations.submit");
      expect(scopes.optional).toContain("payments.read");
    });

    it("defines required and optional scopes for AUTENTICACAO_GOV", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.AUTENTICACAO_GOV;
      expect(scopes.required).toContain("identity.read");
      expect(scopes.required).toContain("authenticate");
      expect(scopes.optional).toContain("organization.represent");
      expect(scopes.optional).toContain("signing");
    });

    it("defines scopes for CMD", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.CMD;
      expect(scopes.required).toContain("identity.read");
      expect(scopes.required).toContain("authenticate");
      expect(scopes.optional).toHaveLength(0);
    });

    it("defines scopes for GOV_PT", () => {
      const scopes = GOVERNMENT_PROVIDER_SCOPES.GOV_PT;
      expect(scopes.required).toContain("profile.read");
      expect(scopes.optional).toContain("notifications.read");
    });
  });

  describe("GOVERNMENT_PROVIDER_DISPLAY", () => {
    it("has display info for all providers", () => {
      const providers: GovernmentProviderId[] = ["AT", "EFATURA", "SEGURANCA_SOCIAL", "AUTENTICACAO_GOV", "CMD", "GOV_PT"];

      for (const providerId of providers) {
        const display = GOVERNMENT_PROVIDER_DISPLAY[providerId];
        expect(display).toBeDefined();
        expect(display.name).toBeTruthy();
        expect(display.description).toBeTruthy();
        expect(display.icon).toBeTruthy();
        expect(display.color).toBeTruthy();
        expect(display.documentation_url).toBeTruthy();
        expect(typeof display.sandbox_available).toBe("boolean");
        expect(typeof display.official_available).toBe("boolean");
      }
    });
  });

  describe("GOVERNMENT_PROVIDER_TYPE_DISPLAY", () => {
    it("has display info for all provider types", () => {
      const types: GovernmentProviderType[] = ["FAKE", "SANDBOX", "OFFICIAL", "UNAVAILABLE"];

      for (const type of types) {
        const display = GOVERNMENT_PROVIDER_TYPE_DISPLAY[type];
        expect(display).toBeDefined();
        expect(display.label).toBeTruthy();
        expect(display.description).toBeTruthy();
        expect(display.color).toBeTruthy();
      }
    });

    it("FAKE has warning", () => {
      expect(GOVERNMENT_PROVIDER_TYPE_DISPLAY.FAKE.warning).toBe("NÃO USE EM PRODUÇÃO");
    });
  });

  describe("GOVERNMENT_ENVIRONMENT_DISPLAY", () => {
    it("has display info for all environments", () => {
      const envs: GovernmentEnvironment[] = ["development", "sandbox", "production"];

      for (const env of envs) {
        const display = GOVERNMENT_ENVIRONMENT_DISPLAY[env];
        expect(display).toBeDefined();
        expect(display.label).toBeTruthy();
        expect(display.description).toBeTruthy();
        expect(display.color).toBeTruthy();
      }
    });
  });

  describe("GOVERNMENT_CONNECTION_STATUS_DISPLAY", () => {
    it("has display info for all statuses", () => {
      const statuses: GovernmentProviderStatus[] = ["DISCONNECTED", "CONNECTING", "CONNECTED", "ERROR", "EXPIRED", "REVOKED"];

      for (const status of statuses) {
        const display = GOVERNMENT_CONNECTION_STATUS_DISPLAY[status];
        expect(display).toBeDefined();
        expect(display.label).toBeTruthy();
        expect(display.description).toBeTruthy();
        expect(display.color).toBeTruthy();
        expect(display.icon).toBeTruthy();
      }
    });
  });

  describe("validateConnectionRequest", () => {
    it("validates correct request", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "AT",
        environment: "development",
        scopes: ["invoices.submit", "invoices.read"],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing provider_id", () => {
      const request = {
        environment: "development",
        scopes: ["invoices.submit"],
      } as CreateGovernmentConnectionRequest;

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider ID is required");
    });

    it("rejects invalid provider_id", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "INVALID" as GovernmentProviderId,
        environment: "development",
        scopes: ["invoices.submit"],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid provider ID");
    });

    it("rejects invalid environment", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "AT",
        environment: "invalid" as GovernmentEnvironment,
        scopes: ["invoices.submit"],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid environment");
    });

    it("rejects empty scopes", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "AT",
        environment: "development",
        scopes: [],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one scope is required");
    });

    it("rejects non-array scopes", () => {
      const request = {
        provider_id: "AT" as GovernmentProviderId,
        environment: "development" as GovernmentEnvironment,
        scopes: "invoices.submit" as any,
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one scope is required");
    });

    it("rejects invalid scope for provider", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "AT" as GovernmentProviderId,
        environment: "development",
        scopes: ["invalid.scope"],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid scope for AT");
    });

    it("accepts valid optional scopes", () => {
      const request: CreateGovernmentConnectionRequest = {
        provider_id: "AT",
        environment: "development",
        scopes: ["invoices.submit", "invoices.read", "invoices.cancel", "saft.export"],
      };

      const result = validateConnectionRequest(request);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateConsentRequest", () => {
    it("validates correct request", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: ["invoices.submit", "invoices.read"],
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects missing provider_id", () => {
      const request = {
        scopes: ["invoices.submit"],
      } as GrantGovernmentConsentRequest;

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider ID is required");
    });

    it("rejects empty scopes", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: [],
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one scope is required");
    });

    it("rejects invalid expires_at format", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: ["invoices.submit"],
        expires_at: "invalid-date",
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid expires_at date format");
    });

    it("rejects past expires_at", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: ["invoices.submit"],
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Expires_at must be in the future");
    });

    it("accepts valid future expires_at", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: ["invoices.submit"],
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid scope for provider", () => {
      const request: GrantGovernmentConsentRequest = {
        provider_id: "AT",
        scopes: ["invalid.scope"],
      };

      const result = validateConsentRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid scope for AT");
    });
  });

  describe("connectionHasScope", () => {
    it("returns true for existing scope", () => {
      const connection: GovernmentConnection = {
        id: "conn-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        environment: "development",
        scopes: ["invoices.submit", "invoices.read"],
        status: "CONNECTED",
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(connectionHasScope(connection, "invoices.submit")).toBe(true);
      expect(connectionHasScope(connection, "invoices.read")).toBe(true);
    });

    it("returns false for missing scope", () => {
      const connection: GovernmentConnection = {
        id: "conn-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        environment: "development",
        scopes: ["invoices.read"],
        status: "CONNECTED",
        connected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(connectionHasScope(connection, "invoices.submit")).toBe(false);
    });
  });

  describe("consentGrantsScopes", () => {
    it("returns true for valid consent with required scopes", () => {
      const consent: GovernmentConsentRecord = {
        id: "consent-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        scopes: ["invoices.submit", "invoices.read", "invoices.cancel"],
        granted_at: new Date().toISOString(),
        source: "USER",
        audit_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(consentGrantsScopes(consent, ["invoices.submit"])).toBe(true);
      expect(consentGrantsScopes(consent, ["invoices.submit", "invoices.read"])).toBe(true);
    });

    it("returns false for missing scopes", () => {
      const consent: GovernmentConsentRecord = {
        id: "consent-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        scopes: ["invoices.read"],
        granted_at: new Date().toISOString(),
        source: "USER",
        audit_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(consentGrantsScopes(consent, ["invoices.submit"])).toBe(false);
    });

    it("returns false for revoked consent", () => {
      const consent: GovernmentConsentRecord = {
        id: "consent-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        scopes: ["invoices.submit", "invoices.read"],
        granted_at: new Date().toISOString(),
        revoked_at: new Date().toISOString(),
        source: "USER",
        audit_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(consentGrantsScopes(consent, ["invoices.submit"])).toBe(false);
    });

    it("returns false for expired consent", () => {
      const consent: GovernmentConsentRecord = {
        id: "consent-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        scopes: ["invoices.submit", "invoices.read"],
        granted_at: new Date(Date.now() - 86400000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
        source: "USER",
        audit_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(consentGrantsScopes(consent, ["invoices.submit"])).toBe(false);
    });

    it("returns true for valid future expiry", () => {
      const consent: GovernmentConsentRecord = {
        id: "consent-001",
        organization_id: "org-123",
        user_id: "user-123",
        provider_id: "AT",
        scopes: ["invoices.submit", "invoices.read"],
        granted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        source: "USER",
        audit_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(consentGrantsScopes(consent, ["invoices.submit"])).toBe(true);
    });
  });
});