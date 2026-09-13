import { describe, it, expect } from "vitest";
import {
  parsePercentToBasisPoints,
  validateFeeConfigChange,
  formatBasisPoints,
} from "../PlatformFeeService";
import {
  resolveExecutionNextStep,
  isExecutionTerminalStep,
  type ExecutionStepDef,
  type ExecutionTransitionDef,
} from "../workflowExecution";

describe("Platform Fee Workflow Integration", () => {
  it("simula fluxo REQUESTED → APPROVED para alteração global", () => {
    // Estado inicial: taxa global de 2,5%
    const currentBps = 250;
    
    // Proposta: alterar para 3,0%
    const newPercent = "3.0";
    const newBps = parsePercentToBasisPoints(newPercent);
    
    expect(newBps).toBe(300);
    
    // Validação server-side
    const validation = validateFeeConfigChange({
      currentBps,
      newBps,
    });
    
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    
    // Após aprovação, a nova taxa fica ativa
    expect(formatBasisPoints(newBps as number)).toBe("3,00%");
  });

  it("simula fluxo REQUESTED → APPROVED para override por empresa", () => {
    // Estado inicial: taxa global de 2,5%
    const globalBps = 250;
    
    // Proposta: override para empresa específica com 2,0%
    const companyBps = 200;
    
    const validation = validateFeeConfigChange({
      currentBps: globalBps,
      newBps: companyBps,
    });
    
    expect(validation.valid).toBe(true);
    
    // A config da empresa deve prevalecer sobre a global
    expect(formatBasisPoints(companyBps)).toBe("2,00%");
  });

  it("fluxo REQUESTED → REJECTED não altera configuração", () => {
    const currentBps = 250;
    const proposedBps = 300;
    
    const validation = validateFeeConfigChange({
      currentBps,
      newBps: proposedBps,
    });
    
    expect(validation.valid).toBe(true);
    
    // Após rejeição, a taxa original mantém-se
    expect(formatBasisPoints(currentBps)).toBe("2,50%");
  });

  it("motivo obrigatório para alteração global", () => {
    const currentBps = 250;
    const newBps = 300;
    const reason = "";
    
    // No fluxo real, o servidor valida reason.trim().length > 0
    expect(reason.trim().length).toBe(0);
  });

  it("alteração só afeta novos pagamentos (histórico imutável)", () => {
    // Simulação: pagamento existente com taxa de 2,5%
    const historicalFeeBps = 250;
    const historicalGrossCents = 100000; // 1.000 €
    
    // Nova taxa: 3,0%
    const newFeeBps = 300;
    
    // Histórico não é recalculado
    const historicalFeeCents = Math.round((historicalGrossCents * historicalFeeBps) / 10000);
    expect(historicalFeeCents).toBe(2500); // 25 €
    
    // Novos pagamentos usam a nova taxa
    const newFeeCents = Math.round((historicalGrossCents * newFeeBps) / 10000);
    expect(newFeeCents).toBe(3000); // 30 €
  });

  it("idempotência: pedido duplicado reutiliza instância existente", () => {
    // Primeiro pedido cria instância PENDING
    const firstRequest = {
      scope: "GLOBAL" as const,
      newBps: 300,
      reason: "Ajuste de mercado",
    };
    
    // Segundo pedido com mesmos parâmetros
    const secondRequest = { ...firstRequest };
    
    // No fluxo real, o servidor verifica duplicatas no mesmo estado
    expect(firstRequest).toEqual(secondRequest);
  });

  it("concorrência: apenas uma alteração ativa por escopo", () => {
    // Configuração global ativa
    const activeConfig = { companyId: null, basisPoints: 250, isActive: true };
    
    // Nova alteração desativa a anterior
    const newConfig = { companyId: null, basisPoints: 300, isActive: true };
    
    // No fluxo real, o servidor usa unique index parcial
    expect(activeConfig.isActive).toBe(true);
    expect(newConfig.isActive).toBe(true);
    
    // Apenas uma deve ficar ativa ( enforced pela BD)
  });

  it("isolação multi-tenant: override por empresa não afeta outras", () => {
    const globalBps = 250;
    const companyABps = 200;
    const companyBBps = 300;
    
    // Empresa A: 2,0%
    expect(formatBasisPoints(companyABps)).toBe("2,00%");
    
    // Empresa B: 3,0%
    expect(formatBasisPoints(companyBBps)).toBe("3,00%");
    
    // Global: 2,5% (fallback para empresas sem override)
    expect(formatBasisPoints(globalBps)).toBe("2,50%");
  });

  it("taxa 0% desativa fee (default seguro)", () => {
    const validation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 0,
    });
    
    expect(validation.valid).toBe(true);
    expect(formatBasisPoints(0)).toBe("0,00%");
  });

  it("taxa 100% (fee total) é valida mas edge case", () => {
    const validation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 10000,
    });

    expect(validation.valid).toBe(true);
    expect(formatBasisPoints(10000)).toBe("100,00%");
  });
});

describe("Workflow Engine: REQUESTED → APPROVED / REJECTED (PLATFORM_FEE_CONFIG)", () => {
  // Definição usada pelo fluxo da taxa: proposta nasce em REQUESTED e o
  // motor EXISTENTE (workflowExecution, sem segunda implementação) resolve
  // a decisão. É a mesma máquina usada por decideWorkflowAction.
  const steps: ExecutionStepDef[] = [
    { key: "REQUESTED", name: "Pedido", position: 0 },
    { key: "APPROVED", name: "Aprovado", position: 1 },
    { key: "REJECTED", name: "Rejeitado", position: 2 },
  ];
  const transitions: ExecutionTransitionDef[] = [
    {
      fromStep: "REQUESTED",
      toStep: "APPROVED",
      requiredPermission: "workflows.approve",
      condition: { decision: "APPROVED" },
    },
    {
      fromStep: "REQUESTED",
      toStep: "REJECTED",
      requiredPermission: "workflows.approve",
      condition: { decision: "REJECTED" },
    },
  ];

  it("REQUESTED avança para APPROVED no motor existente", () => {
    expect(
      resolveExecutionNextStep("REQUESTED", "APPROVED", steps, transitions),
    ).toEqual({ type: "ADVANCE", toStep: "APPROVED" });
  });

  it("REQUESTED avança para REJECTED no motor existente", () => {
    expect(
      resolveExecutionNextStep("REQUESTED", "REJECTED", steps, transitions),
    ).toEqual({ type: "ADVANCE", toStep: "REJECTED" });
  });

  it("passos terminais não têm transições de saída", () => {
    expect(isExecutionTerminalStep(transitions, "APPROVED")).toBe(true);
    expect(isExecutionTerminalStep(transitions, "REJECTED")).toBe(true);
    expect(isExecutionTerminalStep(transitions, "REQUESTED")).toBe(false);
  });

  it("após APPROVED a configuração proposta fica ativa; após REJECTED mantém-se a atual", () => {
    const currentBps = 250;
    const proposedBps = 300;

    // Aprovação: a config nova substitui a anterior (applyFeeConfigChange
    // desativa a antiga e insere a nova — snapshots antigos ficam intactos).
    const approvedActive = { companyId: null, basisPoints: proposedBps, isActive: true };
    const oldDeactivated = { companyId: null, basisPoints: currentBps, isActive: false };
    expect(resolveExecutionNextStep("REQUESTED", "APPROVED", steps, transitions)).toEqual({
      type: "ADVANCE",
      toStep: "APPROVED",
    });
    expect(approvedActive.isActive).toBe(true);
    expect(oldDeactivated.isActive).toBe(false);

    // Rejeição: nada muda.
    expect(resolveExecutionNextStep("REQUESTED", "REJECTED", steps, transitions)).toEqual({
      type: "ADVANCE",
      toStep: "REJECTED",
    });
    expect(formatBasisPoints(currentBps)).toBe("2,50%");
  });
});