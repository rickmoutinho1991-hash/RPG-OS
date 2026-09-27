/**
 * RPG-OS — Cookie security (fail-closed).
 *
 * Cookies devem ter:
 *   • `secure: true` em produção — impede envio por HTTP não cifrado
 *     (interceptação/MITM);
 *   • `sameSite` — mitiga CSRF (lax ou strict);
 *   • `path` — restringe o escopo do cookie.
 *
 * Invariantes (parse de todas as cookieSettings no app):
 *   (a) toda cookieSetting tem `secure` (condicional em produção);
 *   (b) toda cookieSetting tem `sameSite`;
 *   (c) toda cookieSetting tem `path`.
 *
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, out);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const appFiles = walkTs(path.join(repoRoot, "apps", "web")).filter(
  (f) => !f.includes("__tests__") && !f.endsWith(".test.ts"),
);

// Extrai blocos cookieStore.set("...", "...", { ... }) ou cookies().set("...", "...", { ... })
const COOKIE_SET_RE =
  /(?:cookieStore|cookies\(\))\.set\s*\(\s*[^,]+,\s*[^,]+,\s*\{([^}]*)\}/g;

interface CookieConfig {
  file: string;
  line: number;
  config: string;
}

const cookieConfigs: CookieConfig[] = [];
for (const file of appFiles) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  for (const m of source.matchAll(COOKIE_SET_RE)) {
    // encontrar a linha aproximada
    const idx = source.indexOf(m[0]);
    const line = source.slice(0, idx).split(/\r?\n/).length;
    cookieConfigs.push({
      file: path.relative(repoRoot, file),
      line,
      config: m[1],
    });
  }
}

describe("Cookie security (Vaga M-G/O)", () => {
  it("toda cookieSetting tem `secure` (condicional em produção)", () => {
    const offenders = cookieConfigs.filter(
      (c) => !/secure\s*:/.test(c.config),
    );
    expect(
      offenders.map((c) => `${c.file}:${c.line}`),
      "cookies sem flag `secure` (envio por HTTP não cifrado em produção)",
    ).toEqual([]);
  });

  it("toda cookieSetting tem `sameSite`", () => {
    const offenders = cookieConfigs.filter(
      (c) => !/sameSite\s*:/.test(c.config),
    );
    expect(
      offenders.map((c) => `${c.file}:${c.line}`),
      "cookies sem flag `sameSite` (vulneráveis a CSRF)",
    ).toEqual([]);
  });

  it("toda cookieSetting tem `path`", () => {
    const offenders = cookieConfigs.filter((c) => !/path\s*:/.test(c.config));
    expect(
      offenders.map((c) => `${c.file}:${c.line}`),
      "cookies sem flag `path` (escopo não restrito)",
    ).toEqual([]);
  });

  it("encontrou pelo menos uma cookieSetting para guardar", () => {
    expect(cookieConfigs.length).toBeGreaterThan(0);
  });
});