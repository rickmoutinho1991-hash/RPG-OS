/**
 * RPG-OS — Revisão RLS estática (Vaga M-G/V).
 * Impede regressões de políticas irrestritas em dados pessoais:
 *   (a) qualquer USING (true) em SELECT p/ authenticated/anon em tabela
 *       não-catálogo tem de ser removida por uma migration posterior (DROP);
 *   (b) nenhuma policy concede a `anon` fora dos catálogos públicos com filtro
 *       (categories, provider_offerings);
 *   (c) addresses_authenticated_read (P1, RGPD) tem DROP + REVOKE efectivos.
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");

// `[^;]*?` impede o prefixo lazy de atravessar o fim da policy (;)
const USING_TRUE_RE =
  /CREATE POLICY\s+"?([a-zA-Z0-9_]+)"?\s+ON\s+(?:"?public"?\.)?([a-zA-Z0-9_]+)\s+[^;]*?USING\s*\(\s*true\s*\)/gi;
const TO_ANON_RE =
  /CREATE POLICY\s+"?([a-zA-Z0-9_]+)"?\s+ON\s+(?:"?public"?\.)?([a-zA-Z0-9_]+)\s+[^;]*?TO\s+(anon)/gi;
const DROP_POLICY_RE =
  /DROP POLICY (?:IF EXISTS )?"?([a-zA-Z0-9_]+)"?\s+ON\s+public\.([a-zA-Z0-9_]+)/gi;

const RBAC_CATALOG = new Set(["roles", "permissions", "role_permissions"]);
const PUBLIC_CATALOG = new Set(["categories", "provider_offerings"]);

describe("RLS — políticas por tabela (Vaga M-G/V)", () => {
  it("USING (true) fora de catálogos RBAC tem de estar dropped por migration", () => {
    const dropped = new Set(
      [...migrations.matchAll(DROP_POLICY_RE)].map((m) => `${m[2]}.${m[1]}`),
    );
    const stillOpen: string[] = [];
    for (const m of migrations.matchAll(USING_TRUE_RE)) {
      const key = `${m[2]}.${m[1]}`;
      if (!RBAC_CATALOG.has(m[2]) && !dropped.has(key)) stillOpen.push(key);
    }
    expect(stillOpen).toEqual([]);
  });

  it("nenhuma policy concede a `anon` fora dos catálogos públicos com filtro", () => {
    const offenders: string[] = [];
    for (const m of migrations.matchAll(TO_ANON_RE)) {
      const table = m[2];
      if (!PUBLIC_CATALOG.has(table)) offenders.push(`${table}.${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("addresses_authenticated_read (P1, RGPD) é dropada e revogada", () => {
    expect(
      /DROP POLICY IF EXISTS "addresses_authenticated_read" ON public\.addresses/i.test(
        migrations,
      ),
    ).toBe(true);
    expect(
      /REVOKE ALL ON TABLE public\.addresses FROM anon, authenticated/i.test(
        migrations,
      ),
    ).toBe(true);
  });
});