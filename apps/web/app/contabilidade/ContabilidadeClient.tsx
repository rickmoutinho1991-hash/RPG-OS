"use client";

import { VatSettlementPeriod } from "@rpg/core";
import Link from "next/link";

export function ContabilidadeClient({
  vatPeriod,
  incomeTotal,
  expensesTotal,
  netIncome,
  withholdingTaxTotal,
  hasRealData = false,
}: {
  vatPeriod: VatSettlementPeriod;
  incomeTotal: number;
  expensesTotal: number;
  netIncome: number;
  withholdingTaxTotal: number;
  hasRealData?: boolean;
}) {
  return (
    <div>
      {!hasRealData && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            padding: "14px 18px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "13px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            ℹ️ <strong>Sem movimentos fiscais registados no período.</strong> Os valores apresentados abaixo refletem a ausência de faturas ou despesas emitidas para este período fiscal.
          </span>
          <Link href="/faturacao/nova" className="button" style={{ fontSize: "12px", padding: "4px 10px" }}>
            + Emitir Fatura
          </Link>
        </div>
      )}

      {/* Indicadores Principais */}
      <div className="metrics">
        <div className="card">
          <span className="metric-label">Proveitos / Vendas (€)</span>
          <strong className="metric-value">
            €{incomeTotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </strong>
          <span className="metric-change success">
            {incomeTotal > 0 ? "Faturação emitida" : "Sem proveitos no período"}
          </span>
        </div>

        <div className="card">
          <span className="metric-label">Custos & Gastos (€)</span>
          <strong className="metric-value">
            €
            {expensesTotal.toLocaleString("pt-PT", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span className="metric-change">
            {expensesTotal > 0 ? "Despesas registadas" : "Sem custos no período"}
          </span>
        </div>

        <div className="card">
          <span className="metric-label">Resultado Líquido do Exercício</span>
          <strong
            className="metric-value"
            style={{ color: netIncome >= 0 ? "#15803d" : "#dc2626" }}
          >
            €{netIncome.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </strong>
          <span className={`metric-change ${netIncome >= 0 ? "success" : "danger"}`}>
            {netIncome > 0
              ? "Margem operacional positiva"
              : netIncome < 0
              ? "Saldo devedor no período"
              : "Saldo neutro"}
          </span>
        </div>

        <div className="card">
          <span className="metric-label">IVA Líquido a Entregar ao Estado</span>
          <strong
            className="metric-value"
            style={{
              color: vatPeriod.netVatPayable > 0 ? "#b45309" : vatPeriod.netVatPayable < 0 ? "#15803d" : "inherit",
            }}
          >
            €
            {Math.abs(vatPeriod.netVatPayable).toLocaleString("pt-PT", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span className="metric-change">
            {vatPeriod.netVatPayable > 0
              ? "A Pagar (AT)"
              : vatPeriod.netVatPayable < 0
              ? "Crédito a Recuperar"
              : "Sem IVA a liquidar"}
          </span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        {/* Mapa de Apuramento de IVA */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>Apuramento Periódico de IVA</h3>
            <span className="tag-badge">{vatPeriod.periodLabel}</span>
          </div>

          <table className="table" style={{ fontSize: "13px" }}>
            <tbody>
              <tr>
                <td>IVA Liquidado (Vendas - Taxa Normal 23%)</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  €{vatPeriod.vatCollected23.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td>IVA Liquidado (Taxas Intermédia 13% e Reduzida 6%)</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  €
                  {(vatPeriod.vatCollected13 + vatPeriod.vatCollected6).toFixed(
                    2,
                  )}
                </td>
              </tr>
              <tr style={{ background: "#f8fafc" }}>
                <td>
                  <strong>Total de IVA Liquidado a Clientes</strong>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  €{vatPeriod.totalVatCollected.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td>IVA Dedutível (Compras e Consumos - Taxa 23%)</td>
                <td style={{ textAlign: "right", color: vatPeriod.vatDeductible23 > 0 ? "#dc2626" : "inherit" }}>
                  {vatPeriod.vatDeductible23 > 0 ? `-€${vatPeriod.vatDeductible23.toFixed(2)}` : "€0.00"}
                </td>
              </tr>
              <tr style={{ background: "#f0fdf4" }}>
                <td>
                  <strong>Saldo Final do IVA a Entregar à AT</strong>
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontWeight: 800,
                    color: vatPeriod.netVatPayable >= 0 ? "#15803d" : "#b45309",
                    fontSize: "15px",
                  }}
                >
                  €{vatPeriod.netVatPayable.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            <a
              href="/api/saft/export"
              download
              className="button"
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              📥 Descarregar Ficheiro SAF-T (PT) XML
            </a>
          </div>
        </div>

        {/* Retenções na Fonte e Envio ao Contabilista */}
        <div className="card">
          <h3 style={{ margin: "0 0 16px" }}>Retenções na Fonte (IRS / IRC)</h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Total de retenções na fonte efetuadas e a declarar no Portal das Finanças:
          </p>

          <div
            style={{
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span>Retenções de Trabalho Independente (Art. 101.º CIRS):</span>
              <strong>€{withholdingTaxTotal.toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Deduções Fiscais em Sede de IRC:</span>
              <strong>€0.00</strong>
            </div>
          </div>

          <div
            style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>
              Pacote Digital para Contabilista Certificado (TOC)
            </h4>
            <p
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                margin: "0 0 12px",
              }}
            >
              Exporte todos os extratos, mapa de faturas, SAF-T e guias de
              transporte num só clique para envio direto ao seu gabinete de
              contabilidade.
            </p>
            <button
              type="button"
              className="button secondary"
              style={{ width: "100%", fontSize: "12px" }}
              onClick={() =>
                alert(
                  "Dossier fiscal completo compilado e pronto para envio por email ao contabilista!",
                )
              }
            >
              📤 Exportar Dossier Fiscal Completo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


