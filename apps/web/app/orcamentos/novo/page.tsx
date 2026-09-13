"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createQuoteAction } from "../actions";
import { MEASUREMENT_UNITS, PORTUGAL_VAT_RATES } from "@rpg/core";

interface LineItemState {
  description: string;
  itemType: "LABOR" | "MATERIAL" | "EQUIPMENT" | "SERVICE" | "OTHER";
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountPercentage: number;
}

export default function NovoOrcamentoPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemState[]>([
    {
      description: "Mão-de-obra de trolha e assentamento",
      itemType: "LABOR",
      unit: "h",
      quantity: 40,
      unitPrice: 22.5,
      vatRate: 23,
      discountPercentage: 0,
    },
    {
      description: "Fornecimento de materiais de alvenaria e cimento",
      itemType: "MATERIAL",
      unit: "un",
      quantity: 1,
      unitPrice: 650.0,
      vatRate: 23,
      discountPercentage: 0,
    },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems([
      ...items,
      {
        description: "",
        itemType: "SERVICE",
        unit: "un",
        quantity: 1,
        unitPrice: 0,
        vatRate: 23,
        discountPercentage: 0,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItemState, value: any) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  // Cálculos em tempo real
  const subtotal = items.reduce((sum, item) => {
    const base = item.quantity * item.unitPrice;
    const desc = base * ((item.discountPercentage || 0) / 100);
    return sum + (base - desc);
  }, 0);

  const totalVat = items.reduce((sum, item) => {
    const base = item.quantity * item.unitPrice;
    const desc = base * ((item.discountPercentage || 0) / 100);
    const net = base - desc;
    return sum + net * ((item.vatRate || 0) / 100);
  }, 0);

  const total = subtotal + totalVat;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !clientEmail || items.length === 0) {
      setError(
        "Por favor preencha o título, o email do cliente e as linhas da proposta.",
      );
      return;
    }

    setIsPending(true);
    setError(null);

    const res = await createQuoteAction({
      title,
      clientEmail,
      notes,
      items,
    });

    if (!res.success) {
      setError(res.error || "Erro ao criar proposta.");
      setIsPending(false);
    } else {
      router.push(`/orcamentos/${res.id}`);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Novo Orçamento / Proposta Comercial</h2>
          <p>
            Elaboração estruturada com cálculo discriminado de IVA e unidades de
            construção.
          </p>
        </div>
        <Link href="/orcamentos" className="button secondary">
          ← Voltar aos Orçamentos
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3>Identificação do Orçamento</h3>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="title">Título da Proposta *</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ex: Proposta de Pintura & Isolamento Térmico — Apartamento T3"
              />
            </div>

            <div className="form-field">
              <label htmlFor="client_email">Email do Cliente *</label>
              <input
                id="client_email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                required
                placeholder="cliente@exemplo.pt"
              />
            </div>

            <div className="form-field">
              <label htmlFor="notes">Condições Particulares / Notas</label>
              <input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Inclui andaimes e limpeza final da obra."
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
            <h3 style={{ margin: 0 }}>Linhas do Orçamento ({items.length})</h3>
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
                  <th style={{ minWidth: "220px" }}>
                    Descrição do Trabalho / Material
                  </th>
                  <th>Tipo</th>
                  <th>Unid.</th>
                  <th style={{ width: "90px" }}>Qtd.</th>
                  <th style={{ width: "110px" }}>Preço Un. (€)</th>
                  <th style={{ width: "90px" }}>IVA (%)</th>
                  <th>Subtotal</th>
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
                          placeholder="Descrição da atividade..."
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
                        <select
                          value={it.itemType}
                          onChange={(e) =>
                            updateItem(idx, "itemType", e.target.value)
                          }
                          style={{
                            padding: "6px",
                            fontSize: "12px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        >
                          <option value="LABOR">Mão-de-obra</option>
                          <option value="MATERIAL">Material</option>
                          <option value="EQUIPMENT">Equipamento</option>
                          <option value="SERVICE">Serviço</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={it.unit}
                          onChange={(e) =>
                            updateItem(idx, "unit", e.target.value)
                          }
                          style={{
                            padding: "6px",
                            fontSize: "12px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                          }}
                        >
                          {MEASUREMENT_UNITS.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.code} ({u.name})
                            </option>
                          ))}
                        </select>
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
                              {v.percentage}% ({v.code})
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
                <span>Subtotal s/ IVA:</span>
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
                <span>Total IVA:</span>
                <strong>€{totalVat.toFixed(2)}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "17px",
                  borderTop: "2px solid #cbd5e1",
                  paddingTop: "10px",
                }}
              >
                <span>Total Proposta:</span>
                <strong style={{ color: "#0f172a" }}>
                  €{total.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: "24px" }}>
          <Link href="/orcamentos" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={isPending}>
            {isPending ? "A gerar proposta..." : "Guardar & Emitir Orçamento"}
          </button>
        </div>
      </form>
    </>
  );
}
