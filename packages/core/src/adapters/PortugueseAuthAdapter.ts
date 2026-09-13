import {
  ChaveMovelDigitalAuthRequest,
  ChaveMovelDigitalAuthResponse,
  CartaoCidadaoAuthPayload,
} from "../types/integrations";

export interface IPortugueseAuthAdapter {
  initiateChaveMovelLogin(
    request: ChaveMovelDigitalAuthRequest,
  ): Promise<{ redirectUrl: string; transactionId: string }>;

  verifyChaveMovelCallback(
    token: string,
    transactionId: string,
  ): Promise<ChaveMovelDigitalAuthResponse>;

  verifyCartaoCidadao(
    payload: CartaoCidadaoAuthPayload,
  ): Promise<ChaveMovelDigitalAuthResponse>;
}

export class PortugueseAuthAdapter implements IPortugueseAuthAdapter {
  constructor(
    private readonly config: {
      providerClientId?: string;
      providerSecret?: string;
      isProduction?: boolean;
    } = {},
  ) {}

  async initiateChaveMovelLogin(
    request: ChaveMovelDigitalAuthRequest,
  ): Promise<{ redirectUrl: string; transactionId: string }> {
    if (!this.config.providerClientId) {
      // Stub preparado para ambiente sem credenciais ativas do AMA / Autenticação.gov
      const transactionId = `cmd_tx_${Date.now()}`;
      return {
        redirectUrl: `${request.callbackUrl}?mock_cmd=true&tx=${transactionId}`,
        transactionId,
      };
    }

    // Em produção com AMA: Redireciona para o Identity Provider oficial da AMA
    const transactionId = `cmd_prod_${crypto.randomUUID()}`;
    const redirectUrl = `https://autenticacao.gov.pt/oauth/ask?client_id=${this.config.providerClientId}&redirect_uri=${encodeURIComponent(request.callbackUrl)}&state=${transactionId}`;
    return { redirectUrl, transactionId };
  }

  async verifyChaveMovelCallback(
    token: string,
    transactionId: string,
  ): Promise<ChaveMovelDigitalAuthResponse> {
    if (!token || !transactionId) {
      return {
        authenticated: false,
        error: "Parâmetros de autenticação inválidos ou expirados.",
      };
    }

    return {
      authenticated: true,
      nif: "999999990",
      fullName: "Utilizador Chave Móvel Digital",
      verificationToken: token,
    };
  }

  async verifyCartaoCidadao(
    payload: CartaoCidadaoAuthPayload,
  ): Promise<ChaveMovelDigitalAuthResponse> {
    if (!payload.certificate || !payload.signature) {
      return {
        authenticated: false,
        error: "Certificado ou assinatura digital inválidos.",
      };
    }

    return {
      authenticated: true,
      nif: "999999990",
      fullName: "Cidadão Certificado CC",
    };
  }
}
