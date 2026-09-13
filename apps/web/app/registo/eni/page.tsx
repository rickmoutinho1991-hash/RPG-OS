"use client";

import { useState } from "react";
import Link from "next/link";
import { criarEniAction } from "../actions/eni";
import { ActionResponse } from "../actions/cliente";
import { PORTUGUESE_DISTRICTS } from "@rpg/core";

export default function EniRegistoPage() {
  const [state, setState] = useState<ActionResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await criarEniAction(null, formData);
    setState(res);
    setIsPending(false);

    if (res.success) {
      (e.target as HTMLFormElement).reset();
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Registo de Empresário em Nome Individual (ENI)</h2>
          <p>
            Registo de pessoas singulares com atividade comercial ou prestação
            de serviços aberta nas Finanças.
          </p>
        </div>
        <Link href="/registo" className="button secondary">
          ← Voltar aos Registos
        </Link>
      </div>

      <div className="card form-card">
        {state?.error && (
          <div className="alert alert-danger" role="alert">
            {state.error}
          </div>
        )}

        {state?.success && state?.message && (
          <div className="alert alert-success" role="alert" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <strong>✓ Sucesso!</strong> {state.message}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
              <Link href="/clientes" className="button" style={{ fontSize: "13px", padding: "6px 12px" }}>
                → Ver em /clientes
              </Link>
              <Link
                href={state.id ? `/obras/nova?client_id=${state.id}` : "/obras/nova"}
                className="button secondary"
                style={{ fontSize: "13px", padding: "6px 12px" }}
              >
                + Criar Obra para este ENI
              </Link>
            </div>
          </div>
        )}


        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="nome">Nome Completo do Titular *</label>
              <input
                id="nome"
                name="nome"
                required
                placeholder="Ex: Carlos Alberto Sousa"
              />
            </div>

            <div className="form-field">
              <label htmlFor="nome_comercial">
                Nome Comercial / Designação do Negócio
              </label>
              <input
                id="nome_comercial"
                name="nome_comercial"
                placeholder="Ex: Sousa Pinturas & Remodelações"
              />
            </div>

            <div className="form-field">
              <label htmlFor="nif">NIF Singular *</label>
              <input
                id="nif"
                name="nif"
                required
                maxLength={11}
                placeholder="Ex: 198 765 432"
              />
            </div>

            <div className="form-field">
              <label htmlFor="cae">Código de Atividade Económica (CAE) *</label>
              <select
                id="cae"
                name="cae"
                defaultValue="43300 - Acabamentos em edifícios"
              >
                <option value="41200 - Construção de edifícios (residenciais e não residenciais)">
                  41200 - Construção de edifícios
                </option>
                <option value="43210 - Instalação elétrica">
                  43210 - Instalação elétrica
                </option>
                <option value="43221 - Instalação de canalizações e de climatização">
                  43221 - Canalizações e AVAC
                </option>
                <option value="43300 - Acabamentos em edifícios">
                  43300 - Acabamentos em edifícios
                </option>
                <option value="43340 - Pintura e colocação de vidros">
                  43340 - Pintura e vidros
                </option>
                <option value="71120 - Atividades de engenharia e técnicas afins">
                  71120 - Atividades de engenharia
                </option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="email">Email Profissional *</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="carlos.sousa@exemplo.pt"
              />
            </div>

            <div className="form-field">
              <label htmlFor="telefone">Telefone / Contacto *</label>
              <input
                id="telefone"
                name="telefone"
                required
                placeholder="960 000 000"
              />
            </div>

            <div className="form-field">
              <label htmlFor="distrito">Distrito *</label>
              <select id="distrito" name="distrito" defaultValue="Setúbal">
                {PORTUGUESE_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="cidade">Concelho / Localidade *</label>
              <input
                id="cidade"
                name="cidade"
                required
                placeholder="Ex: Setúbal"
              />
            </div>

            <div className="form-field">
              <label htmlFor="codigo_postal">Código Postal (XXXX-XXX) *</label>
              <input
                id="codigo_postal"
                name="codigo_postal"
                required
                placeholder="2900-001"
              />
            </div>

            <div className="form-field full">
              <label htmlFor="morada">Morada Fiscal / Estabelecimento *</label>
              <textarea
                id="morada"
                name="morada"
                required
                placeholder="Ex: Rua dos Combatentes, n.º 15"
              />
            </div>
          </div>

          <div className="form-actions">
            <Link href="/registo" className="button secondary">
              Cancelar
            </Link>
            <button type="submit" className="button" disabled={isPending}>
              {isPending ? "A registar ENI..." : "Guardar Registo ENI"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
