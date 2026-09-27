/**
 * RPG-OS — Revisão RLS de storage estática (espelho da Vaga M-G/V).
 * `rlsPolicies.test.ts` cobre `public.*`; este ficheiro estende a guarda ao
 * schema `storage`, onde o endurecimento vive só em migrações (M-G/I
 * `documents` privado; M-G/P owner-only nos buckets sem policy):
 *   (a) nenhuma policy "Public Access for *" sobrevive em efeito líquido;
 *   (b) toda policy de storage.objects não-dropada é owner-only
 *       (`owner_id = auth.uid()`);
 *   (c) bucket `documents` é privado e nunca volta a `public = true`;
 *   (d) o ÚNICO bucket que pode ficar público por desenho é `project-photos`
 *       (fotos de obras/imóveis para o marketplace);
 *   (e) as 4 políticas `documents_owner_*` (criadas via execute) escopam a
 *       `owner_id = auth.uid()`.
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

// `\b` impede casar `storage.objects_*`; corpo não-greedy até ao primeiro `;`.
const CREATE_STORAGE_RE =
  /CREATE POLICY\s+"?([a-zA-Z0-9_ ]+)"?\s+ON\s+storage\.objects\b([\s\S]*?);/gi;
const DROP_STORAGE_RE =
  /DROP POLICY (?:IF EXISTS )?"?([a-zA-Z0-9_ ]+)"?\s+ON\s+storage\.objects\b/gi;

const BUCKET_INSERT_RE =
  /INSERT INTO storage\.buckets[\s\S]*?VALUES\s*\(\s*'([a-zA-Z0-9_-]+)',\s*'([a-zA-Z0-9_-]+)',\s*(true|false)/gi;
const BUCKET_PRIVATE_FLIP_RE =
  /update\s+storage\.buckets\s+set\s+public\s*=\s*false[^;]*where\s+id\s*=\s*'([a-zA-Z0-9_-]+)'/gi;

const ALLOWED_PUBLIC_BUCKET = "project-photos";

describe("Storage RLS — buckets e policies (espelho M-G/V)", () => {
  it("nenhuma policy 'Public Access for *' sobrevive em efeito líquido", () => {
    const dropped = new Set(
      [...migrations.matchAll(DROP_STORAGE_RE)].map((m) => m[1]),
    );
    const survivors: string[] = [];
    for (const m of migrations.matchAll(CREATE_STORAGE_RE)) {
      const name = m[1];
      if (name.includes("Public Access") && !dropped.has(name)) {
        survivors.push(name);
      }
    }
    expect(survivors).toEqual([]);
  });

  it("toda policy de storage.objects não-dropada é owner-only", () => {
    const dropped = new Set(
      [...migrations.matchAll(DROP_STORAGE_RE)].map((m) => m[1]),
    );
    const offenders: string[] = [];
    for (const m of migrations.matchAll(CREATE_STORAGE_RE)) {
      const [name, body] = [m[1], m[2]];
      if (dropped.has(name)) continue;
      if (!/owner_id\s*=\s*auth\.uid\(\)/.test(body)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("bucket `documents` é privado e nunca volta a público", () => {
    const flipped = [...migrations.matchAll(BUCKET_PRIVATE_FLIP_RE)].map(
      (m) => m[1],
    );
    expect(flipped).toContain("documents");
    expect(
      /update\s+storage\.buckets[^;]*set\s+public\s*=\s*true[^;]*where\s+id\s*=\s*'documents'/i.test(
        migrations,
      ),
    ).toBe(false);
  });

  it("`project-photos` é o único bucket que pode ficar público", () => {
    const created: Map<string, boolean> = new Map();
    for (const m of migrations.matchAll(BUCKET_INSERT_RE)) {
      created.set(m[1], m[3] === "true");
    }
    const flippedPrivate = new Set(
      [...migrations.matchAll(BUCKET_PRIVATE_FLIP_RE)].map((m) => m[1]),
    );
    for (const [bucket, publicAtBirth] of created) {
      const privateInNet =
        publicAtBirth === false || flippedPrivate.has(bucket);
      if (!privateInNet) {
        expect(bucket).toBe(ALLOWED_PUBLIC_BUCKET);
      }
    }
  });

  it("policies `documents_owner_*` (via execute) escopam a owner_id = auth.uid()", () => {
    const doBlock =
      /do \$\$[\s\S]*?execute 'create policy documents_owner_select[\s\S]*?end \$\$;/i.exec(
        migrations,
      )?.[0] ?? "";
    expect(doBlock).not.toBe("");
    for (const name of [
      "documents_owner_select",
      "documents_owner_insert",
      "documents_owner_update",
      "documents_owner_delete",
    ]) {
      expect(doBlock).toContain(name);
    }
    expect(/owner_id\s*=\s*auth\.uid\(\)/.test(doBlock)).toBe(true);
  });
});