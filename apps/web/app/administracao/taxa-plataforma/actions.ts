"use server";

import {
  proposeFeeConfigChange,
  type FeeConfigProposeResult,
} from "@/lib/feeConfig";

/**
 * Server Action: proposta de alteração da taxa RPG-OS.
 * O cliente apenas envia o input; toda a autorização (platform_fees.manage),
 * validação de âmbito multi-tenant (resolvido na BD) e criação do workflow
 * acontecem AQUI, no servidor — nunca no cliente.
 */
export async function proposeFeeConfigChangeAction(input: {
  scope: "GLOBAL" | "COMPANY";
  companyId?: string | null;
  newBasisPoints: number;
  reason?: string;
}): Promise<FeeConfigProposeResult> {
  return proposeFeeConfigChange(input);
}