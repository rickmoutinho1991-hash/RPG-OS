/**
 * RPG-OS — Gera public/sw-version.json no pré-build do app web.
 * Só builtins de Node (sem deps novas). Cada build produz uma versão nova
 * que alimenta o Service Worker → cache "rpg-os-<v>".
 * Uso: node scripts/stamp-sw-version.mjs [outputPath]
 * (default: apps/web/public/sw-version.json)
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath =
  process.argv[2] ?? path.join(appRoot, "public", "sw-version.json");

function nowStamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function shortSha() {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = sha.trim();
    return trimmed.length > 0 ? trimmed : "local";
  } catch {
    return "local";
  }
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify({ v: `${nowStamp()}-${shortSha()}` }, null, 2)}\n`,
  "utf8",
);