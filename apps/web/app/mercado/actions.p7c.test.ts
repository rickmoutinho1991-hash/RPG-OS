import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";

const { mockUploadEvidence, mockRecordPayment, mockEmitWarranty } = vi.hoisted(() => ({
  mockUploadEvidence: vi.fn(),
  mockRecordPayment: vi.fn(),
  mockEmitWarranty: vi.fn(),
}));

vi.mock("@/lib/marketplace/evidence", () => ({
  uploadMilestoneEvidence: mockUploadEvidence,
}));

vi.mock("@/lib/marketplace/payments", () => ({
  recordMilestonePayment: mockRecordPayment,
  emitMilestoneWarranty: mockEmitWarranty,
}));

vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/session");
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Mercado Actions - P7c tests (evidência + pagamento + garantia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMilestoneClient(opts: {
    contract: Record<string, unknown>;
    milestone: Record<string, unknown>;
    allApproved?: boolean;
    quote?: Record<string, unknown> | null;
  }) {
    return {
      from: vi.fn((table: string) => {
        if (table === "contracts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: opts.contract, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        if (table === "contract_milestones") {
          return {
            select: vi.fn((cols: string) => {
              if (cols === "status") {
                return {
                  eq: vi.fn(() =>
                    Promise.resolve({
                      data: opts.allApproved ? [{ status: "APPROVED" }] : [{ status: "PENDING" }],
                      error: null,
                    }),
                  ),
                };
              }
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: opts.milestone, error: null })),
                  })),
                })),
              };
            }),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        if (table === "service_quotes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: opts.quote ?? null, error: null })),
              })),
            })),
          };
        }
        return {};
      }),
    };
  }

  function session(role: "provider" | "client") {
    (getSessionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: role === "provider" ? "provider-1" : "client-1", name: role === "provider" ? "Provider" : "Client" },
      organization: { id: "org-123" },
      permissions: [],
    });
  }

  describe("submitMilestoneAction", () => {
    it("envia evidência obrigatória como ficheiro -> sucesso com arquivo no bucket (a)", async () => {
      session("provider");
      mockUploadEvidence.mockResolvedValue({
        ok: true,
        evidence: { id: "ev-1", title: "Evidência de entrega — Milestone 1" },
      });

      const supabase = makeMilestoneClient({
        contract: {
          id: "contract-1",
          provider_id: "provider-1",
          client_id: "client-1",
          status: "ACTIVE",
        },
        milestone: { id: "milestone-1", contract_id: "contract-1", title: "Milestone 1", status: "PENDING", require_evidence: true },
      });
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("file", new File([new Uint8Array([1, 2, 3])], "deliverable.pdf", { type: "application/pdf" }));

      const { submitMilestoneAction } = await import("@/app/mercado/actions");
      const result = await submitMilestoneAction(formData);

      expect(result.success).toBe(true);
      expect(mockUploadEvidence).toHaveBeenCalledTimes(1);
      const call = mockUploadEvidence.mock.calls[0][0];
      expect(call.milestoneId).toBe("milestone-1");
      expect(call.partyIds).toEqual(["provider-1", "client-1"]);
      expect(call.file.type).toBe("application/pdf");
    });
  });

  describe("approveMilestoneAction", () => {
    it("aprovado -> cria movimentos financeiros em ambas as partes (receita+despesa) (b)", async () => {
      session("client");
      mockRecordPayment.mockResolvedValue({ duplicated: false, incomeId: "income-1", expenseId: "expense-1" });
      mockEmitWarranty.mockResolvedValue({ emitted: false, reason: "semgarantia" });

      const supabase = makeMilestoneClient({
        contract: {
          id: "contract-1",
          provider_id: "provider-1",
          client_id: "client-1",
          adjudicated_quote_id: "quote-1",
          status: "ACTIVE",
        },
        milestone: { id: "milestone-1", contract_id: "contract-1", title: "Milestone 1", amount_cents: 5000, status: "SUBMITTED", require_evidence: true },
        allApproved: true,
        quote: null,
      });
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.success).toBe(true);
      expect(mockRecordPayment).toHaveBeenCalledTimes(1);
      const [contractArg, milestoneArg, actorArg] = mockRecordPayment.mock.calls[0];
      expect(contractArg.client_id).toBe("client-1");
      expect(contractArg.provider_id).toBe("provider-1");
      expect(milestoneArg.amount_cents).toBe(5000);
      expect(actorArg).toBe("client-1");
    });

    it("todos os milestones aprovados -> contrato COMPLETED + garantia emitida (c)", async () => {
      session("client");
      mockRecordPayment.mockResolvedValue({ duplicated: false, incomeId: "income-1", expenseId: "expense-1" });
      mockEmitWarranty.mockResolvedValue({ emitted: true });

      const supabase = makeMilestoneClient({
        contract: {
          id: "contract-1",
          provider_id: "provider-1",
          client_id: "client-1",
          adjudicated_quote_id: "quote-1",
          status: "ACTIVE",
        },
        milestone: { id: "milestone-1", contract_id: "contract-1", title: "Milestone 1", amount_cents: 5000, status: "SUBMITTED", require_evidence: true },
        allApproved: true,
        quote: { warranty_months: 12, terms: "Garantia de testes" },
      });
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.success).toBe(true);
      expect(mockEmitWarranty).toHaveBeenCalledTimes(1);
      const [contractArg, quoteArg] = mockEmitWarranty.mock.calls[0];
      expect(contractArg.status).toBe("COMPLETED");
      expect(quoteArg).toEqual({ warranty_months: 12, terms: "Garantia de testes" });
    });

    it("pagamento já registado (guard) -> não duplica e approve continua (d)", async () => {
      session("client");
      mockRecordPayment.mockResolvedValue({ duplicated: true });
      mockEmitWarranty.mockResolvedValue({ emitted: false, reason: "semgarantia" });

      const supabase = makeMilestoneClient({
        contract: {
          id: "contract-1",
          provider_id: "provider-1",
          client_id: "client-1",
          adjudicated_quote_id: "quote-1",
          status: "ACTIVE",
        },
        milestone: { id: "milestone-1", contract_id: "contract-1", title: "Milestone 1", amount_cents: 5000, status: "SUBMITTED", require_evidence: true },
        allApproved: false,
        quote: null,
      });
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

      const formData = new FormData();
      formData.append("contractId", "contract-1");
      formData.append("milestoneId", "milestone-1");
      formData.append("approve", "true");

      const { approveMilestoneAction } = await import("@/app/mercado/actions");
      const result = await approveMilestoneAction(formData);

      expect(result.success).toBe(true);
      expect(mockRecordPayment).toHaveBeenCalledTimes(1);
      expect(mockEmitWarranty).not.toHaveBeenCalled();
    });
  });
});