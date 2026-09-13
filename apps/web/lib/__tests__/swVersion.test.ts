/**
 * RPG-OS — Contrato do Service Worker auto-versionado (D1).
 * (a) sw.js: /sw-version.json lido com no-store e excluído do cache.
 * (b) scripts/stamp-sw-version.mjs: gera JSON válido com a chave "v".
 * Sem rede, sem fakes — apenas leitura de ficheiros e execução local do script.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const swSource = readFileSync(path.join(webRoot, "public", "sw.js"), "utf8");

describe("sw.js (auto-version)", () => {
  it("lê /sw-version.json com no-store e tem fallback constante", () => {
    expect(swSource).toContain(
      'fetch("/sw-version.json", { cache: "no-store" })',
    );
    expect(swSource).toContain("FALLBACK_CACHE_VERSION");
    expect(swSource).toContain('data.v === "string"');
  });

  it("fetch handler exclui /sw-version.json do cache", () => {
    expect(swSource).toContain("isVersionFile");
    expect(swSource).toMatch(/isVersionFile\(url\)\) return;/);
  });
});

describe("stamp-sw-version.mjs", () => {
  it("gera JSON válido com chave v (timestamp-shortsha)", () => {
    const out = path.join(tmpdir(), `sw-version-${Date.now()}.json`);
    try {
      execFileSync(
        process.execPath,
        [path.join(webRoot, "scripts", "stamp-sw-version.mjs"), out],
        { cwd: webRoot, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`stamp falhou: ${detail}`);
    }
    try {
      const parsed = JSON.parse(readFileSync(out, "utf8"));
      expect(Object.keys(parsed)).toEqual(["v"]);
      expect(typeof parsed.v).toBe("string");
      expect(parsed.v).toMatch(/^\d{14}-(local|[0-9a-f]{7,})$/);
    } finally {
      rmSync(out, { force: true });
    }
  });
});