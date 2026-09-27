/**
 * RPG-OS — EXECUTE grants em funções SECURITY DEFINER (fail-closed).
 *
 * Uma função SECURITY DEFINER executa com os privilégios do DONO
 * (tipicamente `postgres`), que **bypassa RLS**. Se `anon` ou `public`
 * (que inclui `anon`) tem EXECUTE numa função SECURITY DEFINER, um
 * atacante pode chamá-la diretamente via PostgREST (`/rpc/<nome>`) e
 * executar SQL como owner — bypass total de RLS e acesso a dados RGPD.
 *
 * O hardening `20260929020000_rls_anon_execute_minimize.sql` revogou
 * EXECUTE de `anon`/`public` em 7 funções booleanas de autorização.
 * Mas não há guarda estática que impeça regressão: se alguém adicionar
 * `GRANT EXECUTE ... TO anon` numa função SECURITY DEFINER, nenhum
 * teste apanha.
 *
 * Invariantes (parse comment-aware, ordenado por migration):
 *   (a) nenhuma função SECURITY DEFINER tem EXECUTE líquido para `anon`;
 *   (b) nenhuma função SECURITY DEFINER tem EXECUTE líquido para `public`;
 *   (c) nenhuma função (qualquer) tem EXECUTE líquido para `public`
 *       sem estar numa allowlist explícita.
 *
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

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const sql = migrationFiles
  .map((f) => stripComments(readFileSync(path.join(migrationsDir, f), "utf8")))
  .join("\n");
const flat = sql.replace(/\s+/g, " ");

// Extrair nomes de funções SECURITY DEFINER (reutiliza lógica similar
// a securityDefiner.test.ts).
const definerFunctions: string[] = [];
const definerRegex = /security\s+definer/gi;
for (const m of flat.matchAll(definerRegex)) {
  const preceding = [...flat.matchAll(/function\s+(?:[a-zA-Z_][\w]*\.)?([a-zA-Z_][\w]*)\s*\(/gi)]
    .filter((d) => d.index < m.index);
  const name = preceding.length > 0 ? preceding[preceding.length - 1][1].toLowerCase() : null;
  if (name && !definerFunctions.includes(name)) definerFunctions.push(name);
}

// Processar GRANT/REVOKE EXECUTE em ordem, computando o efeito líquido.
const grantRevokeRegex =
  /(GRANT|REVOKE)\s+EXECUTE\s+ON\s+FUNCTION\s+(?:[a-zA-Z_][\w]*\.)?([a-zA-Z_][\w]*)\s*\([^)]*\)\s+(?:TO|FROM)\s+([a-zA-Z_][\w, ]*)/gi;

const netGrants = new Map<string, Set<string>>();

for (const m of flat.matchAll(grantRevokeRegex)) {
  const action = m[1].toUpperCase();
  const funcName = m[2].toLowerCase();
  const roles = m[3].toLowerCase().split(",").map((r) => r.trim());
  if (!netGrants.has(funcName)) netGrants.set(funcName, new Set());
  const current = netGrants.get(funcName)!;
  for (const role of roles) {
    if (action === "GRANT") current.add(role);
    else if (action === "REVOKE") current.delete(role);
  }
}

const hasNetGrant = (funcName: string, role: string): boolean => {
  const roles = netGrants.get(funcName.toLowerCase());
  return roles ? roles.has(role) : false;
};

describe("EXECUTE grants em funções SECURITY DEFINER (Vaga M-G/K)", () => {
  it("nenhuma função SECURITY DEFINER tem EXECUTE líquido para anon", () => {
    const offenders = definerFunctions.filter((name) => hasNetGrant(name, "anon"));
    expect(
      offenders,
      "funções SECURITY DEFINER com EXECUTE para anon (bypass RLS via /rpc/)",
    ).toEqual([]);
  });

  it("nenhuma função SECURITY DEFINER tem EXECUTE líquido para public", () => {
    const offenders = definerFunctions.filter((name) => hasNetGrant(name, "public"));
    expect(
      offenders,
      "funções SECURITY DEFINER com EXECUTE para public (inclui anon)",
    ).toEqual([]);
  });

  it("nenhuma função (qualquer) tem EXECUTE líquido para public sem allowlist", () => {
    const PUBLIC_EXECUTE_ALLOWLIST = [
      "is_comms_member",
      "is_org_member",
      "is_same_company",
      "is_same_project",
      "service_request_is_for_client",
      "service_quote_is_for_provider",
      "has_org_permission",
      "reputation_in_tenant",
    ];
    const allFunctions = [...netGrants.keys()];
    const offenders = allFunctions.filter(
      (name) => hasNetGrant(name, "public") && !PUBLIC_EXECUTE_ALLOWLIST.includes(name),
    );
    expect(offenders).toEqual([]);
  });
});