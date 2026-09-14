import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";

vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/session");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockAcceptQuote: ReturnType<typeof vi.fn>;
let mockRejectQuote: ReturnType<typeof vi.fn>;
let mockConvertToContract: ReturnType<typeof vi.fn>;
let mockCreateOrderFromQuote: ReturnType<typeof vi.fn>;
let mockSubmitMilestone: ReturnType<typeof vi.fn>;
let mockApproveMilestone: ReturnType<typeof vi.fn>;
let mockHasPermission: ReturnType<typeof vi.fn>;

class MockMarketplaceFlow {
  acceptQuote = mockAcceptQuote;
  rejectQuote = mockRejectQuote;
  convertToContract = mockConvertToContract;
  createOrderFromQuote = mockCreateOrderFromQuote;
}

class MockServicesRequestFlow {
  addQuoteToRequest = vi.fn();
}

class MockOrderMilestoneFlow {
  submitMilestone = mockSubmitMilestone;
  approveMilestone = mockApproveMilestone;
}

vi.mock("@rpg/core", () => {
  mockAcceptQuote = vi.fn();
  mockRejectQuote = vi.fn();
  mockConvertToContract = vi.fn();
  mockCreateOrderFromQuote = vi.fn();
  mockSubmitMilestone = vi.fn();
  mockApproveMilestone = vi.fn();
  mockHasPermission = vi.fn((permissions: string[], permission: string) =>
    permissions.includes("*") || permissions.includes(permission)
  );
  return {
    ServicesRequestFlow: MockServicesRequestFlow,
    MarketplaceFlow: MockMarketplaceFlow,
    OrderMilestoneFlow: MockOrderMilestoneFlow,
    hasPermission: mockHasPermission,
  };
});

describe("Mercado Actions - P7b tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeSupabase(data: any, error: any = null) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data, error })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => chain),
    };
    return {
      from: vi.fn(() => chain),
    };
  }

  describe("acceptQuoteAction", () => {
    it("aceita proposta -> cria contrato + rejeita restantes quotes via machine (a)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create", "marketplace.quotes.view"],
      });

      const mockRequest = {
        id: "req-1",
        client_id: "client-1",
        status: "QUOTES_RECEIVED",
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

      const mockQuote = {
        id: "quote-1",
        request_id: "req-1",
        provider_id: "provider-1",
        subtotal_cents: 10000,
        tax_cents: 2300,
        total_cents: 12300,
        currency: "EUR",
        valid_until: "2026-12-31",
        terms: "Terms",
        warranty_months: 12,
        estimated_start_date: "2026-10-01",
        estimated_duration_days: 30,
        response_to_questions: "Answers",
        status: "SENT",
        sent_at: "2026-09-10T10:00:00Z",
        viewed_at: null,
        created_at: "2026-09-10T10:00:00Z",
        updated_at: "2026-09-10T10:00:00Z",
      };

      const acceptedQuoteEntity = {
        id: "quote-1",
        requestId: "req-1",
        providerId: "provider-1",
        items: [],
        subtotalCents: 10000,
        taxCents: 2300,
        totalCents: 12300,
        currency: "EUR",
        validUntil: "2026-12-31",
        terms: "Terms",
        warrantyMonths: 12,
        estimatedStartDate: "2026-10-01",
        estimatedDurationDays: 30,
        responseToQuestions: "Answers",
        status: "ACCEPTED",
        sentAt: "2026-09-10T10:00:00Z",
        viewedAt: undefined,
        createdAt: "2026-09-10T10:00:00Z",
        updatedAt: new Date().toISOString(),
      };

      const rejectedQuoteEntity = {
        ...acceptedQuoteEntity,
        id: "quote-2",
        status: "REJECTED",
        updatedAt: new Date().toISOString(),
      };

      const convertedQuoteEntity = {
        ...acceptedQuoteEntity,
        status: "CONVERTED_TO_CONTRACT",
        updatedAt: new Date().toISOString(),
      };

      mockAcceptQuote.mockReturnValue({
        entity: acceptedQuoteEntity,
        previousState: "SENT",
        newState: "ACCEPTED",
        events: [{ type: "QUOTE_ACCEPTED", payload: {}, timestamp: new Date().toISOString(), actorId: "client-1", entityType: "quote", entityId: "quote-1" }],
      });

      mockRejectQuote.mockReturnValue({
        entity: rejectedQuoteEntity,
        previousState: "SENT",
        newState: "REJECTED",
        events: [{ type: "QUOTE_REJECTED", payload: {}, timestamp: new Date().toISOString(), actorId: "client-1", entityType: "quote", entityId: "quote-2" }],
      });

      mockConvertToContract.mockReturnValue({
        entity: convertedQuoteEntity,
        previousState: "ACCEPTED",
        newState: "CONVERTED_TO_CONTRACT",
        events: [{ type: "CONVERTED_TO_CONTRACT", payload: {}, timestamp: new Date().toISOString(), actorId: "client-1", entityType: "quote", entityId: "quote-1" }],
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
            const chain = {
              select: vi.fn(() => chain),
              eq: vi.fn(() => chain),
              neq: vi.fn(() => chain),
              in: vi.fn(() => Promise.resolve({ data: [{ id: "quote-2" }], error: null })),
              single: vi.fn(() => Promise.resolve({ data: mockQuote, error: null })),
              update: vi.fn(() => chain),
            };
            return {
              select: vi.fn(() => chain),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          if (table === "contracts") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({
                    data: { id: "contract-1", request_id: "req-1", client_id: "client-1", provider_id: "provider-1", adjudicated_quote_id: "quote-1", status: "DRAFT", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === "service_quote_items") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            };
          }
          if (table === "contract_milestones") {
            return {
              insert: vi.fn(() => Promise.resolve({ error: null })),
            };
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
      formData.append("quoteId", "quote-1");

      const { acceptQuoteAction } = await import("@/app/mercado/actions");
      const result = await acceptQuoteAction(formData);

      expect(result.success).toBe(true);
      expect(result.contractId).toBeTruthy();
      expect(mockAcceptQuote).toHaveBeenCalled();
      expect(mockRejectQuote).toHaveBeenCalled();
      expect(mockConvertToContract).toHaveBeenCalled();
    });

    it("não-dono não aceita -> action recusa (b)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "other-user", name: "Other" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockRequest = {
        id: "req-1",
        client_id: "client-1",
        status: "QUOTES_RECEIVED",
      };

      const mockSupabase = makeSupabase(mockRequest);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("requestId", "req-1");
      formData.append("quoteId", "quote-1");

      const { acceptQuoteAction } = await import("@/app/mercado/actions");
      const result = await acceptQuoteAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Apenas o dono do pedido");
    });
  });

  describe("submitMilestoneAction", () => {
    it("provider marca concluído -> sucesso (c)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "provider-1", name: "Provider" },
        organization: { id: "org-123" },
        permissions: ["marketplace.quotes.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockMilestone = {
        id: "milestone-1",
        contract_id: "contract-1",
        title: "Milestone 1",
        status: "PENDING",
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "contracts") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockContract, error: null })),
                })),
              })),
            };
          }
          if (table === "contract_milestones") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: mockMilestone, error: null })),
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          return {
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");

      const { submitMilestoneAction } = await import("@/app/mercado/actions");
      const result = await submitMilestoneAction(formData);

      expect(result.success).toBe(true);
    });

    it("não-provider tenta marcar -> action recusa (c)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockSupabase = makeSupabase(mockContract);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");

      const { submitMilestoneAction } = await import("@/app/mercado/actions");
      const result = await submitMilestoneAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Apenas o prestador");
    });
  });

  describe("approveMilestoneAction", () => {
    it("owner aprova -> sucesso (d)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockMilestone = {
        id: "milestone-1",
        contract_id: "contract-1",
        title: "Milestone 1",
        status: "SUBMITTED",
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "contracts") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockContract, error: null })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          if (table === "contract_milestones") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: mockMilestone, error: null })),
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          return {
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.success).toBe(true);
    });

    it("owner devolve sem nota -> falha (d)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "false");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Nota é obrigatória");
    });

    it("não-owner tenta aprovar -> action recusa (d)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "provider-1", name: "Provider" },
        organization: { id: "org-123" },
        permissions: ["marketplace.quotes.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockSupabase = makeSupabase(mockContract);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Apenas o dono");
    });
  });

  describe("getContractAction", () => {
    it("leitura de contrato alheio -> notFound (e)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "other-user", name: "Other" },
        organization: { id: "org-123" },
        permissions: ["marketplace.view"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        milestones: [],
      };

      const mockSupabase = makeSupabase(mockContract);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const { getContractAction } = await import("@/app/mercado/actions");
      const result = await getContractAction({ contractId: "contract-1" });

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("Acesso negado");
    });

    it("owner lê próprio contrato -> sucesso com milestones ordenados (e2)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.view"],
      });

      const mockContract = {
        id: "contract-1",
        request_id: "req-1",
        provider_id: "provider-1",
        client_id: "client-1",
        contract_milestones: [
          { id: "m2", created_at: "2026-09-11T10:00:00Z", title: "Milestone 2" },
          { id: "m1", created_at: "2026-09-10T10:00:00Z", title: "Milestone 1" },
        ],
      };

      const mockRequest = { title: "Test", description: "Desc", client_id: "client-1", category_id: "cat-1" };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "contracts") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockContract, error: null })),
                })),
              })),
            };
          }
          if (table === "service_requests") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockRequest, error: null })),
                })),
              })),
            };
          }
          return {};
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const { getContractAction } = await import("@/app/mercado/actions");
      const result = await getContractAction({ contractId: "contract-1" });

      expect(result.contract).toBeTruthy();
      expect(result.contract?.milestones[0].id).toBe("m1");
      expect(result.contract?.milestones[1].id).toBe("m2");
    });
  });

  describe("acceptQuoteAction - edge cases", () => {
    it("pedido em estado inválido (COMPLETED) -> erro (a2)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockRequest = {
        id: "req-1",
        client_id: "client-1",
        status: "COMPLETED",
      };

      const mockSupabase = makeSupabase(mockRequest);
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("requestId", "req-1");
      formData.append("quoteId", "quote-1");

      const { acceptQuoteAction } = await import("@/app/mercado/actions");
      const result = await acceptQuoteAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("não está em estado elegível");
    });
  });

  describe("submitMilestoneAction - edge cases", () => {
    it("milestone já SUBMITTED -> erro (c2)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "provider-1", name: "Provider" },
        organization: { id: "org-123" },
        permissions: ["marketplace.quotes.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockMilestone = {
        id: "milestone-1",
        contract_id: "contract-1",
        title: "Milestone 1",
        status: "SUBMITTED",
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "contracts") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockContract, error: null })),
                })),
              })),
            };
          }
          if (table === "contract_milestones") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: mockMilestone, error: null })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");

      const { submitMilestoneAction } = await import("@/app/mercado/actions");
      const result = await submitMilestoneAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("não está em estado elegível");
    });
  });

  describe("approveMilestoneAction - edge cases", () => {
    it("milestone não SUBMITTED -> erro (d2)", async () => {
      const { getSessionContext } = await import("@/lib/session");
      (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "client-1", name: "Client" },
        organization: { id: "org-123" },
        permissions: ["marketplace.requests.create"],
      });

      const mockContract = {
        id: "contract-1",
        provider_id: "provider-1",
        client_id: "client-1",
        status: "ACTIVE",
      };

      const mockMilestone = {
        id: "milestone-1",
        contract_id: "contract-1",
        title: "Milestone 1",
        status: "PENDING",
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "contracts") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockContract, error: null })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }
          if (table === "contract_milestones") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: mockMilestone, error: null })),
                  })),
                })),
              })),
            };
          }
          return {
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.error).toBeTruthy();
      expect(result.error).toContain("não está em estado elegível");
    });
  });
});