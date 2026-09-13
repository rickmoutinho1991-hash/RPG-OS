import {
  AtTaxValidationRequest,
  AtTaxValidationResponse,
} from "../types/integrations";
import { isValidPortugueseNif } from "../validation/nif";

export interface IAtTaxAuthorityAdapter {
  validateNif(
    request: AtTaxValidationRequest,
  ): Promise<AtTaxValidationResponse>;
}

export class AtTaxAuthorityAdapter implements IAtTaxAuthorityAdapter {
  constructor(
    private readonly config: {
      apiEndpoint?: string;
      apiKey?: string;
    } = {},
  ) {}

  async validateNif(
    request: AtTaxValidationRequest,
  ): Promise<AtTaxValidationResponse> {
    const isValid = isValidPortugueseNif(request.taxNumber);

    if (!isValid) {
      return {
        valid: false,
        taxNumber: request.taxNumber,
        status: "INACTIVE",
        verifiedAt: new Date().toISOString(),
        verificationSource: "LOCAL_FORMAT_CHECK",
      };
    }

    // HARDENING: apenas validação LOCAL de formato (checksum do NIF).
    // Sem chamada à AT, nunca afirmar verificação oficial: sem nome
    // "Entidade Fiscal Verificada". O status reflete só o formato.
    // verificationSource marca explicitamente a proveniência para que nenhum
    // consumidor futuro interprete ACTIVE como confirmação AT.
    return {
      valid: true,
      taxNumber: request.taxNumber,
      status: "ACTIVE",
      verifiedAt: new Date().toISOString(),
      verificationSource: "LOCAL_FORMAT_CHECK",
    };
  }

  async validateTaxNumber(
    request: AtTaxValidationRequest,
  ): Promise<AtTaxValidationResponse> {
    return this.validateNif(request);
  }

}
