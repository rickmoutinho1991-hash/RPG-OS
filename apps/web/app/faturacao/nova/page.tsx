"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInvoiceAction } from "../actions";
import { PORTUGAL_VAT_RATES } from "@rpg/core";

export default function NovaFaturaPage() {
  const router = useRouter();
  const [invoiceType, setInvoiceType] = useState<"FT" | "FS" | "FR" | "NC">(
    "FT",
  );
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    {
      description: "Prestação de serviços de construção civil / remodelação",
      unit: "vg",
      quantity: 1,
      unitPrice: 1250.0,
      vatRate: 23,
    },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems([
      ...items,
      {
        description: "",
        unit: "un",
        quantity: 1,
        unitPrice: 0,
        vatRate: 23,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: any) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const taxAmount = items.reduce(
    (s, it) => s + it.quantity * it.unitPrice * (it.vatRate / 100),
    0,
  );
  const total = subtotal + taxAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientEmail || items.length === 0) {
      setError(
        "Por favor indique o email do cliente e as linhas do documento.",
      );
      return;
    }

    setIsPending(true);
    setError(null);

    const res = await createInvoiceAction({
      clientEmail,
      invoiceType,
      items,
      notes,
    });

    if (!res.success) {
      setError(res.error || "Erro ao emitir fatura.");
      setIsPending(false);
    } else {
      router.push(`/faturacao/${res.id}`);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Emissão de Documento Comercial / Fatura</h2>
          <p>
            Comunicação e validação em conformidade com as regras da Autoridade
            Tributária.
          </p>
        </div>
        <Link href="/faturacao" className="button secondary">
          ← Voltar à Faturação
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3>Dados do Documento Fiscal</h3>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="invoiceType">Tipo de Documento *</label>
              <select
                id="invoiceType"
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as any)}
              >
                <option value="FT">FT — Fatura</option>
                <option value="FS">FS — Fatura Simplificada</option>
                <option value="FR">FR — Fatura-Recibo</option>
                <option value="NC">NC — Nota de Crédito</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="client_email">
                Email do Cliente Adquirente *
              </label>
              <input
                id="client_email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                required
                placeholder="cliente@exemplo.pt"
              />
            </div>

            <div className="form-field full">
              <label htmlFor="notes">Observações no Documento</label>
              <input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Pagamento por transferência bancária a 30 dias."
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>Linhas do Documento ({items.length})</h3>
            <button
              type="button"
              onClick={addItem}
              className="button secondary"
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              + Adicionar Linha
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: "260px" }}>
                    Descrição do Serviço / Artigo
                  </th>
                  <th>Unid.</th>
                  <th style={{ width: "90px" }}>Qtd.</th>
                  <th style={{ width: "110px" }}>Preço Un. (€)</th>
                  <th style={{ width: "90px" }}>IVA (%)</th>
                  <th>Total Líquido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const net = it.quantity * it.unitPrice;
                  return (
                    <tr key={idx}>
                      <td>
                        <input
                          value={it.description}
                          onChange={(e) =>
                            updateItem(idx, "description", e.target.value)
                          }
                          placeholder="Descrição do item faturado..."
                          style={{
                            width: "100%",
                            padding: "6px",
                            fontSize: "13px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                          required
                        />
                      </td>
                      <td>
                        <input
                          value={it.unit}
                          onChange={(e) =>
                            updateItem(idx, "unit", e.target.value)
                          }
                          style={{
                            width: "50px",
                            padding: "6px",
                            fontSize: "13px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "quantity",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          style={{
                            width: "70px",
                            padding: "6px",
                            fontSize: "13px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "unitPrice",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          style={{
                            width: "90px",
                            padding: "6px",
                            fontSize: "13px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        />
                      </td>
                      <td>
                        <select
                          value={it.vatRate}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "vatRate",
                              parseInt(e.target.value, 10),
                            )
                          }
                          style={{
                            padding: "6px",
                            fontSize: "12px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        >
                          {PORTUGAL_VAT_RATES.CONTINENT.map((v) => (
                            <option key={v.code} value={v.percentage}>
                              {v.percentage}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <strong>€{net.toFixed(2)}</strong>
                      </td>
                      <td>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "#b91c1c",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "24px",
            }}
          >
            <div
              style={{
                width: "320px",
                background: "#f8fafc",
                padding: "18px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "13px",
                }}
              >
                <span>Subtotal Incidência:</span>
                <strong>€{subtotal.toFixed(2)}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                  fontSize: "13px",
                }}
              >
                <span>Total IVA Liquidado:</span>
                <strong>€{taxAmount.toFixed(2)}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "18px",
                  borderTop: "2px solid #cbd5e1",
                  paddingTop: "10px",
                }}
              >
                <span>Total a Pagar:</span>
                <strong style={{ color: "#0f172a" }}>
                  €{total.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: "24px" }}>
          <Link href="/faturacao" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={isPending}>
            {isPending
              ? "A comunicar e emitir..."
              : "Emitir Fatura & Comunicar AT"}
          </button>
        </div>
      </form>
    </>
  );
}
