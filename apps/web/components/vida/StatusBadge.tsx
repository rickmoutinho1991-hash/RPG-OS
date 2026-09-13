import type { LifeItemStatus } from "@rpg/core";

/**
 * Estado honesto de cada domínio: label + ícone + texto.
 * Nunca apenas cor (acessibilidade).
 */
const STATUS_META: Record<
  LifeItemStatus | "ERROR",
  { icon: string; label: string }
> = {
  LIVE: { icon: "●", label: "Ligado" },
  PREPARED_ONLY: { icon: "◐", label: "Preparado para ligação" },
  MANUAL: { icon: "○", label: "Consulta manual" },
  UNAVAILABLE: { icon: "○", label: "Indisponível" },
  ERROR: { icon: "!", label: "Temporariamente indisponível" },
};

export function StatusBadge({ state }: { state: LifeItemStatus | "ERROR" }) {
  const meta = STATUS_META[state] ?? STATUS_META.UNAVAILABLE;
  return (
    <span
      className="tag-badge"
      aria-label={`Estado: ${meta.label}`}
      title={meta.label}
    >
      <span aria-hidden="true">{meta.icon}</span> {meta.label}
    </span>
  );
}
