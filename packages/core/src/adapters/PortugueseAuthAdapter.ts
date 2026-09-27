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
  private readonly isProduction: boolean;
  private readonly providerConfigured: boolean;

  constructor(
    private readonly config: {
      providerClientId?: string;
      providerSecret?: string;
      isProduction?: boolean;
    } = {},
  ) {
    this.isProduction =
      config.isProduction ?? process.env.NODE_ENV === "production";
    this.providerConfigured = Boolean(config.providerClientId);
  }

  async initiateChaveMovelLogin(
    request: ChaveMovelDigitalAuthRequest,
  ): Promise<{ redirectUrl: string; transactionId: string }> {
    if (!this.providerConfigured) {
      // Em produção sem credenciais AMA, NUNCA devolver o mock de login —
      // falhar em vez de aceitar autenticação falsa.
      if (this.isProduction) {
        throw new Error(
          "Chave Móvel Digital indisponível (provedor AMA não configurado).",
        );
      }
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

    if (this.isProduction) {
      // Não há validação real de callback implementada — nunca autenticar com
      // base apenas num token de forma (falha fechada em produção).
      return {
        authenticated: false,
        error: "Verificação Chave Móvel Digital indisponível.",
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

    if (this.isProduction) {
      return {
        authenticated: false,
        error: "Verificação Cartão de Cidadão indisponível.",
      };
    }

    return {
      authenticated: true,
      nif: "999999990",
      fullName: "Cidadão Certificado CC",
    };
  }
}
