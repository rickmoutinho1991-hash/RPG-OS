/**
 * RPG-OS — AT transport tests (sem rede, sem AT, sem credenciais).
 *
 * Prova: allowlist/SSRF, envelopes escapados, parsing (response/fault/
 * malformed), error mapping, timeout, XXE-safe. Nenhum teste faz chamadas
 * reais nem declara conectividade.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAtEndpoint,
  isAllowedAtUrl,
  AT_WSDL,
} from "../endpoints";
import {
  escapeXml,
  buildSoapEnvelope,
  buildWfaHeader,
  parseAtSoapResponse,
  readFatcorewsResponse,
  readFatshareResponse,
  normalizeTransportError,
} from "../soap";
import { sendAtSoap } from "../transport";

describe("endpoints (allowlist oficial)", () => {
  it("TEST resolve os endpoints oficiais documentados", () => {
    expect(resolveAtEndpoint("TEST", "fatcorews").url).toBe(
      "https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/",
    );
    expect(resolveAtEndpoint("TEST", "fatshare").url).toBe(
      "https://servicos.portaldasfinancas.gov.pt:725/fatshare/ws/fatshareFaturas",
    );
  });

  it("PRODUCTION bloqueada por defeito", () => {
    expect(() => resolveAtEndpoint("PRODUCTION", "fatcorews")).toThrow(
      "AT_PRODUCTION_DISABLED",
    );
  });

  it("SSRF: só allowlist passa (localhost, IPs privados e http recusados)", () => {
    expect(isAllowedAtUrl("https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/")).toBe(true);
    expect(isAllowedAtUrl("http://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/")).toBe(false);
    expect(isAllowedAtUrl("http://localhost:3000/x")).toBe(false);
    expect(isAllowedAtUrl("http://127.0.0.1:54321/x")).toBe(false);
    expect(isAllowedAtUrl("http://169.254.169.254/")).toBe(false);
    expect(isAllowedAtUrl("https://evil.example.com:723/fatcorews/ws/")).toBe(false);
    expect(isAllowedAtUrl("not-a-url")).toBe(false);
  });

  it("WSDL refere namespace e SOAP 1.1 oficiais", () => {
    expect(AT_WSDL.namespace).toBe("http://factemi.at.min_financas.pt/documents");
    expect(AT_WSDL.soapVersion).toBe("1.1");
  });
});

describe("SOAP building (sem invenção de campos além do manual)", () => {
  it("escapa valores (anti XML injection)", () => {
    expect(escapeXml(`<a>&"'`)).toBe("&lt;a&gt;&amp;&quot;&apos;");
  });

  it("envelope contém header/body e namespace", () => {
    const env = buildSoapEnvelope("Invoices", "<H/>", "<B>&</B>");
    expect(env).toContain("schemas.xmlsoap.org/soap/envelope");
    expect(env).toContain(AT_WSDL.namespace);
    expect(env).toContain("<soap:Header><H/></soap:Header>");
  });

  it("WFA header inclui os 4 campos (valores escapados)", () => {
    const h = buildWfaHeader({ username: "u", password: "p<", nonce: "n", created: "c" });
    expect(h).toContain("<wsse:Username>u</wsse:Username>");
    expect(h).toContain("p&lt;");
  });
});

describe("SOAP parsing (fixtures de forma, não respostas AT)", () => {
  const faultXml =
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><soap:Fault><faultcode>soap:Client</faultcode>` +
    `<faultstring>Auth failed</faultstring></soap:Fault></soap:Body></soap:Envelope>`;

  const fatcorewsXml =
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><RegisterInvoiceResponse xmlns="http://factemi.at.min_financas.pt/documents">` +
    `<Response><CodigoResposta>0</CodigoResposta><Mensagem>OK</Mensagem>` +
    `<DataOperacao>2026-09-06T00:00:00</DataOperacao></Response>` +
    `</RegisterInvoiceResponse></soap:Body></soap:Envelope>`;

  const fatshareXml =
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><InvoicesResponse xmlns="http://factemi.at.min_financas.pt/fatshareInvoices">` +
    `<estadoExecucao><EstadoOperacao>0</EstadoOperacao><Desc>OK</Desc></estadoExecucao>` +
    `</InvoicesResponse></soap:Body></soap:Envelope>`;

  it("fault extrai código e mensagem (truncada)", () => {
    const r = parseAtSoapResponse(faultXml);
    expect(r).toEqual({ kind: "fault", faultCode: "soap:Client", faultString: "Auth failed" });
  });

  it("resposta fatcorews lê CodigoResposta/Mensagem/DataOperacao", () => {
    const r = parseAtSoapResponse(fatcorewsXml);
    expect(r.kind).toBe("response");
    if (r.kind !== "response") return;
    expect(readFatcorewsResponse(r.body)).toEqual({
      codigoResposta: 0,
      mensagem: "OK",
      dataOperacao: "2026-09-06T00:00:00",
    });
  });

  it("resposta fatshare lê estadoExecucao", () => {
    const r = parseAtSoapResponse(fatshareXml);
    expect(r.kind).toBe("response");
    if (r.kind !== "response") return;
    expect(readFatshareResponse(r.body)).toEqual({ estadoOperacao: 0, desc: "OK" });
  });

  it("malformed: XML inválido, sem envelope e sem body", () => {
    expect(parseAtSoapResponse("not xml <")).toEqual({ kind: "malformed" });
    expect(
      parseAtSoapResponse(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"/>`),
    ).toEqual({ kind: "malformed" });
  });

  it("XXE: DOCTYPE/entities não executados", () => {
    const xxe =
      `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><R>&xxe;</R></soap:Body></soap:Envelope>`;
    const r = parseAtSoapResponse(xxe);
    // Ou malformed ou sem conteúdo de ficheiro — nunca o conteúdo.
    expect(JSON.stringify(r)).not.toContain("root:");
  });
});

describe("error mapping (sem detalhes internos)", () => {
  it("timeout, TLS, rede e desconhecido", () => {
    expect(normalizeTransportError(new Error("ETIMEDOUT"))).toBe("AT_TIMEOUT");
    expect(normalizeTransportError(new Error("socket hang up"))).toBe("AT_UNKNOWN");
    expect(normalizeTransportError(new Error("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))).toBe("AT_TLS_ERROR");
    expect(normalizeTransportError(new Error("ECONNREFUSED"))).toBe("AT_NETWORK_ERROR");
    expect(normalizeTransportError("weird")).toBe("AT_UNKNOWN");
  });
});

describe("sendAtSoap com post injetado (sem rede)", () => {
  const base = {
    url: "https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/",
    envelopeXml: "<e/>",
    tls: { certPem: "c", keyPem: "k" },
  };

  it("HTTP não-2xx => AT_HTTP_ERROR (não sucesso)", async () => {
    const r = await sendAtSoap(base, {
      httpPost: async () => ({ httpStatus: 500, bodyXml: "", durationMs: 1 }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("AT_HTTP_ERROR");
  });

  it("throw do post => erro normalizado, nunca throw", async () => {
    const r = await sendAtSoap(base, {
      httpPost: async () => {
        throw new Error("ETIMEDOUT");
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("AT_TIMEOUT");
  });

  it("200 propaga body para parsing pelo chamador", async () => {
    const r = await sendAtSoap(base, {
      httpPost: async () => ({ httpStatus: 200, bodyXml: "<ok/>", durationMs: 2 }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bodyXml).toBe("<ok/>");
      expect(typeof r.correlationId).toBe("string");
    }
  });
});

describe("gate D6 (tripwire)", () => {
  it("AT_TEST_ENABLED continua false: nenhuma chamada real sem ativação auditada", async () => {
    const { AT_TEST_ENABLED } = await import("../connectivity");
    expect(AT_TEST_ENABLED).toBe(false);
  }, 30_000);
});

describe("D8 gates (production lock)", () => {
  it("assertTestOnlyEnvironment: só TEST passa; resto falha closed", async () => {
    const { assertTestOnlyEnvironment } = await import("../endpoints");
    expect(() => assertTestOnlyEnvironment("TEST")).not.toThrow();
    expect(() => assertTestOnlyEnvironment("PRODUCTION")).toThrow("AT_PRODUCTION_DISABLED");
    expect(() => assertTestOnlyEnvironment("")).toThrow("AT_PRODUCTION_DISABLED");
    expect(() => assertTestOnlyEnvironment("staging")).toThrow("AT_PRODUCTION_DISABLED");
  });
});

describe("D9 no-submission guarantee", () => {
  it("envelope de teste nunca contém operações de escrita fiscal", async () => {
    const { buildInvoicesQueryEnvelope } = await import("../connectivity");
    const xml = buildInvoicesQueryEnvelope("123456789", { username: "u", password: "p" });
    for (const forbidden of [
      "RegisterInvoice",
      "ChangeInvoice",
      "DeleteInvoice",
      "RegisterWork",
      "RegisterPayment",
    ]) {
      expect(xml).not.toContain(forbidden);
    }
    expect(xml).toContain("<tns:InvoicesRequest>");
  });
});

describe("D7 gates (TEST/PROD separation)", () => {
  it("TEST nunca resolve portas de produção (:423/:425)", () => {
    for (const svc of ["fatcorews", "fatshare"] as const) {
      const ep = resolveAtEndpoint("TEST", svc);
      expect([723, 725]).toContain(ep.port);
      expect(ep.url).not.toMatch(/:42[35]\//);
    }
  });

  it("allowlist não contém produção sem flag; com flag continua explícita", () => {
    expect(() => resolveAtEndpoint("PRODUCTION", "fatcorews")).toThrow();
    const prod = resolveAtEndpoint("PRODUCTION", "fatcorews", { allowProduction: true });
    expect(prod.port).toBe(423);
    // connectivity nunca passa allowProduction: verificado por inspeção
    // (testATConnection chama resolveAtEndpoint("TEST", ...) sem flag).
  });

  it("envelope de consulta escapa NIF malicioso (sem injection)", async () => {
    const { buildInvoicesQueryEnvelope } = await import("../connectivity");
    const xml = buildInvoicesQueryEnvelope("123456789<>&\"'", {
      username: "u",
      password: "p",
    });
    expect(xml).not.toContain("<>&\"'");
    expect(xml).toContain("123456789&lt;&gt;&amp;&quot;&apos;");
    expect(xml).toContain("<tns:InvoicesRequest>");
  });
});

describe("D10 gate (sem rede sem ativação)", () => {
  it("testATConnection com gate desligado termina antes da rede", async () => {
    const { testATConnection, AT_TEST_ENABLED } = await import("../connectivity");
    expect(AT_TEST_ENABLED).toBe(false);
    const res = await testATConnection("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe("CONFIGURATION_ERROR");
    expect(res.detail).toBe("AT_TEST_DISABLED");
    expect(res.environment).toBe("TEST");
  });
});

describe("D11 production lock", () => {
  it("TEST path nunca alcança endpoint PROD (hosts/portas disjuntos)", () => {
    for (const svc of ["fatcorews", "fatshare"] as const) {
      const test = resolveAtEndpoint("TEST", svc);
      const prod = resolveAtEndpoint("PRODUCTION", svc, { allowProduction: true });
      expect(test.url).not.toBe(prod.url);
      expect(test.port).not.toBe(prod.port);
    }
  });
});
