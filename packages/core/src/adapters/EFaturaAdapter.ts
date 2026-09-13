import {
  EFaturaCommunicationPayload,
  EFaturaCommunicationResult,
  SibsMbWayPaymentRequest,
  SibsMultibancoReferenceResponse,
} from "../types/integrations";

export interface IEFaturaAdapter {
  communicateInvoice(
    payload: EFaturaCommunicationPayload,
  ): Promise<EFaturaCommunicationResult>;
}

export class EFaturaAdapter implements IEFaturaAdapter {
  constructor(
    private readonly config: {
      softwareCertificate?: string;
      atCredentials?: { username: string; token: string };
    } = {},
  ) {}

  async communicateInvoice(
    payload: EFaturaCommunicationPayload,
  ): Promise<EFaturaCommunicationResult> {
    // HARDENING: sem integração oficial com AT/e-Fatura, esta operação NÃO
    // comunica nada. Devolver erro explícito — nunca REGISTERED nem número
    // de registo fabricado. A fatura permanece válida apenas localmente.
    void payload;
    return {
      success: false,
      submittedAt: new Date().toISOString(),
      status: "ERROR",
      errorMessage:
        "Integração oficial e-Fatura/AT ainda não disponível. " +
        "Fatura registada apenas localmente no RPG-OS; " +
        "a comunicação oficial deve ser feita manualmente no Portal das Finanças.",
    };
  }
}

export interface IPaymentGatewayAdapter {
  generateMultibancoReference(
    amount: number,
    orderId: string,
  ): Promise<SibsMultibancoReferenceResponse>;

  requestMbWayPayment(
    request: SibsMbWayPaymentRequest,
  ): Promise<{ success: boolean; transactionId: string; message: string }>;
}

export class SibsPaymentGatewayAdapter implements IPaymentGatewayAdapter {
  constructor(
    private readonly config: {
      entityCode?: string;
      subEntityCode?: string;
      apiKey?: string;
    } = {},
  ) {}

  async generateMultibancoReference(
    amount: number,
    _orderId: string,
  ): Promise<SibsMultibancoReferenceResponse> {
    // HARDENING: sem gateway SIBS real, gerar uma referência aleatória seria
    // apresentá-la como referência oficial pagável. Falhar explicitamente.
    void amount;
    throw new Error(
      "Referências Multibanco indisponíveis: ainda sem integração oficial SIBS. " +
        "Nenhuma referência foi gerada e nenhum pagamento foi iniciado.",
    );
  }

  async requestMbWayPayment(
    request: SibsMbWayPaymentRequest,
  ): Promise<{ success: boolean; transactionId: string; message: string }> {
    // HARDENING: sem gateway real, nunca afirmar envio/notificação.
    return {
      success: false,
      transactionId: "",
      message:
        "Pagamento MB WAY indisponível: ainda sem integração oficial SIBS. " +
        `Nenhum pagamento foi executado para ${request.phoneNumber}.`,
    };
  }
}
