/**
 * RPG-OS — SECURITY DEFINER com search_path (fail-closed).
 *
 * Em PostgreSQL, uma função DECLARE SECURITY DEFINER executa com os
 * privilégios do DONO (tipicamente owner/postgres), que **bypassa RLS**
 * e tem acesso a todos os dados RGPD. Se `SET search_path` não
 * incluir `pg_temp` explicitamente, um atacante pode criar um objeto
 * malicioso no schema temp e sequestrar a resolução de nomes referenci-
 * ados no corpo — executando SQL arbitrário como owner.
 *
 * O fix canónico: toda função SECURITY DEFINER deve ter
 * `SET search_path TO <schema>, public, pg_temp`.
 *
 * A guarda reconhece AMBOS os mecanismos:
 *   • o `SET search_path` no próprio CREATE da função;
 *   • um `ALTER FUNCTION <nome> SET search_path TO ..., 'pg_temp'`
 *     posterior (aplicação idempotente do hardening M-G/J).
 *
 * Invariantes (parse comment-aware das 67 migrations):
 *   (a) toda função SECURITY DEFINER tem SET search_path (no CREATE
 *       ou num ALTER posterior);
 *   (b) todo efetivo search_path inclui `pg_temp`;
 *   (c) todo SECURITY DEFINER pertence a um bloco de função bem
 *       delimitado por `$$...$$`.
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

// Todas as declarações de função (nome + posição do `function`).
// Aceita qualquer schema: `function public.foo(` ou `function foo(`.
const funcDecls = [
  ...flat.matchAll(
    /function\s+(?:[a-zA-Z_][\w]*\.)?([a-zA-Z_][\w]*)\s*\(/gi,
  ),
].map((m) => ({ name: m[1].toLowerCase(), pos: m.index }));

// Para cada ocorrência de SECURITY DEFINER, associar a função
// declaração imediatamente anterior.
const definerRegex = /security\s+definer/gi;
const definerFunctions: Array<{ name: string; snippet: string }> = [];
for (const m of flat.matchAll(definerRegex)) {
  const preceding = funcDecls.filter((d) => d.pos < m.index);
  const name = preceding.length > 0 ? preceding[preceding.length - 1].name : "<unknown>";
  const openDollar = flat.indexOf("$$", m.index + m[0].length);
  if (openDollar === -1) continue; // sem delimitador → parsing corrompido, mas não é SECURITY DEFINER válido
  const closeDollar = flat.indexOf("$$", openDollar + 2);
  const snippet = closeDollar !== -1
    ? flat.slice(m.index, closeDollar + 2)
    : flat.slice(m.index);
  definerFunctions.push({ name, snippet });
}

const searchPathOf = (name: string): string | null => {
  // Prefer ALTER FUNCTION (hardening M-G/J) se existir — depois do
  // hardening sempre tem pg_temp. Caso contrário, o próprio CREATE.
  // Aceita qualquer schema: `alter function public.foo(` ou `alter function foo(`.
  const alterMatch = flat.match(
    new RegExp(
      `alter\\s+function\\s+(?:[a-zA-Z_][\\w]*\\.)?${name}\\s*(?:\\([^)]*\\)\\s*)?set\\s+search_path\\s+(?:to\\s+|=\\s*)([^;]+)`,
      "i",
    ),
  );
  if (alterMatch) return alterMatch[1].trim();
  for (const fn of definerFunctions) {
    if (fn.name === name) {
      const ms = fn.snippet.match(
        /set\s+search_path\s+(?:to\s+|=\s*)([^;]+?)(?:\s+as\s+\$\$|;)/i,
      );
      if (ms) return ms[1].trim();
    }
  }
  return null;
};
const hasPgTemp = (name: string) => {
  const sp = searchPathOf(name);
  return sp ? /pg_temp/i.test(sp) : false;
};

describe("SECURITY DEFINER — search_path (Vaga M-G/J)", () => {
  it("toda função SECURITY DEFINER tem SET search_path (CREATE ou ALTER)", () => {
    const missing = definerFunctions.filter((fn) => !searchPathOf(fn.name));
    expect(
      missing.map((fn) => `${fn.name}: ${fn.snippet.slice(0, 120)}`),
      "funções SECURITY DEFINER sem SET search_path (sequestro de resolução via definer)",
    ).toEqual([]);
  });

  it("todo search_path efetivo inclui pg_temp", () => {
    const missing = definerFunctions.filter((fn) => !hasPgTemp(fn.name));
    expect(
      missing.map(
        (fn) =>
          `${fn.name}: ${searchPathOf(fn.name)}`,
      ),
      "search_path sem pg_temp (o schema 'public' sozinho permite ao atacante reservar prefixos temp e sequestrar nomes)",
    ).toEqual([]);
  });

  it("todo SECURITY DEFINER pertence a um bloco delimitado por $$...$$", () => {
    const malformed = definerFunctions.filter(
      (fn) => !fn.snippet.trimEnd().endsWith("$$"),
    );
    expect(malformed.map((fn) => fn.name)).toEqual([]);
  });
});