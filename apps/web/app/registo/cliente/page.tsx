"use client";

import { useState } from "react";
import Link from "next/link";
import { criarClienteAction, ActionResponse } from "../actions/cliente";
import { PORTUGUESE_DISTRICTS } from "@rpg/core";

export default function ClienteRegistoPage() {
  const [state, setState] = useState<ActionResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await criarClienteAction(null, formData);
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
          <h2>Registo de Cliente Particular</h2>
          <p>Adicione um novo cliente singular com identificação fiscal e morada completa.</p>
        </div>
        <Link href="/clientes" className="button secondary">
          ← Voltar aos Clientes
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
                + Criar Obra para este Cliente
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="nome">Nome Completo *</label>
              <input id="nome" name="nome" required placeholder="Ex: João Silva Ferreira" />
            </div>

            <div className="form-field">
              <label htmlFor="nif">NIF (Número de Identificação Fiscal) *</label>
              <input
                id="nif"
                name="nif"
                required
                maxLength={11}
                placeholder="Ex: 123 456 789"
              />
            </div>

            <div className="form-field">
              <label htmlFor="email">Email de Contacto *</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="joao.silva@exemplo.pt"
              />
            </div>

            <div className="form-field">
              <label htmlFor="telefone">Telefone / Telemóvel *</label>
              <input
                id="telefone"
                name="telefone"
                required
                placeholder="912 345 678"
              />
            </div>

            <div className="form-field">
              <label htmlFor="distrito">Distrito *</label>
              <select id="distrito" name="distrito" defaultValue="Lisboa">
                {PORTUGUESE_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="cidade">Concelho / Localidade *</label>
              <input id="cidade" name="cidade" required placeholder="Ex: Cascais" />
            </div>

            <div className="form-field">
              <label htmlFor="codigo_postal">Código Postal (XXXX-XXX) *</label>
              <input
                id="codigo_postal"
                name="codigo_postal"
                required
                pattern="[1-9][0-9]{3}-[0-9]{3}"
                placeholder="2750-001"
              />
            </div>

            <div className="form-field full">
              <label htmlFor="morada">Morada Completa (Rua, Número, Andar) *</label>
              <textarea
                id="morada"
                name="morada"
                required
                placeholder="Ex: Av. da Liberdade, n.º 120, 3.º Dto"
              />
            </div>

            <div className="form-field full" style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                  <input type="checkbox" name="termos" required defaultChecked />
                  <span>Li e aceito os <strong>Termos e Condições de Serviço</strong> do RPG-OS. *</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                  <input type="checkbox" name="privacidade" required defaultChecked />
                  <span>Consinto o tratamento de dados segundo o <strong>RGPD</strong> e a <strong>Política de Privacidade</strong>. *</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "normal" }}>
                  <input type="checkbox" name="marketing" />
                  <span>Autorizo o envio de comunicações informativas e avisos de orçamentos por email.</span>
                </label>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Link href="/clientes" className="button secondary">
              Cancelar
            </Link>
            <button type="submit" className="button" disabled={isPending}>
              {isPending ? "A guardar cliente..." : "Guardar Registo do Cliente"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
