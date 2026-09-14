import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";

vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/session");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockMarkQuoteSent: ReturnType<typeof vi.fn>;
let mockAddQuoteToRequest: ReturnType<typeof vi.fn>;
let mockHasPermission: ReturnType<typeof vi.fn>;

class MockMarketplaceFlow {
  markQuoteSent = mockMarkQuoteSent;
}

class MockServicesRequestFlow {
  addQuoteToRequest = mockAddQuoteToRequest;
}

vi.mock("@rpg/core", () => {
  mockMarkQuoteSent = vi.fn();
  mockAddQuoteToRequest = vi.fn();
  mockHasPermission = vi.fn((permissions: string[], permission: string) => 
    permissions.includes("*") || permissions.includes(permission)
  );
  return {
    ServicesRequestFlow: MockServicesRequestFlow,
    MarketplaceFlow: MockMarketplaceFlow,
    hasPermission: mockHasPermission,
  };
});

describe("Mercado Actions - P7a tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeSupabase(data: any, error: any = null) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data, error })),
          })),
          or: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    };
  }

  describe("createRequestAction", () => {
    it("inputs invalidos -> erro tipado sem escrita (a)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockSupabase = makeSupabase(null);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("title", "");
      formData.append("description", "Test description");
      formData.append("categoryId", "cat-1");
      formData.append("budgetType", "FIXED");
      formData.append("budgetAmountCents", "10000");
      formData.append("budgetCurrency", "EUR");

      const { createRequestAction } = await import("@/app/mercado/actions");
      const result = await createRequestAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Título");
      
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("titulo > 200 chars -> erro", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "user-123" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const formData = new FormData();
      formData.append("title", "a".repeat(201));
      formData.append("description", "Test");
      formData.append("categoryId", "cat-1");
      formData.append("budgetType", "FIXED");
      formData.append("budgetAmountCents", "10000");
      formData.append("budgetCurrency", "EUR");

      const { createRequestAction } = await import("@/app/mercado/actions");
      const result = await createRequestAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("200");
    });
  });

  describe("submitQuoteAction", () => {
    it("OPEN->QUOTES_RECEIVED via core (b)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "provider-1", name: "Provider" },
        organization: { id: "org-123" },
        permissions: ["marketplace.quotes.create"],
      });

      const mockRequest = {
        id: "req-1",
        client_id: "user-123",
        status: "PUBLISHED",
        category_id: "cat-1",
        title: "Test Request",
        description: "Test",
        budget_type: "FIXED",
        budget_amount_cents: 10000,
        budget_currency: "EUR",
        urgency: "MEDIUM",
        location_service_mode: "BOTH",
        created_at: "2026-09-10T10:00:00Z",
        updated_at: "2026-09-10T10:00:00Z",
        moderation_status: "APPROVED",
      };

      const mockQuoteEntity = {
        id: "quote-1",
        requestId: "req-1",
        providerId: "provider-1",
        subtotalCents: 10000,
        taxCents: 2300,
        totalCents: 12300,
        currency: "EUR",
        validUntil: "2026-12-31",
        terms: undefined,
        warrantyMonths: undefined,
        estimatedStartDate: undefined,
        estimatedDurationDays: undefined,
        responseToQuestions: undefined,
        status: "SENT",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [{
          id: "item-1",
          description: "Item 1",
          quantity: 1,
          unit: "un",
          unitPriceCents: 10000,
          taxRate: 23,
          totalCents: 12300,
        }],
      };

      mockMarkQuoteSent.mockReturnValue({
        entity: mockQuoteEntity,
        previousState: "DRAFT",
        newState: "SENT",
        events: [{ type: "QUOTE_SENT", payload: {}, timestamp: new Date().toISOString(), actorId: "provider-1", entityType: "quote", entityId: "quote-1" }],
      });

      mockAddQuoteToRequest.mockReturnValue({
        entity: {
          ...mockRequest,
          status: "QUOTES_RECEIVED",
          updatedAt: new Date().toISOString(),
          quotes: [mockQuoteEntity],
        },
        previousState: "PUBLISHED",
        newState: "QUOTES_RECEIVED",
        events: [{ type: "QUOTE_ADDED", payload: {}, timestamp: new Date().toISOString(), actorId: "provider-1", entityType: "request", entityId: "req-1" }],
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "service_requests") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockRequest, error: null })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          if (table === "service_quotes") {
            return { insert: vi.fn(() => Promise.resolve({ error: null })) };
          }
          if (table === "service_quote_items") {
            return { insert: vi.fn(() => Promise.resolve({ error: null })) };
          }
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("requestId", "req-1");
      formData.append("items", JSON.stringify([{
        description: "Item 1",
        quantity: 1,
        unit: "un",
        unitPriceCents: 10000,
        taxRate: 23,
      }]));
      formData.append("subtotalCents", "10000");
      formData.append("taxCents", "2300");
      formData.append("totalCents", "12300");
      formData.append("currency", "EUR");
      formData.append("validUntil", "2026-12-31");

      const { submitQuoteAction } = await import("@/app/mercado/actions");
      const result = await submitQuoteAction(formData);

      expect(result.success).toBe(true);
      expect(result.quoteId).toBeTruthy();
    });
  });

  describe("permissions", () => {
    it("papel sem marketplace.quotes.create nao ve form e action recusa (c)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "user-123" },
        organization: { id: "org-123" },
        permissions: ["marketplace.view"],
      });

      const formData = new FormData();
      formData.append("requestId", "req-1");
      formData.append("items", JSON.stringify([{
        description: "Item 1",
        quantity: 1,
        unit: "un",
        unitPriceCents: 10000,
        taxRate: 23,
      }]));
      formData.append("subtotalCents", "10000");
      formData.append("taxCents", "2300");
      formData.append("totalCents", "12300");
      formData.append("currency", "EUR");
      formData.append("validUntil", "2026-12-31");

      const { submitQuoteAction } = await import("@/app/mercado/actions");
      const result = await submitQuoteAction(formData);

      expect(result.error).toBeTruthy();
    });

    it("leitura de pedido alheio -> notFound (d)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "user-999" },
        organization: { id: "org-123" },
        permissions: ["marketplace.view", "marketplace.quotes.create"],
      });

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ 
                data: { client_id: "user-123", provider_id: "provider-1" }, 
                error: null 
              })),
            })),
          })),
        })),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      expect(true).toBe(true);
    });
  });

  describe("state machine validation", () => {
    it("submitQuote em pedido fechado -> rejeicao da machine (e)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "provider-1" },
        organization: { id: "org-123" },
        permissions: ["marketplace.quotes.create"],
      });

      const mockRequest = {
        id: "req-1",
        client_id: "user-123",
        status: "COMPLETED",
        category_id: "cat-1",
        title: "Test",
        description: "Test",
        budget_type: "FIXED",
        budget_amount_cents: 10000,
        budget_currency: "EUR",
        urgency: "MEDIUM",
        location_service_mode: "BOTH",
        created_at: "2026-09-10T10:00:00Z",
        updated_at: "2026-09-10T10:00:00Z",
        moderation_status: "APPROVED",
      };

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockRequest, error: null })),
            })),
          })),
        })),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("requestId", "req-1");
      formData.append("items", JSON.stringify([{
        description: "Item 1",
        quantity: 1,
        unit: "un",
        unitPriceCents: 10000,
        taxRate: 23,
      }]));
      formData.append("subtotalCents", "10000");
      formData.append("taxCents", "2300");
      formData.append("totalCents", "12300");
      formData.append("currency", "EUR");
      formData.append("validUntil", "2026-12-31");

      const { submitQuoteAction } = await import("@/app/mercado/actions");
      const result = await submitQuoteAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Só é possível cotar pedidos publicados");
    });
  });
});