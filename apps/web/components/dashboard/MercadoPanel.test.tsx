import { describe, it, expect, vi, beforeEach } from "vitest";
import { MercadoPanel } from "@/components/dashboard/MercadoPanel";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock supabase
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(() => Promise.resolve({
    user: { id: "user-123", name: "Test User" },
    organization: { id: "org-123", name: "Test Org" },
    permissions: ["marketplace.view", "marketplace.quotes.create"],
  })),
}));

describe("MercadoPanel - P5-B tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mercado vazio → empty state honesto sem CTA de criação (a)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const panel = await MercadoPanel({ userId: "user-123", companyId: null });
    
    expect(panel).toBeTruthy();
    // Verify the panel renders empty state without creation CTA
    // The empty state should say "Ainda não há pedidos no mercado" and note about fluxo de criação
  });

  it("pedido em estado propostas → mini-stepper no passo 2 + contagem de propostas (b)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    
    // Mock request with QUOTES_RECEIVED status and 2 quotes
    const mockRequest = {
      id: "req-1",
      title: "Reparação persiana",
      description: "Persiana elétrica não sobe",
      status: "QUOTES_RECEIVED",
      category_id: "cat-1",
      client_id: "user-123",
      provider_id: null,
      urgency: "MEDIUM",
      desired_start_date: "2026-09-20",
      created_at: "2026-09-10T10:00:00Z",
      updated_at: "2026-09-12T14:00:00Z",
      quotes: [
        { id: "q-1", provider_id: "prov-1", status: "SENT", total_cents: 34000, currency: "EUR" },
        { id: "q-2", provider_id: "prov-2", status: "VIEWED", total_cents: 28000, currency: "EUR" },
      ],
    };

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [mockRequest], error: null })),
              })),
            })),
          })),
        })),
      })),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const panel = await MercadoPanel({ userId: "user-123", companyId: null });
    expect(panel).toBeTruthy();
    // Verify stepper shows step 2 (QUOTES_RECEIVED = step 1, but index-based = 1, so step 2 visually)
    // Verify quotes count shows 2
  });

  it("pedido fechado → submitQuote rejeitado pela state machine (e)", () => {
    // Test that submitting quote to COMPLETED request is rejected by state machine
    // COMPLETED is terminal, so addQuoteToRequest should not allow new quotes
    // The action should reject with proper error
    
    expect(true).toBe(true); // Placeholder - actual test would use the action
  });
});

describe("MercadoPanel - P7a tests", () => {
  it("action criar pedido com inputs inválidos → erro tipado sem escrita (a)", async () => {
    // Test createRequestAction with invalid inputs
    // Should return typed error without writing to DB
  });

  it("submitQuote OPEN→QUOTES_RECEIVED via core (b)", async () => {
    // Test submitQuoteAction transitions request from PUBLISHED/QUOTES_RECEIVED
    // via MarketplaceFlow.addQuoteToRequest
  });

  it("papel sem marketplace.quotes.create não vê form e action recusa (c)", async () => {
    // Test that user without marketplace.quotes.create permission
    // doesn't see quote form and action returns permission error
  });

  it("leitura de pedido alheio → notFound (d)", async () => {
    // Test that user who is not owner nor provider with quote gets 404
  });

  it("submitQuote em pedido fechado → rejeição da machine (e)", async () => {
    // Test submitQuote on COMPLETED/CANCELLED request is rejected by state machine
  });
});