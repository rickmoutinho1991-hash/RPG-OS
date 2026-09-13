"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProjectAction } from "../actions";
import { ClientListItem } from "@/app/clientes/actions";

export function NovaObraForm({
  clientes,
  selectedClientId,
}: {
  clientes: ClientListItem[];
  selectedClientId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await createProjectAction(formData);

    if (!res.success) {
      setError(res.error || "Erro ao criar obra.");
      setIsPending(false);
    } else {
      router.push(`/obras/${res.id}`);
    }
  }

  return (
    <>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="title">Título da Obra / Empreitada *</label>
            <input
              id="title"
              name="title"
              required
              placeholder="Ex: Remodelação Integral de Moradia T4 — Cascais"
            />
          </div>

          <div className="form-field full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label htmlFor="client_id" style={{ margin: 0 }}>Cliente Responsável *</label>
              <Link href="/registo/cliente" style={{ fontSize: "12px", color: "#2563eb", textDecoration: "underline" }}>
                + Registar Novo Cliente
              </Link>
            </div>
            <select
              id="client_id"
              name="client_id"
              required
              defaultValue={selectedClientId || ""}
            >
              <option value="" disabled>
                -- Selecione o Cliente da Obra ({clientes.length} disponível{clientes.length > 1 ? "is" : ""}) --
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — NIF: {c.taxNumber} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="budget_estimated">Orçamento Previsto (€) *</label>
            <input
              id="budget_estimated"
              name="budget_estimated"
              type="number"
              step="0.01"
              required
              placeholder="45000.00"
            />
          </div>

          <div className="form-field">
            <label htmlFor="start_date">Data de Início Prevista</label>
            <input id="start_date" name="start_date" type="date" />
          </div>

          <div className="form-field">
            <label htmlFor="expected_end_date">Data de Conclusão Estimada</label>
            <input id="expected_end_date" name="expected_end_date" type="date" />
          </div>

          <div className="form-field full">
            <label htmlFor="description">Descrição do Âmbito dos Trabalhos</label>
            <textarea
              id="description"
              name="description"
              placeholder="Ex: Demolições, nova rede de águas e esgotos, eletricidade, colocação de cerâmicos e pintura..."
            />
          </div>
        </div>

        <div className="form-actions">
          <Link href="/obras" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={isPending}>
            {isPending ? "A criar obra..." : "Criar Obra e Iniciar Planeamento"}
          </button>
        </div>
      </form>
    </>
  );
}
