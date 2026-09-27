/**
 * RPG-OS — Varredura de segredos no repositório (fix P0: seed admin com
 * password em plaintext). Impede regressões:
 *   (a) migrations/seed não embutem password inline em crypt();
 *   (b) migrations/seed não contêm JWTs tipo service-role hard-coded;
 *   (c) *.env.example nunca tem valores reais nas variáveis secretas.
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
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({
    name: f,
    content: readFileSync(path.join(migrationsDir, f), "utf8"),
  }));

const seedSql = readFileSync(path.join(repoRoot, "supabase", "seed.sql"), "utf8");
const envExample = readFileSync(
  path.join(repoRoot, "apps", "web", ".env.example"),
  "utf8",
);

const SQL_INLINE_PASSWORD = /crypt\(\s*['"][^'"]+['"]\s*,/;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./;
const SECRET_ENV_KEY = /^([A-Z][A-Z0-9_]*(?:SECRET|KEY|PASSWORD|TOKEN)[A-Z0-9_]*)=(.*)$/;
const LEAKED_VALUE = /whsec_|sk_(live|test)|hunter2|\d{10,}|[A-Za-z0-9+/]{40,}|rrtm14403874/;

describe("repositório — segredos (P0 seed admin)", () => {
  it("nenhuma migration embute password em crypt() inline", () => {
    const offenders = migrationFiles
      .filter(({ name, content }) => SQL_INLINE_PASSWORD.test(content))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("migrations não contêm JWTs type service-role hard-coded", () => {
    const offenders = migrationFiles
      .filter(({ name, content }) => JWT_LIKE.test(content))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("seed.sql não contém JWTs nem passwords inline", () => {
    expect(JWT_LIKE.test(seedSql)).toBe(false);
    expect(SQL_INLINE_PASSWORD.test(seedSql)).toBe(false);
  });

  it(".env.example só tem placeholders nas variáveis secretas", () => {
    const leaked: string[] = [];
    for (const line of envExample.split("\n")) {
      const m = line.match(SECRET_ENV_KEY);
      if (m && LEAKED_VALUE.test(m[2])) leaked.push(line.trim());
    }
    expect(leaked).toEqual([]);
  });
});