/**
 * RPG-OS — Modo de espaço (vaga M-C).
 *
 * Espaço único pessoal + trabalho: a navegação é sempre a mesma (tudo a que o
 * utilizador tem acesso por RBAC/área), mas o comutador Pessoal/Trabalho
 * reordena os grupos para realçar o contexto ativo. Nunca esconde módulos.
 */

export type SpaceMode = "pessoal" | "trabalho";

export const MODE_PERSONAL: SpaceMode = "pessoal";
export const MODE_WORK: SpaceMode = "trabalho";
export const DEFAULT_MODE: SpaceMode = MODE_PERSONAL;
export const MODE_COOKIE = "rpgos_mode";

/** Grupos de natureza exclusivamente laboral (destacados no modo Trabalho). */
export const WORK_GROUP_LABELS = [
  "Operações",
  "Negócio",
  "Finanças",
  "Administração",
] as const;

const WORK_LABELS = new Set<string>(WORK_GROUP_LABELS);

/** Classifica um grupo de navegação como pessoal ou de trabalho. */
export function classifyGroupLabel(label: string): SpaceMode {
  return WORK_LABELS.has(label) ? MODE_WORK : MODE_PERSONAL;
}

/**
 * Reordena grupos pelo modo ativo: no modo pessoal os grupos pessoais vêm
 * primeiro (e vice-versa). Preserva sempre TODOS os grupos — o espaço é único.
 */
export function orderGroupsForMode<G extends { label: string }>(
  groups: G[],
  mode: SpaceMode,
): G[] {
  const personalFirst = mode !== MODE_WORK;
  const rank = (label: string): number => {
    const personal = classifyGroupLabel(label) === MODE_PERSONAL;
    return personal ? (personalFirst ? 0 : 1) : personalFirst ? 1 : 0;
  };
  return [...groups].sort((a, b) => rank(a.label) - rank(b.label));
}