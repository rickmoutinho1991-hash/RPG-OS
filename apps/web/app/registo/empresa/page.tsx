"use client";

import { useState } from "react";
import Link from "next/link";
import { criarEmpresaAction } from "../actions/empresa";
import { ActionResponse } from "../actions/cliente";
import { PORTUGUESE_DISTRICTS } from "@rpg/core";

export default function EmpresaRegistoPage() {
  const [state, setState] = useState<ActionResponse | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await criarEmpresaAction(null, formData);
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
          <h2>Registo de Empresa / Sociedade</h2>
          <p>Registo comercial e fiscal de pessoas coletivas no RPG-OS.</p>
        </div>
        <Link href="/empresas" className="button secondary">
          ← Voltar às Empresas
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
              <Link href="/empresas" className="button" style={{ fontSize: "13px", padding: "6px 12px" }}>
                → Ver em /empresas
              </Link>
              <Link href="/clientes" className="button secondary" style={{ fontSize: "13px", padding: "6px 12px" }}>
                → Ver em /clientes
              </Link>
              <Link
                href={state.id ? `/obras/nova?client_id=${state.id}` : "/obras/nova"}
                className="button"
                style={{ fontSize: "13px", padding: "6px 12px", background: "#059669" }}
              >
                + Criar Obra para esta Empresa
              </Link>
            </div>
          </div>
        )}


        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="legal_name">Firma / Denominação Social *</label>
              <input id="legal_name" name="legal_name" required placeholder="Ex: Construções & Engenharia Silva, Lda." />
            </div>

            <div className="form-field">
              <label htmlFor="commercial_name">Nome Comercial (Marca / Insígnia)</label>
              <input id="commercial_name" name="commercial_name" placeholder="Ex: Grupo Silva Obras" />
            </div>

            <div className="form-field">
              <label htmlFor="nipc">NIPC / NIF Coletivo *</label>
              <input id="nipc" name="nipc" required maxLength={11} placeholder="Ex: 501 234 567" />
            </div>

            <div className="form-field">
              <label htmlFor="legal_form">Forma Jurídica *</label>
              <select id="legal_form" name="legal_form" defaultValue="Sociedade por Quotas (Lda.)">
                <option value="Sociedade por Quotas (Lda.)">Sociedade por Quotas (Lda.)</option>
                <option value="Sociedade Unipessoal por Quotas">Sociedade Unipessoal por Quotas</option>
                <option value="Sociedade Anónima (S.A.)">Sociedade Anónima (S.A.)</option>
                <option value="Cooperativa">Cooperativa</option>
                <option value="Associação">Associação</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="email">Email Corporativo *</label>
              <input id="email" name="email" type="email" required placeholder="geral@empresa.pt" />
            </div>

            <div className="form-field">
              <label htmlFor="telefone">Telefone Principal *</label>
              <input id="telefone" name="telefone" required placeholder="210 000 000" />
            </div>

            <div className="form-field">
              <label htmlFor="website">Website Oficial</label>
              <input id="website" name="website" placeholder="https://www.empresa.pt" />
            </div>

            <div className="form-field">
              <label htmlFor="distrito">Distrito da Sede *</label>
              <select id="distrito" name="distrito" defaultValue="Porto">
                {PORTUGUESE_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="cidade">Concelho da Sede *</label>
              <input id="cidade" name="cidade" required placeholder="Ex: Maia" />
            </div>

            <div className="form-field">
              <label htmlFor="codigo_postal">Código Postal da Sede *</label>
              <input id="codigo_postal" name="codigo_postal" required placeholder="4470-001" />
            </div>

            <div className="form-field full">
              <label htmlFor="morada">Morada da Sede Social *</label>
              <textarea id="morada" name="morada" required placeholder="Ex: Rua Industrial n.º 50" />
            </div>

            <div className="form-field full" style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 10px" }}>Representante Legal / Administrador</h3>
            </div>

            <div className="form-field">
              <label htmlFor="rep_nome">Nome do Representante</label>
              <input id="rep_nome" name="rep_nome" placeholder="Ex: Dr. António Costa" />
            </div>

            <div className="form-field">
              <label htmlFor="rep_email">Email do Representante</label>
              <input id="rep_email" name="rep_email" type="email" placeholder="administracao@empresa.pt" />
            </div>
          </div>

          <div className="form-actions">
            <Link href="/empresas" className="button secondary">
              Cancelar
            </Link>
            <button type="submit" className="button" disabled={isPending}>
              {isPending ? "A registar empresa..." : "Guardar Registo da Empresa"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
