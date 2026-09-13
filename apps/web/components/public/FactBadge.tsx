import type { ReactNode } from "react";

const KIND_STYLE: Record<
  "FACT" | "INFERENCIA" | "RECOMENDACAO",
  { bg: string; label: string }
> = {
  FACT: { bg: "#dcfce7", label: "Facto" },
  INFERENCIA: { bg: "#fef9c3", label: "Inferência" },
  RECOMENDACAO: { bg: "#dbeafe", label: "Recomendação" },
};

export function FactBadge({
  kind,
}: {
  kind: "FACT" | "INFERENCIA" | "RECOMENDACAO";
}) {
  const s = KIND_STYLE[kind];
  return (
    <span
      className="badge"
      style={{ background: s.bg, fontSize: "10px", fontWeight: 700 }}
    >
      {s.label}
    </span>
  );
}

/** Separação explícita entre o que é certo e o que é provável (§38). */
export function FactLine({
  kind,
  children,
}: {
  kind: "FACT" | "INFERENCIA" | "RECOMENDACAO";
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <FactBadge kind={kind} />
      <span style={{ fontSize: "12.5px", lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
