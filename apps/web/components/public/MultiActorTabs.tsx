"use client";

import { useState } from "react";

const ACTORS: { id: string; label: string; bullets: string[] }[] = [
  {
    id: "pessoa",
    label: "Pessoa",
    bullets: [
      "O mesmo mercado, vários papéis — como cliente ou como prestador.",
      "A organização pessoal fica ligada ao trabalho, sem fricção.",
      "Cada pedido guarda histórico, garantia e documentos no mesmo sítio.",
    ],
  },
  {
    id: "independente",
    label: "Independente",
    bullets: [
      "Recebe propostas, contratos e pagamentos sem papelada manual.",
      "Apresenta-se com CV, seguro e referências já verificados.",
      "Entrega evidência de cada marco e é pago sem esperar pelo fim.",
    ],
  },
  {
    id: "empresa",
    label: "Empresa",
    bullets: [
      "Cada colaborador atua com permissões definidas pela organização.",
      "Encomendas e obras ficam visíveis para quem precisa de decidir.",
      "Faturação certificada e documentos fiscais gerados em cada passo.",
    ],
  },
  {
    id: "fornecedor",
    label: "Fornecedor",
    bullets: [
      "Entra no mercado com perfil público comparável e auditável.",
      "Acompanha pedidos aprovados sem receber contactos pessoais de borla.",
      "A garantia fica registada e acionável dentro do próprio processo.",
    ],
  },
];

export function MultiActorTabs() {
  const [active, setActive] = useState(0);
  const actor = ACTORS[active];

  return (
    <section aria-labelledby="actors-heading" className="card">
      <span className="badge" style={{ marginBottom: "8px" }}>
        Demonstração · dados fictícios
      </span>
      <h3 id="actors-heading" style={{ margin: "0 0 4px" }}>
        O mesmo mercado, vários papéis
      </h3>
      <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "13px" }}>
        Pessoa, independente, empresa ou fornecedor — cada um vê o mercado à sua
        medida.
      </p>

      <div role="tablist" aria-label="Papéis no mercado">
        {ACTORS.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="button secondary"
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              marginRight: "8px",
              marginBottom: "8px",
              background: i === active ? "#2563eb" : undefined,
              color: i === active ? "#fff" : undefined,
            }}
            onClick={() => setActive(i)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" style={{ marginTop: "12px" }}>
        {actor.bullets.map((b) => (
          <div
            key={b}
            style={{
              display: "flex",
              gap: "10px",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "6px",
            }}
          >
            <span aria-hidden="true" style={{ color: "#2563eb" }}>
              •
            </span>
            <span>{b}</span>
          </div>
        ))}
      </div>
    </section>
  );
}