/**
 * RPG-OS — Cobertura RLS por tabela (fail-closed por default).
 *
 * O footgun clássico do Supabase: `CREATE TABLE` nasce SEM Row Level Security,
 * logo a tabela fica legível por `anon`/`authenticated` via PostgREST até alguém
 * se lembrar de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Nada no typecheck
 * ou no build apanha isso.
 *
 * Esta guarda espelha o estado de RLS das 115 tabelas criadas nas migrations
 * (parsing comment-aware: comentários SQL são removidos antes da extração, senão
 * `-- ... (CREATE TABLE IF NOT EXISTS / DO BLOCK)` produz falsos positivos).
 *
 * Invariantes:
 *   (a) toda tabela `CREATE TABLE` tem `ENABLE ROW LEVEL SECURITY`;
 *   (b) nenhuma migration faz `DISABLE ROW LEVEL SECURITY`;
 *   (c) toda tabela com RLS enabled é criada nas nossas migrations (allowlist
 *       vazia — nada de RLS em tabelas fantasma);
 *   (d) tabelas com RLS mas ZERO policies (deny-all) estão numa allowlist
 *       documentada — apanha uma tabela nova silenciosamente inacessível;
 *   (e) nenhuma migration faz `GRANT ALL` em tabelas (nem `ON ALL TABLES`).
 *
 * Decisão documentada: NÃO aplicamos `FORCE ROW LEVEL SECURITY` — o app usa
 * `service_role` (admin client) extensivamente (ex.: downloads de storage,
 * upserts de perfil); FORCE bloquearia o próprio backend. O RLS protege
 * `anon`/`authenticated`, que é o que o browser alcança.
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
  .sort();

const sql = migrationFiles
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
  .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " "))
  .join("\n");

const matchAll = (re: RegExp): string[] =>
  [...sql.matchAll(re)].map((m) => m[1].toLowerCase());

const created = new Set(
  matchAll(
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi,
  ),
);
const rlsEnabled = new Set(
  matchAll(
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-zA-Z_][\w]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
  ),
);
const withPolicy = new Set(
  matchAll(
    /\bCREATE\s+POLICY\s+[^\n]*?\bON\s+(?:public\.)?"?([a-zA-Z_][\w]*)"?/gi,
  ),
);

// Tabelas com RLS mas sem qualquer policy = deny-all total para
// anon/authenticated. today: catálogos/items/ledgers servidos só via
// service_role (admin) no backend.
const DENY_ALL_ALLOWLIST = [
  "companies",
  "health_audit_integrity",
  "health_sync_history",
  "integrity_ledger",
  "invoice_items",
  "payments",
  "project_materials",
  "project_photos",
  "project_tasks",
  "quote_items",
  "transport_document_items",
];

const sorted = (s: Set<string>): string[] => [...s].sort();

describe("Cobertura RLS por tabela (Vaga M-G/G)", () => {
  it("toda tabela criada nas migrations tem RLS enabled", () => {
    const missing = sorted(created).filter((t) => !rlsEnabled.has(t));
    expect(
      missing,
      "tabelas criadas SEM ENABLE ROW LEVEL SECURITY (legíveis por anon via PostgREST)",
    ).toEqual([]);
    expect(created.size).toBeGreaterThan(100);
  });

  it("nenhuma migration desativa RLS", () => {
    const offenders = [...sql.matchAll(
      /\bALTER\s+TABLE\s+[^\n;]*?DISABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
    )].map((m) => m[0].replace(/\s+/g, " ").trim());
    expect(offenders).toEqual([]);
  });

  it("toda tabela com RLS enabled é criada nas nossas migrations", () => {
    // Allowlist vazia de propósito: RLS numa tabela que não criamos (auth.users,
    // storage.objects) seria gerida por outra equipa, não por nós.
    const ghosts = sorted(rlsEnabled).filter((t) => !created.has(t));
    expect(
      ghosts,
      "tabelas com RLS enabled que não são criadas nas nossas migrations",
    ).toEqual([]);
  });

  it("tabelas deny-all (RLS sem policies) estão na allowlist documentada", () => {
    const denyAll = sorted(created).filter(
      (t) => rlsEnabled.has(t) && !withPolicy.has(t),
    );
    const undeclared = denyAll.filter((t) => !DENY_ALL_ALLOWLIST.includes(t));
    expect(
      undeclared,
      "tabelas novas com RLS mas sem policy (deny-all silencioso) — adicionar à allowlist com justificação",
    ).toEqual([]);
  });

  it("nenhuma migration faz GRANT ALL em tabelas", () => {
    const offenders = [
      ...sql.matchAll(/\bGRANT\s+ALL\b[^\n;]*?\bON\b[^\n;]*\bTABLES?\b[^\n;]*/gi),
    ].map((m) => m[0].replace(/\s+/g, " ").trim());
    expect(offenders).toEqual([]);
  });
});