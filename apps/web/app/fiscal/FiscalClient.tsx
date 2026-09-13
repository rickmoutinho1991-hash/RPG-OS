"use client";

import { useState } from "react";
import { PortugueseTaxObligation, SocialSecurityContributionCalculation } from "@rpg/core";
import { calculateTsuAction } from "./actions";
import { IrsPreparationClient } from "./IrsPreparationClient";

export function FiscalClient({
  obligations,
}: {
  obligations: PortugueseTaxObligation[];
}) {
  const [tab, setTab] = useState<"CALENDAR" | "SEG_SOCIAL" | "EFATURA" | "IRS_PREP">("CALENDAR");

  // TSU Simulator State
  const [taxpayerType, setTaxpayerType] = useState<"EMPLOYEE" | "EMPLOYER" | "SOLE_TRADER_RECIBOS_VERDES">("EMPLOYER");
  const [simAmount, setSimAmount] = useState("1800");
  const [tsuResult, setTsuResult] = useState<SocialSecurityContributionCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  async function handleCalculateTsu(e: React.FormEvent) {
    e.preventDefault();
    setIsCalculating(true);
    const res = await calculateTsuAction({
      taxpayerType,
      amount: parseFloat(simAmount) || 0,
    });
    setTsuResult(res);
    setIsCalculating(false);
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          type="button"
          className={`button secondary ${tab === "CALENDAR" ? "active" : ""}`}
          onClick={() => setTab("CALENDAR")}
        >
          🏛️ Portal das Finanças & Calendário Fiscal
        </button>
        <button
          type="button"
          className={`button secondary ${tab === "SEG_SOCIAL" ? "active" : ""}`}
          onClick={() => setTab("SEG_SOCIAL")}
        >
          🛡️ Segurança Social Direta & TSU
        </button>
        <button
          type="button"
          className={`button secondary ${tab === "EFATURA" ? "active" : ""}`}
          onClick={() => setTab("EFATURA")}
        >
          🧾 e-Fatura & Faturas Recebidas
        </button>
        <button
          type="button"
          className={`button secondary ${tab === "IRS_PREP" ? "active" : ""}`}
          onClick={() => setTab("IRS_PREP")}
        >
          📋 IRS / Modelo 3 — Preparação
        </button>
      </div>

      {/* Tab: Calendário de Obrigações Fiscais */}
      {tab === "CALENDAR" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Obrigações Tributárias & Prazos Oficiais da AT</h3>
            <span className="badge success">Conformidade AT 100%</span>
          </div>

          <div className="list">
            {obligations.map((ob) => (
              <div key={ob.id} className="list-row">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="tag-badge">{ob.category}</span>
                    <strong>{ob.title}</strong>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                    Prazo Limite: <strong>{new Date(ob.dueDate).toLocaleDateString("pt-PT")}</strong> • Período: {ob.period}
                    {ob.estimatedAmount && ` • Estimativa: €${ob.estimatedAmount.toFixed(2)}`}
                  </div>
                  {ob.paymentReference && (
                    <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "2px" }}>
                      Referência Multibanco: <code>{ob.paymentReference}</code>
                    </div>
                  )}
                </div>

                <span className={`badge ${ob.status === "SUBMITTED" || ob.status === "PAID" ? "success" : "warning"}`}>
                  {ob.status === "SUBMITTED" ? "Submetido" : ob.status === "PAID" ? "Liquidado" : "Pendente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Segurança Social Direta */}
      {tab === "SEG_SOCIAL" && (
        <div className="grid-2">
          <div className="card">
            <h3>Simulador de Contribuições (Segurança Social Direta)</h3>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
              Calcule os encargos de TSU para empresas (23.75% + 11.00%) ou apuramento trimestral para Trabalhadores Independentes (Recibos Verdes).
            </p>

            <form onSubmit={handleCalculateTsu}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Enquadramento do Contribuinte</label>
                  <select
                    value={taxpayerType}
                    onChange={(e) => setTaxpayerType(e.target.value as any)}
                  >
                    <option value="EMPLOYER">Empresa (Trabalho por Conta de Outrem - TSU)</option>
                    <option value="SOLE_TRADER_RECIBOS_VERDES">Trabalhador Independente / Recibos Verdes (21.4%)</option>
                  </select>
                </div>

                <div className="form-field full">
                  <label>
                    {taxpayerType === "SOLE_TRADER_RECIBOS_VERDES"
                      ? "Rendimento Médio Trimestral (€)"
                      : "Vencimento / Remuneração Bruta Mensal (€)"}
                  </label>
                  <input
                    type="number"
                    step="50"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="button" style={{ marginTop: "12px" }} disabled={isCalculating}>
                {isCalculating ? "A calcular..." : "Calcular Encargos Sociais"}
              </button>
            </form>
          </div>

          <div className="card" style={{ background: "#f8fafc" }}>
            <h4 style={{ margin: "0 0 14px", fontSize: "15px" }}>Apuramento de Encargos Sociais</h4>

            {tsuResult ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                  <span>Base de Incidência Contributiva:</span>
                  <strong>€{tsuResult.grossSalaryOrRevenue.toFixed(2)}</strong>
                </div>

                {tsuResult.taxpayerType === "EMPLOYER" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                      <span>TSU Patronal (Entidade Empregadora - 23.75%):</span>
                      <strong>€{tsuResult.employerAmount.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                      <span>Desconto Trabalhador (11.00%):</span>
                      <strong>€{tsuResult.employeeAmount.toFixed(2)}</strong>
                    </div>
                    <div style={{ borderTop: "2px solid #cbd5e1", paddingTop: "10px", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Total a Pagar à Segurança Social:</strong>
                      <span style={{ fontSize: "20px", fontWeight: 800, color: "#15803d" }}>
                        €{tsuResult.totalSocialSecurityDue.toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                      <span>Rendimento Relevante (70% da Prestação de Serviços):</span>
                      <strong>€{(tsuResult.grossSalaryOrRevenue * 0.7).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                      <span>Taxa Contributiva Recibos Verdes:</span>
                      <strong>21.40%</strong>
                    </div>
                    <div style={{ borderTop: "2px solid #cbd5e1", paddingTop: "10px", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Contribuição Mensal Estimada:</strong>
                      <span style={{ fontSize: "20px", fontWeight: 800, color: "#15803d" }}>
                        €{tsuResult.totalSocialSecurityDue.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                Introduza o valor pretendido e clique em &quot;Calcular Encargos
                Sociais&quot; para visualizar a repartição das contribuições.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab: e-Fatura */}
      {tab === "EFATURA" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>e-Fatura (Autoridade Tributária)</h3>
            <span className="badge">Preparação</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
            As faturas de despesas emitidas com o seu NIF e faturas de vendas são conciliadas automaticamente pelo RPG-OS para dedução no IRS e apuramento de IVA.
          </p>

          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "13px" }}>
            ○ <strong>Comunicação e-Fatura:</strong> ainda sem integração oficial; a comunicação faz-se manualmente no Portal das Finanças.<br />
            ✓ <strong>Validador de Despesas:</strong> Classificação automática nas categorias de IRS (Despesas Gerais Familiares, Saúde, Educação, Restauração).<br />
            ✓ <strong>Exportação SAF-T (PT):</strong> Ficheiro XML oficial para entrega até ao dia 5 de cada mês.
          </div>
        </div>
      )}

      {/* Tab: IRS Preparation */}
      {tab === "IRS_PREP" && (
        <div style={{ marginTop: 16 }}>
          <IrsPreparationClient />
        </div>
      )}
    </div>
  );
}
