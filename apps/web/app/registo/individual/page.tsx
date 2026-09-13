"use client";

import { useState } from "react";
import Link from "next/link";
import { criarProfissionalAction } from "../actions/individual";
import { ActionResponse } from "../actions/cliente";

export default function IndividualRegistoPage() {
  const [state, setState] = useState<ActionResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await criarProfissionalAction(null, formData);
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
          <h2>Registo de Profissional / Técnico</h2>
          <p>Registo de colaboradores técnicos, encarregados e operacionais para alocação a obras.</p>
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
                + Alocar a Nova Obra
              </Link>
            </div>
          </div>
        )}


        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="nome">Nome Completo *</label>
              <input id="nome" name="nome" required placeholder="Ex: Manuel Antunes" />
            </div>

            <div className="form-field">
              <label htmlFor="nif">NIF Fiscal *</label>
              <input id="nif" name="nif" required maxLength={11} placeholder="Ex: 234 567 890" />
            </div>

            <div className="form-field">
              <label htmlFor="especialidade">Especialidade / Categoria Técnica *</label>
              <select id="especialidade" name="especialidade" defaultValue="Encarregado Geral">
                <option value="Diretor de Obra / Engenheiro">Diretor de Obra / Engenheiro</option>
                <option value="Encarregado Geral">Encarregado Geral</option>
                <option value="Eletricista Certificado">Eletricista Certificado</option>
                <option value="Canalizador / AVAC">Canalizador / AVAC</option>
                <option value="Pedreiro de 1ª">Pedreiro de 1ª</option>
                <option value="Pintor / Estucador">Pintor / Estucador</option>
                <option value="Carpinteiro / Marceneiro">Carpinteiro / Marceneiro</option>
                <option value="Operador de Máquinas">Operador de Máquinas</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="email">Email de Contacto *</label>
              <input id="email" name="email" type="email" required placeholder="manuel@exemplo.pt" />
            </div>

            <div className="form-field">
              <label htmlFor="telefone">Telefone / Contacto Móvel *</label>
              <input id="telefone" name="telefone" required placeholder="910 000 000" />
            </div>
          </div>

          <div className="form-actions">
            <Link href="/registo" className="button secondary">
              Cancelar
            </Link>
            <button type="submit" className="button" disabled={isPending}>
              {isPending ? "A registar..." : "Guardar Ficha do Profissional"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
