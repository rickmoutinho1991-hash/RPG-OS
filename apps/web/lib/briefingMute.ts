/**
 * RPG-OS — Briefing × memória: toggle das categorias silenciadas.
 * Funções puras (sem rede): a persistência é feita pela rota /api/memories,
 * o estado com Cuenta na UI vem do GET. Nenhuma query aqui.
 */

/**
 * Adiciona/remove `target` da lista de categorias silenciadas, preservando as
 * restantes. Devolve sempre uma nova lista (imutável).
 */
export function toggleMutedCategory(
  categories: string[],
  target: string,
): string[] {
  return categories.includes(target)
    ? categories.filter((c) => c !== target)
    : [...categories, target];
}

export const CATEGORY_LABELS: Record<string, string> = {
  finance: "💶 Finanças",
  obras: "🔨 Obras",
  fiscal: "🧾 Fiscal",
  saude: "💊 Saúde",
  aprovacoes: "⏳ Aprovações",
  docs: "📄 Documentos",
  tarefas: "✓ Tarefas",
  agenda: "📅 Agenda",
  notificacoes: "🔔 Notificações",
} as const;

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Agrupa itens do briefing por categoria, preservando a ordem relativa. */
export function groupByCategory<T extends { category: string }>(
  items: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const existing = groups.get(item.category) ?? [];
    existing.push(item);
    groups.set(item.category, existing);
  }
  return groups;
}

/** Indica se a categoria faz parte do universo silenciável (6 domínios). */
export const MUTABLE_CATEGORIES = [
  "finance",
  "obras",
  "fiscal",
  "saude",
  "aprovacoes",
  "docs",
] as const;

export function isMutableCategory(category: string): boolean {
  return (MUTABLE_CATEGORIES as readonly string[]).includes(category);
}