"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTransportDocumentAction } from "../actions";
import { MEASUREMENT_UNITS } from "@rpg/core";

export default function NovaGuiaTransportePage() {
  const router = useRouter();
  const [docType, setDocType] = useState<"GT" | "GR" | "GD" | "GA">("GT");
  const [clientName, setClientName] = useState("");
  const [clientTaxNumber, setClientTaxNumber] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("00-AA-00");
  const [loadAddress, setLoadAddress] = useState(
    "Armazém Central — Rua da Indústria n.º 10",
  );
  const [loadPostalCode, setLoadPostalCode] = useState("1000-001");
  const [loadCity, setLoadCity] = useState("Lisboa");
  const [loadDateTime, setLoadDateTime] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [unloadAddress, setUnloadAddress] = useState("");
  const [unloadPostalCode, setUnloadPostalCode] = useState("4000-001");
  const [unloadCity, setUnloadCity] = useState("Porto");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState([
    {
      description: "Paletes de cimento e argamassa técnica",
      quantity: 2,
      unit: "ton",
    },
    {
      description: "Tubagens PVC e acessórios de saneamento",
      quantity: 50,
      unit: "ml",
    },
  ]);

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unit: "un" }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: any) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !clientName ||
      !clientTaxNumber ||
      !unloadAddress ||
      items.length === 0
    ) {
      setError(
        "Por favor preencha o destinatário, o NIF, a morada de descarga e os bens a transportar.",
      );
      return;
    }

    setIsPending(true);
    setError(null);

    const res = await createTransportDocumentAction({
      documentType: docType,
      clientName,
      clientTaxNumber,
      vehiclePlate,
      loadAddress,
      loadPostalCode,
      loadCity,
      loadDateTime: new Date(loadDateTime).toISOString(),
      unloadAddress,
      unloadPostalCode,
      unloadCity,
      notes,
      items,
    });

    if (!res.success) {
      setError(res.error || "Erro ao emitir guia de transporte.");
      setIsPending(false);
    } else {
      router.push("/guias");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Nova Guia de Transporte / Remessa</h2>
          <p>
            Comunicação em tempo real de bens em circulação à Autoridade
            Tributária com geração de código AT.
          </p>
        </div>
        <Link href="/guias" className="button secondary">
          ← Voltar às Guias
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3>Identificação do Transporte & Viatura</h3>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="docType">Tipo de Documento *</label>
              <select
                id="docType"
                value={docType}
                onChange={(e) => setDocType(e.target.value as any)}
              >
                <option value="GT">GT — Guia de Transporte</option>
                <option value="GR">GR — Guia de Remessa</option>
                <option value="GD">GD — Guia de Devolução</option>
                <option value="GA">GA — Movimentação de Ativos Próprios</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="vehiclePlate">
                Matrícula da Viatura de Carga *
              </label>
              <input
                id="vehiclePlate"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                required
                placeholder="Ex: 12-AB-34"
              />
            </div>

            <div className="form-field">
              <label htmlFor="clientName">Destinatário / Adquirente *</label>
              <input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                placeholder="Ex: Construções Norte, Lda."
              />
            </div>

            <div className="form-field">
              <label htmlFor="clientTaxNumber">
                NIF / NIPC do Destinatário *
              </label>
              <input
                id="clientTaxNumber"
                value={clientTaxNumber}
                onChange={(e) => setClientTaxNumber(e.target.value)}
                required
                placeholder="Ex: 509 876 543"
              />
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: "20px" }}>
          <div className="card">
            <h3>Local e Horário de Carga (Origem)</h3>
            <div className="form-grid">
              <div className="form-field full">
                <label>Morada de Carga *</label>
                <input
                  value={loadAddress}
                  onChange={(e) => setLoadAddress(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Código Postal</label>
                <input
                  value={loadPostalCode}
                  onChange={(e) => setLoadPostalCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Localidade</label>
                <input
                  value={loadCity}
                  onChange={(e) => setLoadCity(e.target.value)}
                  required
                />
              </div>
              <div className="form-field full">
                <label>Data e Hora de Início de Transporte *</label>
                <input
                  type="datetime-local"
                  value={loadDateTime}
                  onChange={(e) => setLoadDateTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Local de Descarga (Destino / Obra)</h3>
            <div className="form-grid">
              <div className="form-field full">
                <label>Morada de Descarga *</label>
                <input
                  value={unloadAddress}
                  onChange={(e) => setUnloadAddress(e.target.value)}
                  required
                  placeholder="Ex: Obra Cascais — Av. Marginal n.º 40"
                />
              </div>
              <div className="form-field">
                <label>Código Postal Destino</label>
                <input
                  value={unloadPostalCode}
                  onChange={(e) => setUnloadPostalCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Localidade Destino</label>
                <input
                  value={unloadCity}
                  onChange={(e) => setUnloadCity(e.target.value)}
                  required
                />
              </div>
              <div className="form-field full">
                <label>Observações / Instruções Especiais</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Descarga com grua no local."
                />
              </div>
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
            <h3 style={{ margin: 0 }}>
              Mercadorias & Materiais a Transportar ({items.length})
            </h3>
            <button
              type="button"
              onClick={addItem}
              className="button secondary"
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              + Adicionar Artigo
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: "260px" }}>
                    Designação da Mercadoria / Equipamento
                  </th>
                  <th>Unidade</th>
                  <th style={{ width: "120px" }}>Quantidade</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        value={it.description}
                        onChange={(e) =>
                          updateItem(idx, "description", e.target.value)
                        }
                        placeholder="Ex: Perfis metálicos estruturais..."
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
                          width: "100px",
                          padding: "6px",
                          fontSize: "13px",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                        }}
                        required
                      />
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: "24px" }}>
          <Link href="/guias" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={isPending}>
            {isPending
              ? "A comunicar à AT..."
              : "Emitir Guia & Obter Código AT"}
          </button>
        </div>
      </form>
    </>
  );
}
