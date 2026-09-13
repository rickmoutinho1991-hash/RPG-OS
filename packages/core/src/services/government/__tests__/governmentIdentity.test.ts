import { describe, it, expect } from "vitest";
import {
  GovernmentIdentityType,
  GovernmentRepresentationRole,
  GovernmentIdentityStatus,
  GovernmentIdentity,
  GovernmentAddress,
  GovernmentContacts,
  GovernmentRepresentation,
  GovernmentDelegatedPower,
  EffectiveGovernmentPermission,
  GovernmentOrganizationContext,
  FiscalEntityType,
  NIF_PREFIX_TO_ENTITY_TYPE,
  classifyPortugueseTaxNumber,
  getVatRegionFromPostalCode,
  canUserActForOrganization,
  getEffectiveGovernmentPermissions,
  GOVERNMENT_SCOPES,
} from "../governmentIdentity";
import {
  formatPortugueseNif,
  formatPortuguesePostalCode,
  isValidPortuguesePostalCode,
} from "../../../validation";

describe("Government Identity Model - Phase 10J-G", () => {
  describe("Types", () => {
    it("has all identity types", () => {
      const types: GovernmentIdentityType[] = [
        "INDIVIDUAL",
        "COMPANY",
        "SOLE_TRADER",
        "PUBLIC_ENTITY",
        "NON_PROFIT",
        "HERITAGE",
      ];
      expect(types).toHaveLength(6);
    });

    it("has all representation roles", () => {
      const roles: GovernmentRepresentationRole[] = [
        "OWNER",
        "DIRECTOR",
        "ACCOUNTANT",
        "EMPLOYEE",
        "REPRESENTATIVE",
        "DELEGATED",
        "EXTERNAL_PROFESSIONAL",
      ];
      expect(roles).toHaveLength(7);
    });

    it("has all identity statuses", () => {
      const statuses: GovernmentIdentityStatus[] = [
        "UNVERIFIED",
        "VERIFIED",
        "PENDING_VERIFICATION",
        "VERIFICATION_FAILED",
        "REVOKED",
        "EXPIRED",
      ];
      expect(statuses).toHaveLength(6);
    });
  });

  describe("NIF_PREFIX_TO_ENTITY_TYPE", () => {
    it("maps prefixes to correct entity types", () => {
      expect(NIF_PREFIX_TO_ENTITY_TYPE["1"]).toBe("INDIVIDUAL");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["2"]).toBe("INDIVIDUAL");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["3"]).toBe("INDIVIDUAL");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["4"]).toBe("SOLE_TRADER");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["5"]).toBe("COMPANY");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["6"]).toBe("PUBLIC_ENTITY");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["7"]).toBe("HERITAGE");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["8"]).toBe("COMPANY");
      expect(NIF_PREFIX_TO_ENTITY_TYPE["9"]).toBe("NON_PROFIT");
    });
  });

  describe("classifyPortugueseTaxNumber", () => {
    // Valid Portuguese NIFs with correct checksum (Module 11)
    it("validates correct individual NIF (prefix 1)", () => {
      // 123456789 - checksum: (1*9 + 2*8 + 3*7 + 4*6 + 5*5 + 6*4 + 7*3 + 8*2) = 156, 156%11=2, check=9 -> 123456789
      const result = classifyPortugueseTaxNumber("123456789");
      expect(result.valid).toBe(true);
      expect(result.entity_type).toBe("INDIVIDUAL");
    });

    it("validates correct company NIPC (prefix 5)", () => {
      // 501234560 - checksum: (5*9 + 0*8 + 1*7 + 2*6 + 3*5 + 4*4 + 5*3 + 6*2) = 122, 122%11=1, check=0 -> 501234560
      const result = classifyPortugueseTaxNumber("501234560");
      expect(result.valid).toBe(true);
      expect(result.entity_type).toBe("COMPANY");
    });

    it("rejects NIF with wrong length", () => {
      const result = classifyPortugueseTaxNumber("12345");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("9 digits");
    });

    it("rejects NIF with non-digits", () => {
      const result = classifyPortugueseTaxNumber("12345678A");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("9 digits");
    });

    it("rejects NIF starting with 0", () => {
      const result = classifyPortugueseTaxNumber("012345678");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid NIF prefix");
    });

    it("rejects NIF with invalid checksum", () => {
      const result = classifyPortugueseTaxNumber("123456788"); // Wrong checksum (should be 9)
      expect(result.valid).toBe(false);
      expect(result.error).toContain("checksum");
    });

    it("handles formatted NIF with spaces", () => {
      const result = classifyPortugueseTaxNumber("123 456 789");
      expect(result.valid).toBe(true);
      expect(result.entity_type).toBe("INDIVIDUAL");
    });
  });

  describe("formatPortugueseNif", () => {
    it("formats 9 digits as XXX XXX XXX", () => {
      expect(formatPortugueseNif("123456781")).toBe("123 456 781");
      expect(formatPortugueseNif("501234560")).toBe("501 234 560");
    });

    it("handles already formatted NIF", () => {
      expect(formatPortugueseNif("123 456 781")).toBe("123 456 781");
    });

    it("returns original for invalid length", () => {
      expect(formatPortugueseNif("123")).toBe("123");
    });
  });

  describe("formatPortuguesePostalCode", () => {
    it("formats 7 digits as XXXX-XXX", () => {
      expect(formatPortuguesePostalCode("1000001")).toBe("1000-001");
      expect(formatPortuguesePostalCode("4000123")).toBe("4000-123");
    });

    it("handles already formatted postal code", () => {
      expect(formatPortuguesePostalCode("1000-001")).toBe("1000-001");
    });

    it("returns original for invalid length", () => {
      expect(formatPortuguesePostalCode("12345")).toBe("12345");
    });
  });

  describe("isValidPortuguesePostalCode", () => {
    it("accepts valid format", () => {
      expect(isValidPortuguesePostalCode("1000-001")).toBe(true);
      expect(isValidPortuguesePostalCode("4000-123")).toBe(true);
      expect(isValidPortuguesePostalCode("9000-123")).toBe(true);
    });

    it("rejects invalid format", () => {
      expect(isValidPortuguesePostalCode("1000001")).toBe(false);
      expect(isValidPortuguesePostalCode("0000-000")).toBe(false);
      expect(isValidPortuguesePostalCode("abc")).toBe(false);
      expect(isValidPortuguesePostalCode("100-001")).toBe(false);
    });
  });

  describe("getVatRegionFromPostalCode", () => {
    it("returns CONTINENT for mainland districts", () => {
      expect(getVatRegionFromPostalCode("1000-001")).toBe("CONTINENT"); // Lisboa
      expect(getVatRegionFromPostalCode("4000-123")).toBe("CONTINENT"); // Porto
      expect(getVatRegionFromPostalCode("3000-123")).toBe("CONTINENT"); // Coimbra
    });

    it("returns AZORES for Azores districts (95-99)", () => {
      expect(getVatRegionFromPostalCode("9500-123")).toBe("AZORES");
      expect(getVatRegionFromPostalCode("9900-123")).toBe("AZORES");
    });

    it("returns MADEIRA for Madeira districts (90-94)", () => {
      expect(getVatRegionFromPostalCode("9000-123")).toBe("MADEIRA");
      expect(getVatRegionFromPostalCode("9400-123")).toBe("MADEIRA");
    });

    it("defaults to CONTINENT for invalid codes", () => {
      expect(getVatRegionFromPostalCode("invalid")).toBe("CONTINENT");
      expect(getVatRegionFromPostalCode("123")).toBe("CONTINENT");
    });
  });

  describe("canUserActForOrganization", () => {
    const createRepresentation = (overrides: Partial<GovernmentRepresentation> = {}): GovernmentRepresentation => ({
      id: "rep-001",
      user_id: "user-123",
      organization_id: "org-123",
      identity_id: "id-001",
      role: "OWNER",
      delegated_powers: ["SUBMIT_INVOICES", "QUERY_INVOICES", "EXPORT_SAFT"],
      authorization_source: "STATUTORY",
      valid_from: "2024-01-01T00:00:00.000Z",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    });

    it("allows user with required powers", () => {
      const rep = createRepresentation();
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(true);
      expect(result.representation).toBeDefined();
    });

    it("allows user with multiple required powers", () => {
      const rep = createRepresentation();
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES", "QUERY_INVOICES"], [rep]);
      expect(result.allowed).toBe(true);
    });

    it("denies user missing required powers", () => {
      const rep = createRepresentation({ delegated_powers: ["QUERY_INVOICES"] });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(false);
      expect(result.missingPowers).toContain("SUBMIT_INVOICES");
    });

    it("denies user for different organization", () => {
      const rep = createRepresentation({ organization_id: "org-456" });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(false);
    });

    it("denies user for different user", () => {
      const rep = createRepresentation({ user_id: "user-456" });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(false);
    });

    it("denies inactive representation", () => {
      const rep = createRepresentation({ status: "SUSPENDED" });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(false);
    });

    it("denies expired representation", () => {
      const rep = createRepresentation({ valid_until: "2020-01-01T00:00:00.000Z" });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(false);
    });

    it("allows valid future expiration", () => {
      const rep = createRepresentation({ valid_until: "2030-01-01T00:00:00.000Z" });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES"], [rep]);
      expect(result.allowed).toBe(true);
    });

    it("returns missing powers when partially authorized", () => {
      const rep = createRepresentation({ delegated_powers: ["SUBMIT_INVOICES"] });
      const result = canUserActForOrganization("user-123", "org-123", ["SUBMIT_INVOICES", "CANCEL_INVOICES", "EXPORT_SAFT"], [rep]);
      expect(result.allowed).toBe(false);
      expect(result.missingPowers).toContain("CANCEL_INVOICES");
      expect(result.missingPowers).toContain("EXPORT_SAFT");
    });
  });

  describe("getEffectiveGovernmentPermissions", () => {
    const createIdentity = (overrides: Partial<GovernmentIdentity> = {}): GovernmentIdentity => ({
      id: "id-001",
      user_id: "user-123",
      identity_type: "INDIVIDUAL",
      tax_number: "123456781",
      legal_name: "João Silva",
      fiscal_address: {
        street: "Rua Teste",
        number: "10",
        postal_code: "1000-001",
        locality: "Lisboa",
        district: "Lisboa",
        municipality: "Lisboa",
        country: "PT",
      },
      contacts: { email: "joao@test.com", phone: "912345678" },
      verification_status: "VERIFIED",
      verification_method: "AUTENTICACAO_GOV",
      verified_at: "2024-01-01T00:00:00.000Z",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    });

    const createRepresentation = (overrides: Partial<GovernmentRepresentation> = {}): GovernmentRepresentation => ({
      id: "rep-001",
      user_id: "user-123",
      organization_id: "org-123",
      identity_id: "id-001",
      role: "OWNER",
      delegated_powers: ["SUBMIT_INVOICES", "QUERY_INVOICES", "EXPORT_SAFT"],
      authorization_source: "STATUTORY",
      valid_from: "2024-01-01T00:00:00.000Z",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    });

    it("returns effective permissions for active representation", () => {
      const identities = [createIdentity()];
      const representations = [createRepresentation()];
      const connections = {
        AT: { connected: true, scopes: ["invoices.submit", "invoices.read"], environment: "production" },
        EFATURA: { connected: false, scopes: [], environment: "development" },
        SEGURANCA_SOCIAL: { connected: false, scopes: [], environment: "development" },
        AUTENTICACAO_GOV: { connected: true, scopes: ["identity.read"], environment: "production" },
        CMD: { connected: false, scopes: [], environment: "development" },
        GOV_PT: { connected: false, scopes: [], environment: "development" },
      };
      const consents = {
        AT: { granted: true, scopes: ["invoices.submit", "invoices.read"], expires_at: undefined },
        EFATURA: { granted: false, scopes: [], expires_at: undefined },
        SEGURANCA_SOCIAL: { granted: false, scopes: [], expires_at: undefined },
        AUTENTICACAO_GOV: { granted: true, scopes: ["identity.read"], expires_at: undefined },
        CMD: { granted: false, scopes: [], expires_at: undefined },
        GOV_PT: { granted: false, scopes: [], expires_at: undefined },
      };

      const permissions = getEffectiveGovernmentPermissions(
        "user-123",
        "org-123",
        identities,
        representations,
        connections,
        consents
      );

      expect(permissions.user_id).toBe("user-123");
      expect(permissions.organization_id).toBe("org-123");
      expect(permissions.identity_id).toBe("id-001");
      expect(permissions.representation_id).toBe("rep-001");
      expect(permissions.powers).toContain("SUBMIT_INVOICES");
      expect(permissions.powers).toContain("QUERY_INVOICES");
      expect(permissions.provider_access.AT.connected).toBe(true);
      expect(permissions.provider_access.AUTENTICACAO_GOV.connected).toBe(true);
    });

    it("returns empty permissions for no active representation", () => {
      const identities = [createIdentity()];
      const representations = [createRepresentation({ status: "REVOKED" })];
      const connections = {
        AT: { connected: false, scopes: [], environment: "development" },
        EFATURA: { connected: false, scopes: [], environment: "development" },
        SEGURANCA_SOCIAL: { connected: false, scopes: [], environment: "development" },
        AUTENTICACAO_GOV: { connected: false, scopes: [], environment: "development" },
        CMD: { connected: false, scopes: [], environment: "development" },
        GOV_PT: { connected: false, scopes: [], environment: "development" },
      };
      const consents = {
        AT: { granted: false, scopes: [], expires_at: undefined },
        EFATURA: { granted: false, scopes: [], expires_at: undefined },
        SEGURANCA_SOCIAL: { granted: false, scopes: [], expires_at: undefined },
        AUTENTICACAO_GOV: { granted: false, scopes: [], expires_at: undefined },
        CMD: { granted: false, scopes: [], expires_at: undefined },
        GOV_PT: { granted: false, scopes: [], expires_at: undefined },
      };

      const permissions = getEffectiveGovernmentPermissions(
        "user-123",
        "org-123",
        identities,
        representations,
        connections,
        consents
      );

      expect(permissions.powers).toHaveLength(0);
      expect(permissions.identity_id).toBe("");
      expect(permissions.representation_id).toBe("");
    });

    it("returns correct provider access from connections", () => {
      const identities = [createIdentity()];
      const representations = [createRepresentation()];
      const connections = {
        AT: { connected: true, scopes: ["invoices.submit", "invoices.read"], environment: "production" },
        EFATURA: { connected: true, scopes: ["invoices.submit"], environment: "sandbox" },
        SEGURANCA_SOCIAL: { connected: false, scopes: [], environment: "development" },
        AUTENTICACAO_GOV: { connected: false, scopes: [], environment: "development" },
        CMD: { connected: false, scopes: [], environment: "development" },
        GOV_PT: { connected: false, scopes: [], environment: "development" },
      };
      const consents = {
        AT: { granted: true, scopes: ["invoices.submit"], expires_at: undefined },
        EFATURA: { granted: true, scopes: ["invoices.submit"], expires_at: undefined },
        SEGURANCA_SOCIAL: { granted: false, scopes: [], expires_at: undefined },
        AUTENTICACAO_GOV: { granted: false, scopes: [], expires_at: undefined },
        CMD: { granted: false, scopes: [], expires_at: undefined },
        GOV_PT: { granted: false, scopes: [], expires_at: undefined },
      };

      const permissions = getEffectiveGovernmentPermissions(
        "user-123",
        "org-123",
        identities,
        representations,
        connections,
        consents
      );

      expect(permissions.provider_access.AT.connected).toBe(true);
      expect(permissions.provider_access.AT.scopes).toEqual(["invoices.submit", "invoices.read"]);
      expect(permissions.provider_access.AT.environment).toBe("production");
      expect(permissions.provider_access.EFATURA.connected).toBe(true);
      expect(permissions.provider_access.EFATURA.environment).toBe("sandbox");
    });
  });

  describe("GOVERNMENT_SCOPES", () => {
    it("has all AT scopes", () => {
      expect(GOVERNMENT_SCOPES.AT.INVOICES_SUBMIT).toBe("invoices.submit");
      expect(GOVERNMENT_SCOPES.AT.INVOICES_READ).toBe("invoices.read");
      expect(GOVERNMENT_SCOPES.AT.INVOICES_CANCEL).toBe("invoices.cancel");
      expect(GOVERNMENT_SCOPES.AT.SAFT_EXPORT).toBe("saft.export");
      expect(GOVERNMENT_SCOPES.AT.WEBHOOKS).toBe("webhooks");
    });

    it("has all EFATURA scopes", () => {
      expect(GOVERNMENT_SCOPES.EFATURA.INVOICES_SUBMIT).toBe("invoices.submit");
      expect(GOVERNMENT_SCOPES.EFATURA.WEBHOOKS).toBe("webhooks");
    });

    it("has all SEGURANCA_SOCIAL scopes", () => {
      expect(GOVERNMENT_SCOPES.SEGURANCA_SOCIAL.OBLIGATIONS_READ).toBe("obligations.read");
      expect(GOVERNMENT_SCOPES.SEGURANCA_SOCIAL.DECLARATIONS_SUBMIT).toBe("declarations.submit");
    });

    it("has all AUTENTICACAO_GOV scopes", () => {
      expect(GOVERNMENT_SCOPES.AUTENTICACAO_GOV.IDENTITY_READ).toBe("identity.read");
      expect(GOVERNMENT_SCOPES.AUTENTICACAO_GOV.AUTHENTICATE).toBe("authenticate");
      expect(GOVERNMENT_SCOPES.AUTENTICACAO_GOV.ORGANIZATION_REPRESENT).toBe("organization.represent");
      expect(GOVERNMENT_SCOPES.AUTENTICACAO_GOV.SIGNING).toBe("signing");
    });

    it("has all CMD scopes", () => {
      expect(GOVERNMENT_SCOPES.CMD.IDENTITY_READ).toBe("identity.read");
      expect(GOVERNMENT_SCOPES.CMD.AUTHENTICATE).toBe("authenticate");
    });

    it("has all GOV_PT scopes", () => {
      expect(GOVERNMENT_SCOPES.GOV_PT.PROFILE_READ).toBe("profile.read");
      expect(GOVERNMENT_SCOPES.GOV_PT.NOTIFICATIONS_READ).toBe("notifications.read");
    });
  });
});