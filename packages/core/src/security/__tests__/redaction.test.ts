import { describe, expect, it } from "vitest";
import {
  redactSensitiveValue,
  sanitizeAuditMetadata,
} from "../redaction";

// Todos os valores abaixo são fictícios e inválidos na prática.
describe("redaction", () => {
  it("mascara email parcialmente preservando domínio", () => {
    const out = redactSensitiveValue("exemplo.teste@dominio.com", "SENSITIVE");
    expect(out).toBe("ex***@dominio.com");
    expect(String(out)).not.toContain("teste");
  });

  it("mascara telefone PT", () => {
    const out = redactSensitiveValue("912345678", "SENSITIVE");
    expect(String(out)).toContain("***");
    expect(String(out)).not.toContain("912345678");
  });

  it("mascara NIF de 9 dígitos", () => {
    const out = redactSensitiveValue("123456789", "SENSITIVE");
    expect(out).toBe("***789");
  });

  it("mascara IBAN PT preservando apenas PT50 e últimos 4", () => {
    const out = redactSensitiveValue("PT50 0002 0123 1234 5678 9015 4", "SENSITIVE");
    expect(String(out)).toMatch(/^PT50\*{17}0154$/);
  });

  it("omit totalmente passwords/tokens/secrets (não aparecem no log)", () => {
    expect(redactSensitiveValue("qualquer", "HIGHLY_SENSITIVE")).toBeUndefined();
    expect(redactSensitiveValue("sk-live-abc", "HIGHLY_SENSITIVE")).toBeUndefined();
  });

  it("PUBLIC/INTERNAL passam intactos", () => {
    expect(redactSensitiveValue("estado", "INTERNAL")).toBe("estado");
  });

  it("valores não-string sensíveis viram [REDACTED]", () => {
    expect(redactSensitiveValue(42, "SENSITIVE")).toBe("[REDACTED]");
  });

  describe("sanitizeAuditMetadata", () => {
    it("remove chaves secretas e redige PII", () => {
      const out = sanitizeAuditMetadata({
        action: "CLIENT_UPDATED",
        email: "exemplo.teste@dominio.com",
        phone: "912345678",
        nif: "123456789",
        password: "nao-guardar",
        apiKey: "sk-xxx",
        accessToken: "tok",
      });
      expect(out.action).toBe("CLIENT_UPDATED");
      expect(out.email).toBe("ex***@dominio.com");
      expect(String(out.phone)).toContain("***");
      expect(out.nif).toBe("***789");
      // Nunca existem no output — nem como [REDACTED]:
      expect("password" in out).toBe(false);
      expect("apiKey" in out).toBe(false);
      expect("accessToken" in out).toBe(false);
    });

    it("trata objetos aninhados", () => {
      const out = sanitizeAuditMetadata({
        pedido: {
          contacto: { email: "exemplo.teste@dominio.com" },
          credential: { token: "x" },
        },
      });
      const pedido = out.pedido as Record<string, unknown>;
      const contacto = pedido.contacto as Record<string, unknown>;
      expect(contacto.email).toBe("ex***@dominio.com");
      expect("credential" in pedido).toBe(false);
    });

    it("não altera o objeto original", () => {
      const original = { email: "exemplo.teste@dominio.com", password: "x" };
      const snapshot = { ...original };
      sanitizeAuditMetadata(original);
      expect(original).toEqual(snapshot);
    });

    it("mantém dados de negócio (CONFIDENTIAL) para auditoria útil", () => {
      const out = sanitizeAuditMetadata({
        entity: "QUOTE",
        status: "APPROVED",
        total: 1500,
      });
      expect(out).toEqual({ entity: "QUOTE", status: "APPROVED", total: 1500 });
    });

    it("redige estruturas demasiado profundas", () => {
      const deep = { a: { b: { c: { d: { e: { f: { g: "segredo-operacional" } } } } } } };
      const out = sanitizeAuditMetadata(deep);
      let cur: unknown = out;
      for (const k of ["a", "b", "c", "d", "e", "f"]) {
        cur = (cur as Record<string, unknown>)[k];
      }
      expect(cur).toBe("[REDACTED]");
    });
  });
});
