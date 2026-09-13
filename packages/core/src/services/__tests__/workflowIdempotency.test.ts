import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "../workflowService";

/**
 * Cobertura da classificação de corrida no INSERT de workflow_instances.
 * NOTA: provar a race condition real (dois INSERTs simultâneos rejeitados
 * pelo índice parcial único uq_workflow_one_pending_per_entity) exige um
 * teste de integração contra PostgreSQL/Supabase — documentado como
 * limitação; não é reproduzível num unit test sem infraestrutura artificial.
 */
describe("isUniqueViolation — classificação de corrida no INSERT", () => {
  it("reconhece SQLSTATE 23505 (PostgREST/Postgres)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(
      isUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_workflow_one_pending_per_entity"',
      }),
    ).toBe(true);
  });

  it("reconhece mensagem 'duplicate key' sem code (supabase-js)", () => {
    expect(
      isUniqueViolation({
        message:
          'duplicate key value violates unique constraint "uq_workflow_one_pending_per_entity"',
      }),
    ).toBe(true);
  });

  it("reconhece variante 'unique constraint' na mensagem", () => {
    expect(
      isUniqueViolation({
        message: "Unique Constraint Violation on workflow_instances",
      }),
    ).toBe(true);
  });

  it("não classifica outros erros como corrida de duplicação", () => {
    expect(
      isUniqueViolation({ code: "23503", message: "foreign key violation" }),
    ).toBe(false);
    expect(isUniqueViolation({ message: "connection reset" })).toBe(false);
    expect(isUniqueViolation({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
  });

  it("trata entradas vazias de forma segura", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation({ message: undefined })).toBe(false);
    expect(isUniqueViolation({ message: "" })).toBe(false);
  });
});