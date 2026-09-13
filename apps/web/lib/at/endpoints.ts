/**
 * RPG-OS — AT official endpoints (allowlist estrita, sem invenção).
 *
 * Fontes: Manual de Integração de Software e-Fatura (AT) + WSDL Fatcorews
 * (namespace http://factemi.at.min_financas.pt/documents, SOAP 1.1).
 * Só estes hosts/portas podem ser contactados. Qualquer outro destino,
 * incluindo localhost e IPs privados, é rejeitado (anti-SSRF).
 */

export type AtEnvironment = "TEST" | "PRODUCTION";

export interface AtEndpoint {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly url: string;
}

/** Allowlist oficial. Produção incluída mas BLOQUEADA por defeito (ver abaixo). */
const ENDPOINTS: Record<AtEnvironment, Record<"fatcorews" | "fatshare", AtEndpoint>> = {
  TEST: {
    fatcorews: {
      host: "servicos.portaldasfinancas.gov.pt",
      port: 723,
      path: "/fatcorews/ws/",
      url: "https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/",
    },
    fatshare: {
      host: "servicos.portaldasfinancas.gov.pt",
      port: 725,
      path: "/fatshare/ws/fatshareFaturas",
      url: "https://servicos.portaldasfinancas.gov.pt:725/fatshare/ws/fatshareFaturas",
    },
  },
  PRODUCTION: {
    fatcorews: {
      host: "servicos.portaldasfinancas.gov.pt",
      port: 423,
      path: "/fatcorews/ws/",
      url: "https://servicos.portaldasfinancas.gov.pt:423/fatcorews/ws/",
    },
    fatshare: {
      host: "servicos.portaldasfinancas.gov.pt",
      port: 425,
      path: "/fatshare/ws/fatshareFaturas",
      url: "https://servicos.portaldasfinancas.gov.pt:425/fatshare/ws/fatshareFaturas",
    },
  },
};

export type AtService = keyof (typeof ENDPOINTS)[AtEnvironment];

/** Produção exige habilitação explícita (futura); TEST é o único permitido. */
export function resolveAtEndpoint(
  environment: AtEnvironment,
  service: AtService,
  opts?: { allowProduction?: boolean },
): AtEndpoint {
  if (environment === "PRODUCTION" && opts?.allowProduction !== true) {
    throw new Error("AT_PRODUCTION_DISABLED");
  }
  return ENDPOINTS[environment][service];
}

/**
 * Gate puro D8: só TEST prossegue para qualquer operação de rede.
 * Usado por connectivity antes do resolver — produção/bogus falham closed
 * sem tocar em credenciais, Vault ou rede.
 */
export function assertTestOnlyEnvironment(environment: string): void {
  if (environment !== "TEST") {
    throw new Error("AT_PRODUCTION_DISABLED");
  }
}

/** Valida que um URL pertence à allowlist (anti-SSRF; sem DNS rebinding). */
export function isAllowedAtUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const allowed: AtEndpoint[] = (Object.values(ENDPOINTS) as Array<Record<string, AtEndpoint>>).flatMap(
    (env) => Object.values(env),
  );
  return allowed.some((e) => parsed.host === `${e.host}:${e.port}` && parsed.pathname === e.path);
}

export const AT_WSDL = {
  namespace: "http://factemi.at.min_financas.pt/documents",
  fatcorews:
    "https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Outras_entidades/Suporte_tecnologico/Webservice/e_Fatura/Documents/Fatcorews.wsdl",
  soapVersion: "1.1" as const,
  bindingStyle: "document/literal",
  checkedAt: "2026-09-06",
} as const;
