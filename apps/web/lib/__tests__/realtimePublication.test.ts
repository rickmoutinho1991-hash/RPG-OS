/**
 * RPG-OS — Realtime publication (fail-closed).
 *
 * O Supabase Realtime broadcast de mudanças de tabelas para clientes
 * via WebSocket. Se uma tabela sensível (saúde, documentos, etc.) for
 * adicionada à publication `supabase_realtime`, qualquer cliente
 * autenticado pode subscrever e receber updates em tempo real de
 * dados sensíveis — mesmo que a API esteja bloqueada.
 *
 * Hoje só `comms_messages` está na publication (intencional: o
 * feature de mensagens precisa de real-time). Mas não há guarda
 * estática que impeça regressão: se alguém adicionar
 * `ALTER PUBLICATION supabase_realtime ADD TABLE public.health_connections`,
 * nenhum teste apanha.
 *
 * Invariantes (parse comment-aware das 67 migrations):
 *   (a) toda tabela na publication `supabase_realtime` está numa
 *       allowlist explícita;
 *   (b) nenhuma tabela sensível (saúde, documentos, pagamentos,
 *       reputação, etc.) está na publication.
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

// Extrair tabelas adicionadas à publication supabase_realtime.
const addTableRegex =
  /ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE\s+(?:public\.)?([a-zA-Z_][\w]*)/gi;
const realtimeTables = new Set<string>();
for (const m of flat.matchAll(addTableRegex)) {
  realtimeTables.add(m[1].toLowerCase());
}

// Tabelas sensíveis que NUNCA devem estar na publication.
const SENSITIVE_TABLE_PATTERNS = [
  /health/i,
  /document/i,
  /payment/i,
  /invoice/i,
  /quote/i,
  /contract/i,
  /reputation/i,
  /vault/i,
  /secret/i,
  /audit/i,
  /integrity/i,
  /ledger/i,
  /address/i,
  /profile/i,
  /user/i,
  /registration/i,
  /company/i,
  /project/i,
  /task/i,
  /material/i,
  /photo/i,
  /transport/i,
  /fiscal/i,
  /obligation/i,
  /action_plan/i,
  /workflow/i,
  /briefing/i,
  /memory/i,
  /ai_/,
  /session/i,
  /token/i,
  /credential/i,
];

describe("Realtime publication (Vaga M-G/L)", () => {
  it("toda tabela na publication supabase_realtime está na allowlist", () => {
    const REALTIME_ALLOWLIST = ["comms_messages"];
    const undeclared = [...realtimeTables].filter(
      (t) => !REALTIME_ALLOWLIST.includes(t),
    );
    expect(
      undeclared,
      "tabelas novas na publication supabase_realtime — adicionar à allowlist com justificação",
    ).toEqual([]);
  });

  it("nenhuma tabela sensível está na publication supabase_realtime", () => {
    const offenders = [...realtimeTables].filter((t) =>
      SENSITIVE_TABLE_PATTERNS.some((p) => p.test(t)),
    );
    expect(
      offenders,
      "tabelas sensíveis na publication supabase_realtime (broadcast de dados sensíveis para clientes)",
    ).toEqual([]);
  });
});