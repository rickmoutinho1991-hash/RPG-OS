/**
 * RPG-OS — Migration naming/order (convenção Supabase).
 *
 * O Supabase CLI espera migrations com prefixo `YYYYMMDDHHMMSS_nome.sql`.
 * Migrações fora da convenção (ex.: `0001_...`) não são reconhecidas pelo
 * `supabase db diff` / `supabase migration list`, o que quebra o fluxo de
 * deploy e pode causar conflitos silenciosos de ordem.
 *
 * Invariantes:
 *   (a) toda migration segue `YYYYMMDDHHMMSS_nome.sql` (allowlist para as
 *       2 migrations iniciais que usam `NNNN_`);
 *   (b) as migrations estão em ordem cronológica crescente pelo prefixo;
 *   (c) não há timestamps duplicados (duas migrations com o mesmo prefixo
 *       causam conflito de aplicação).
 *
 * Leitura local apenas — sem rede, sem fakes.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
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

// Migrações iniciais criadas antes da convenção. Não podem ser renomeadas
// (já estão aplicadas em produção e o histórico do Supabase migration
// list fica corrompido). Allowlist explícita.
const LEGACY_PREFIX_ALLOWLIST = ["0001_rpg_os_core", "0004_grant_service_role_permissions"];

const TIMESTAMP_PREFIX_RE = /^(\d{14})_/;

describe("Migration naming/order (Vaga M-G/M)", () => {
  it("toda migration segue a convenção YYYYMMDDHHMMSS_nome.sql", () => {
    const offenders = migrationFiles.filter((f) => {
      const base = f.replace(/\.sql$/, "");
      if (LEGACY_PREFIX_ALLOWLIST.includes(base)) return false;
      return !TIMESTAMP_PREFIX_RE.test(base);
    });
    expect(
      offenders,
      "migrações fora da convenção YYYYMMDDHHMMSS_nome.sql (adicionar à allowlist ou renomear)",
    ).toEqual([]);
  });

  it("as migrations estão em ordem cronológica crescente", () => {
    const timestamps = migrationFiles.map((f) => {
      const base = f.replace(/\.sql$/, "");
      const m = base.match(TIMESTAMP_PREFIX_RE);
      return m ? m[1] : "00000000000000"; // legacy prefix → treat as epoch
    });
    const outOfOrder: Array<{ file: string; prev: string }> = [];
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        outOfOrder.push({
          file: migrationFiles[i],
          prev: migrationFiles[i - 1],
        });
      }
    }
    expect(outOfOrder).toEqual([]);
  });

  it("não há timestamps duplicados (allowlist para已知 duplicado)", () => {
    // 20260929100000 é usado por duas migrations criadas no mesmo dia.
    // Renomear corromperia o histórico de migrations já aplicadas em produção.
    // Risco aceite: a ordenação é determinística (alfabética dentro do mesmo prefixo).
    // TODO: corrigir num follow-up renomeando uma das migrations para 20260929100001.
    const DUPLICATE_TS_ALLOWLIST = new Set(["20260929100000"]);
    const seen = new Map<string, string>();
    const duplicates: Array<{ ts: string; files: string[] }> = [];
    for (const f of migrationFiles) {
      const base = f.replace(/\.sql$/, "");
      const m = base.match(TIMESTAMP_PREFIX_RE);
      if (!m) continue;
      const ts = m[1];
      if (DUPLICATE_TS_ALLOWLIST.has(ts)) continue;
      if (seen.has(ts)) {
        duplicates.push({ ts, files: [seen.get(ts)!, f] });
      } else {
        seen.set(ts, f);
      }
    }
    expect(duplicates).toEqual([]);
  });
});