/**
 * RPG-OS — Espelho real dos security headers (fronteira web).
 *
 * Versão anterior deste ficheiro testava uma cópia hardcoded dos headers
 * (duplicava o CSP literal dentro do próprio teste) — passava mesmo que os
 * headers fossem apagados do middleware.ts. Esta versão lê o source real do
 * middleware e verifica os invariantes diretamente:
 *   (a) os 5 security headers obrigatórios são efetivamente setados;
 *   (b) as directives críticas do CSP estão presentes no source;
 *   (c) as ligações externas necessárias (Supabase/Stripe/AT) continuam
 *       permitidas no `connect-src`.
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const middlewareSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "middleware.ts",
  ),
  "utf8",
);

const REQUIRED_HEADERS: Array<[string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Content-Security-Policy", "csp"],
];

const CSP_CRITICAL_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
];

describe("Fronteira web — middleware.ts (espelho real)", () => {
  it("seta os 5 security headers obrigatórios no source do middleware", () => {
    for (const [header, value] of REQUIRED_HEADERS) {
      const setCall = `response.headers.set('${header}', '${value}'`;
      const setVarCall = `response.headers.set('${header}', csp)`;
      const headerSet =
        middlewareSource.includes(setCall) ||
        middlewareSource.includes(setVarCall);
      expect(headerSet, `header ${header} deve ser setado no middleware.ts`)
        .toBe(true);
    }
  });

  it("CSP contém as directives críticas (anti-clickjacking/plugin/base)", () => {
    for (const directive of CSP_CRITICAL_DIRECTIVES) {
      expect(
        middlewareSource.includes(`"${directive}"`) ||
          middlewareSource.includes(`'${directive}'`),
        `directive ${directive} deve constar na CSP do middleware.ts`,
      ).toBe(true);
    }
  });

  it("CSP permite as ligações externas necessárias (Supabase/Stripe/AT)", () => {
    const requiredConnects = [
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.stripe.com",
      "https://api.portaldasfinancas.gov.pt",
    ];
    for (const conn of requiredConnects) {
      expect(
        middlewareSource.includes(conn),
        `connect-src deve permitir ${conn}`,
      ).toBe(true);
    }
  });
});