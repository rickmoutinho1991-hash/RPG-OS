import { describe, expect, it } from "vitest";
// Dados fictícios — nenhum dado pessoal real nos testes.
import {
  classifyData,
  isSensitiveData,
  requiresEncryption,
  canAppearInAuditLog,
  sensitivityRank,
  DATA_CLASSIFICATIONS,
} from "../dataClassification";

describe("dataClassification", () => {
  it("classifica chaves de password/token como HIGHLY_SENSITIVE", () => {
    for (const key of ["password", "userPassword", "api_key", "accessToken", "secret", "credentials"]) {
      expect(classifyData(key, "valor-ficticio").level).toBe("HIGHLY_SENSITIVE");
    }
  });

  it("classifica email/telefone/NIF/IBAN como SENSITIVE por chave", () => {
    for (const key of ["email", "contactEmail", "phone", "telefone", "nif", "taxNumber", "iban"]) {
      expect(classifyData(key, "x").level).toBe("SENSITIVE");
    }
  });

  it("classifica por conteúdo quando a chave é genérica", () => {
    expect(classifyData("valor", "exemplo.teste@dominio.com").level).toBe("SENSITIVE");
    expect(classifyData("valor", "123456789").level).toBe("SENSITIVE");
    expect(classifyData("valor", "PT50000201231234567890154").level).toBe("SENSITIVE");
  });

  it("classifica dados de negócio como CONFIDENTIAL", () => {
    expect(classifyData("projectName", "Obra X").level).toBe("CONFIDENTIAL");
    expect(classifyData("totalAmount", 100).level).toBe("CONFIDENTIAL");
  });

  it("é determinístico", () => {
    expect(classifyData("email", "a@b.com")).toEqual(classifyData("email", "a@b.com"));
  });

  it("isSensitiveData: true apenas para SENSITIVE/HIGHLY_SENSITIVE", () => {
    expect(isSensitiveData("PUBLIC")).toBe(false);
    expect(isSensitiveData("INTERNAL")).toBe(false);
    expect(isSensitiveData("CONFIDENTIAL")).toBe(false);
    expect(isSensitiveData("SENSITIVE")).toBe(true);
    expect(isSensitiveData("HIGHLY_SENSITIVE")).toBe(true);
  });

  it("requiresEncryption segue a tabela de classificações", () => {
    expect(requiresEncryption("PUBLIC")).toBe(false);
    expect(requiresEncryption("INTERNAL")).toBe(false);
    expect(requiresEncryption("CONFIDENTIAL")).toBe(true);
    expect(requiresEncryption("SENSITIVE")).toBe(true);
    expect(requiresEncryption("HIGHLY_SENSITIVE")).toBe(true);
  });

  it("HIGHLY_SENSITIVE nunca pode aparecer em audit log", () => {
    expect(canAppearInAuditLog("HIGHLY_SENSITIVE")).toBe(false);
    expect(canAppearInAuditLog("SENSITIVE")).toBe(true); // em forma redigida
  });

  it("ordem de sensibilidade é consistente", () => {
    expect(sensitivityRank("HIGHLY_SENSITIVE")).toBeGreaterThan(
      sensitivityRank("SENSITIVE"),
    );
    expect(Object.keys(DATA_CLASSIFICATIONS)).toHaveLength(5);
  });
});
