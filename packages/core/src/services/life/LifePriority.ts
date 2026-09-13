/**
 * RPG-OS — Life Priority (A Minha Vida)
 *
 * Ordenação determinística de LifeItems. Sem IA, sem dados inventados.
 *
 * Ordem:
 *  1. overdue (dueDate < today)
 *  2. due date próxima (menor dueDate primeiro)
 *  3. high priority
 *  4. actionability (itens com ação real primeiro; "none" por último)
 *  5. source confidence (verified > manual > prepared_only > unavailable)
 */
import type { LifeAction, LifeCapabilityConfidence, LifeItem, LifePriority } from "../../types/vida";

const PRIORITY_RANK: Record<LifePriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

const CONFIDENCE_RANK: Record<LifeCapabilityConfidence, number> = {
  verified: 0,
  manual: 1,
  prepared_only: 2,
  unavailable: 3,
};

function actionabilityRank(action: LifeAction): number {
  // "none" é o menos acionável; restantes têm peso igual (ação real disponível).
  return action === "none" ? 1 : 0;
}

function dateKey(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value.slice(0, 10);
}

export function isOverdue(item: LifeItem, today = dateKey(new Date())): boolean {
  if (!item.dueDate) return false;
  return dateKey(item.dueDate) < today;
}

export interface SortLifeItemsOptions {
  today?: string;
  limit?: number;
}

/**
 * Ordena LifeItems de forma determinística. Nunca inventa itens.
 * Empates resolvidos por id (estabilidade total).
 */
export function sortLifeItems(items: LifeItem[], options: SortLifeItemsOptions = {}): LifeItem[] {
  const today = options.today ? dateKey(options.today) : dateKey(new Date());
  const sorted = [...items].sort((a, b) => {
    const aOver = a.dueDate && dateKey(a.dueDate) < today ? 0 : 1;
    const bOver = b.dueDate && dateKey(b.dueDate) < today ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;

    const aDue = a.dueDate ? dateKey(a.dueDate) : "9999-12-31";
    const bDue = b.dueDate ? dateKey(b.dueDate) : "9999-12-31";
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;

    const pa = PRIORITY_RANK[a.priority] ?? 3;
    const pb = PRIORITY_RANK[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;

    const aa = actionabilityRank(a.action);
    const ab = actionabilityRank(b.action);
    if (aa !== ab) return aa - ab;

    const ca = CONFIDENCE_RANK[a.capabilityConfidence] ?? 3;
    const cb = CONFIDENCE_RANK[b.capabilityConfidence] ?? 3;
    if (ca !== cb) return ca - cb;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return typeof options.limit === "number" ? sorted.slice(0, options.limit) : sorted;
}

/** Top-N itens que merecem atenção (primeiros da ordenação determinística). */
export function selectAttentionItems(items: LifeItem[], limit = 3, today?: string): LifeItem[] {
  return sortLifeItems(items, { limit, today });
}
