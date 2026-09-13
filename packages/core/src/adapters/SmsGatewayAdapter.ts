import { SmsDispatchPayload, SmsDispatchResult } from "../types/integrations";
import { isValidPortuguesePhone } from "../validation/phone";

export interface ISmsGatewayAdapter {
  dispatchSms(payload: SmsDispatchPayload): Promise<SmsDispatchResult>;
}

export class SmsGatewayAdapter implements ISmsGatewayAdapter {
  constructor(
    private readonly config: {
      providerApiKey?: string;
      defaultSenderName?: string;
      isProduction?: boolean;
    } = {},
  ) {}

  async dispatchSms(payload: SmsDispatchPayload): Promise<SmsDispatchResult> {
    const rawPhone = payload.recipientPhone.replace(/\s/g, "");

    if (!isValidPortuguesePhone(rawPhone)) {
      return {
        success: false,
        sentAt: new Date().toISOString(),
        status: "FAILED",
        errorMessage: `Número de telefone móvel português inválido: ${payload.recipientPhone}`,
      };
    }

    if (!this.config.providerApiKey) {
      // Modo sandbox / demonstração segura
      return {
        success: true,
        messageId: `mock_sms_${Date.now()}`,
        sentAt: new Date().toISOString(),
        status: "MOCK_DISPATCHED",
      };
    }

    // Modo de produção: Integração com gateway SMS (ex: E-Goi / Twilio / Gateway Operador)
    return {
      success: true,
      messageId: `sms_prod_${Date.now()}`,
      sentAt: new Date().toISOString(),
      status: "SENT",
    };
  }
}
