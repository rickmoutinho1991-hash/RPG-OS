"use client";

import { useState } from "react";
import { REVENUE_PLANS } from "@rpg/core";
import type { SessionContext } from "@rpg/core";

interface PlanosClientProps {
  planos: readonly ("FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE")[];
  ctx: SessionContext | null;
}

export function PlanosClient({ planos, ctx }: PlanosClientProps) {
  const [intervalo, setIntervalo] = useState<"MONTH" | "ANNUAL">("MONTH");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {planos.map((id) => {
        const plan = REVENUE_PLANS[id];
        const isPopular = id === "PRO";
        const annualPrice =
          plan.monthlyPriceCents > 0
            ? Math.round(
                plan.monthlyPriceCents * 12 * (10000 - plan.annualDiscountBps) / 10000,
              )
            : 0;

        return (
          <div
            key={id}
            className="card rounded-lg p-6 hover:border-primary/50 transition-colors"
            style={{
              border: isPopular ? "2px solid #1890ff" : "1px solid var(--border)",
            }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-xs font-medium opacity-60">
                {plan.label}
                {plan.id === "ENTERPRISE" ? " (orçamento personalizado)" : ""}
              </span>
              <span className="text-xs font-medium opacity-60">
                {intervalo === "ANNUAL" ? "anual" : "mensal"}
              </span>
            </div>

            <h3 className="text-xl font-bold mb-2">
              {plan.label}
            </h3>

            <p className="text-3xl font-bold mb-1">
              {intervalo === "ANNUAL"
                ? annualPrice
                : plan.monthlyPriceCents}
              {plan.monthlyPriceCents > 0 ? " €/mês" : " Grátis"}
            </p>

            <p className="text-sm text-muted mb-3">
              {plan.platformFeeBps / 100}%
            </p>

<ul className="space-y-1 text-sm text-muted">
              <li>{plan.description}</li>
              <li>Máx. {plan.limits.maxUsers} utilizadores</li>
              <li>
                {plan.limits.maxCompanies > 0
                  ? `Até ${plan.limits.maxCompanies} empresas`
                  : "Ilimitado"}
                {" "}
                empresas
              </li>
              <li>Máx. {plan.limits.maxProjects} projetos</li>
              <li>Máx. {plan.limits.maxStorageMb} MB de armazenamento</li>
              <li>Máx. {plan.limits.maxAutomations} automações</li>
            </ul>

            {plan.id !== "ENTERPRISE" && (
              <button
                className="mt-2 button"
                style={{ width: "100%", fontSize: "13px", padding: "10px" }}
              >
                Saiba mais
              </button>
            )}

            {true && (
              <button
                className="button secondary mt-2"
                style={{ width: "100%", fontSize: "13px", padding: "10px" }}
              >
                Editar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}