/**
 * RPG-OS — Error disclosure (fail-closed).
 *
 * Retornar `error.message` diretamente ao cliente em respostas de API
 * pode vazar detalhes internos: erros SQL (tabelas, colunas), stack
 * traces, caminhos de ficheiro, versões de bibliotecas. Um atacante
 * usa estes detalhes para mapear o schema e direcionar exploits.
 *
 * A prática segura: retornar mensagem genérica ao cliente
 * ("Erro ao processar pedido") e fazer log do erro completo
 * server-side (console.error / audit log).
 *
 * Invariantes (parse das 54 rotas de API):
 *   (a) nenhuma rota retorna `error.message` / `err.message` /
 *       `error.stack` diretamente na resposta JSON;
 *   (b) nenhuma rota retorna `NextResponse.json({ error: error.message })`
 *       ou padrão similar.
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
const apiDir = path.join(repoRoot, "apps", "web", "app", "api");

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, out);
    } else if (entry.endsWith(".ts") && entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = walkTs(apiDir);

// Padrões que indicam error disclosure:
//   error.message, err.message, error.stack, err.stack
// usados em respostas (NextResponse.json, return, etc.)
const ERROR_DISCLOSURE_RE =
  /(?:error|err)\.(?:message|stack)\b/g;

// Padrões que indicam uso em log server-side (aceitável):
//   console.error, console.warn, logger.error, auditLog
const SERVER_SIDE_LOG_RE =
  /console\.(?:error|warn|log)|logger\.|auditLog|logError/;

describe("Error disclosure em rotas de API (Vaga M-G/N)", () => {
  it("nenhuma rota retorna error.message/err.message diretamente ao cliente", () => {
    const offenders: Array<{ file: string; line: number; snippet: string }> = [];
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      const lines = source.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ERROR_DISCLOSURE_RE.test(line)) {
          // Verificar se é server-side log (aceitável) ou resposta ao cliente
          const isServerSide = SERVER_SIDE_LOG_RE.test(line);
          const isResponse =
            line.includes("NextResponse.json") ||
            line.includes("return") ||
            line.includes("response") ||
            line.includes("res.");
          if (!isServerSide && isResponse) {
            offenders.push({
              file: path.relative(repoRoot, file),
              line: i + 1,
              snippet: line.trim().slice(0, 120),
            });
          }
        }
      }
    }
    expect(
      offenders,
      "rotas que retornam error.message/err.message ao cliente (vazamento de detalhes internos)",
    ).toEqual([]);
  });

  it("nenhuma rota retorna NextResponse.json({ error: error.message })", () => {
    const offenders: Array<{ file: string; line: number }> = [];
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      const lines = source.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes("NextResponse.json") &&
          /error\s*:\s*(error|err)\.message/.test(line)
        ) {
          offenders.push({ file: path.relative(repoRoot, file), line: i + 1 });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});