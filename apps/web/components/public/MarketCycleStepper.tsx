"use client";

import { useState } from "react";
import {
  demoProposalSteps,
  demoComparison,
} from "@/lib/demo/marketplaceStory";
import { FactLine } from "./FactBadge";

export function MarketCycleStepper() {
  const [active, setActive] = useState(0);
  const step = demoProposalSteps[active];

  return (
    <section aria-labelledby="cycle-heading" className="card">
      <span className="badge" style={{ marginBottom: "8px" }}>
        Demonstração · dados fictícios
      </span>
      <h3 id="cycle-heading" style={{ margin: "0 0 4px" }}>
        Do pedido à garantia
      </h3>
      <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "13px" }}>
        O ciclo completo de um pedido no mercado — acompanhado passo a passo.
      </p>

      <div
        role="tablist"
        aria-label="Passos do ciclo"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: "4px",
          overflowX: "auto",
        }}
      >
        {demoProposalSteps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls="cycle-panel"
            className="button secondary"
            style={{
              padding: "8px 4px",
              fontSize: "11px",
              lineHeight: 1.2,
              background: i === active ? "var(--accent, #2563eb)" : undefined,
              color: i === active ? "#fff" : undefined,
            }}
            onClick={() => setActive(i)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div
        id="cycle-panel"
        role="tabpanel"
        style={{
          marginTop: "16px",
          borderLeft: "3px solid var(--border)",
          paddingLeft: "12px",
        }}
      >
        <div style={{ fontSize: "14px", lineHeight: 1.6 }}>
          {step.short}
        </div>
        <p style={{ fontSize: "13px", lineHeight: 1.6, margin: "8px 0 0" }}>
          {step.explanation}
        </p>
      </div>

      {step.id === "comparacao" && (
        <div
          style={{
            marginTop: "16px",
            display: "grid",
            gap: "12px",
          }}
        >
          {demoComparison.map((p, i) => (
            <div key={p.proposalId}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "13px",
                  marginBottom: "6px",
                }}
              >
                Proposta {i + 1}
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {p.facts.map((f) => (
                  <FactLine key={f} kind="FACT">
                    {f}
                  </FactLine>
                ))}
                {p.inference.map((f) => (
                  <FactLine key={f} kind="INFERENCIA">
                    {f}
                  </FactLine>
                ))}
                {p.recommendation.map((f) => (
                  <FactLine key={f} kind="RECOMENDACAO">
                    {f}
                  </FactLine>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}