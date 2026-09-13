"use client";

import { useEffect, useState } from "react";
import { PERSONAL_EXPENSE_CATEGORIES } from "@rpg/core";
import {
  createPersonalDeduction,
  deletePersonalDeduction,
  getPersonalDeductionSummary,
  listPersonalDeductions,
  updateDeductionContext,
  type PersonalDeductionView,
  type TaxYearSummaryView,
} from "./expenseActions";

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

function contextLabel(i: PersonalDeductionView): string {
  const parts = [
    i.faturaComunicada === true ? "fatura ✓" : i.faturaComunicada === false ? "fatura ✗" : "fatura ?",
    i.buyerNifMatch === true ? "NIF ✓" : i.buyerNifMatch === false ? "NIF ✗" : "NIF ?",
    i.caeElegivel === true ? "CAE ✓" : i.caeElegivel === false ? "CAE ✗" : "CAE ?",
  ];
  return parts.join(" • ");
}

function RowContextEditor({
  item,
  onSave,
  onCancel,
}: {
  item: PersonalDeductionView;
  onSave: (flags: { faturaComunicada: boolean; buyerNifMatch: boolean; caeElegivel: boolean }) => void;
  onCancel: () => void;
}) {
  const [fatura, setFatura] = useState(item.faturaComunicada === true);
  const [nif, setNif] = useState(item.buyerNifMatch === true);
  const [cae, setCae] = useState(item.caeElegivel === true);
  return (
    <div style={{ marginTop: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
      <p style={{ fontSize: "12px", margin: "0 0 8px" }}>
        Contexto fiscal (declarações locais — não confirmado pela AT)
      </p>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={fatura} onChange={(e) => setFatura(e.target.checked)} /> Fatura
        comunicada
      </label>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={nif} onChange={(e) => setNif(e.target.checked)} /> O adquirente
        corresponde ao meu NIF
      </label>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={cae} onChange={(e) => setCae(e.target.checked)} /> Atividade/CAE
        elegível
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="button"
          onClick={() => onSave({ faturaComunicada: fatura, buyerNifMatch: nif, caeElegivel: cae })}
        >
          Guardar contexto
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  UNKNOWN: "Desconhecido",
  PENDING_VALIDATION: "Por validar",
  ELIGIBLE: "Estimativa local: elegível",
  PARTIALLY_ELIGIBLE: "Estimativa local: parcial",
  NOT_ELIGIBLE: "Não elegível",
  MANUAL_REVIEW: "Requer validação manual",
};

function ContextChecks({
  fatura,
  nif,
  cae,
  setFatura,
  setNif,
  setCae,
}: {
  fatura: boolean;
  nif: boolean;
  cae: boolean;
  setFatura: (v: boolean) => void;
  setNif: (v: boolean) => void;
  setCae: (v: boolean) => void;
}) {
  return (
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, marginTop: 8 }}>
      <legend style={{ fontSize: "12px", padding: "0 4px" }}>
        Contexto fiscal (opcional, estimativa local — não confirmado pela AT)
      </legend>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={fatura} onChange={(e) => setFatura(e.target.checked)} /> Fatura
        comunicada
      </label>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={nif} onChange={(e) => setNif(e.target.checked)} /> O adquirente
        corresponde ao meu NIF
      </label>
      <label style={{ display: "block", fontSize: "12px" }}>
        <input type="checkbox" checked={cae} onChange={(e) => setCae(e.target.checked)} /> Atividade/CAE
        elegível
      </label>
    </fieldset>
  );
}

export function DeductionsClient() {
  const year = new Date().getFullYear();
  const [items, setItems] = useState<PersonalDeductionView[]>([]);
  const [summary, setSummary] = useState<TaxYearSummaryView | null>(null);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("HEALTH");
  const [ctxFatura, setCtxFatura] = useState(false);
  const [ctxNif, setCtxNif] = useState(false);
  const [ctxCae, setCtxCae] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setItems(await listPersonalDeductions(year));
    setSummary(await getPersonalDeductionSummary(year));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, sum] = await Promise.all([
        listPersonalDeductions(year),
        getPersonalDeductionSummary(year),
      ]).catch(() => [null, null] as const);
      if (!cancelled) {
        if (list) setItems(list);
        if (sum) setSummary(sum);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd() {
    setBusy(true);
    setMessage(null);
    try {
      const cents = Math.round(Number(amount.replace(",", ".")) * 100);
      const res = await createPersonalDeduction({
        expenseDate: date,
        description,
        amountCents: cents,
        category,
        faturaComunicada: ctxFatura || undefined,
        buyerNifMatch: ctxNif || undefined,
        caeElegivel: ctxCae || undefined,
      });
      if (res.ok) {
        setDate("");
        setDescription("");
        setAmount("");
        setCtxFatura(false);
        setCtxNif(false);
        setCtxCae(false);
        setMessage("Despesa registada (estimativa local, não confirmada pela AT).");
        await refresh();
      } else {
        setMessage(`Não foi possível registar: ${res.error}`);
      }
    } catch {
      setMessage("Não foi possível registar (erro inesperado).");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await deletePersonalDeduction(id);
    if (res.ok) await refresh();
    else setMessage(`Não foi possível remover: ${res.error}`);
  }

  async function handleContext(id: string, flags: { faturaComunicada: boolean; buyerNifMatch: boolean; caeElegivel: boolean }) {
    const res = await updateDeductionContext(id, flags);
    if (res.ok) {
      setEditingId(null);
      await refresh();
    } else {
      setMessage(`Não foi possível atualizar contexto: ${res.error}`);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 4px" }}>Despesas e deduções pessoais</h3>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px" }}>
        Estimativas locais para preparação de IRS. Não confirmadas pela AT;
        sem sincronização e-Fatura.
      </p>
      {message && (
        <div className="card" role="status" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}
      {summary && (
        <div style={{ fontSize: "13px", marginBottom: 12 }}>
          <strong>Resumo fiscal pessoal {summary.taxYear}:</strong> total{" "}
          {euros(summary.totalExpensesCents)} • dedutível estimado{" "}
          {euros(summary.deductibleTotalCents)} • por validar{" "}
          {euros(summary.manualReviewCents)}
        </div>
      )}
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: "12px" }}>
          Data
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={{ fontSize: "12px" }}>
          Descrição curta
          <input
            type="text"
            className="input"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label style={{ fontSize: "12px" }}>
          Valor (€)
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label style={{ fontSize: "12px" }}>
          Categoria fiscal
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {PERSONAL_EXPENSE_CATEGORIES.filter((c) => c !== "UNKNOWN").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button type="button" className="button" disabled={busy} onClick={handleAdd}>
            {busy ? "A registar…" : "Registar despesa"}
          </button>
        </div>
        <ContextChecks
          fatura={ctxFatura}
          nif={ctxNif}
          cae={ctxCae}
          setFatura={setCtxFatura}
          setNif={setCtxNif}
          setCae={setCtxCae}
        />
      </div>
      {items.length === 0 ? (
        <p style={{ color: "var(--muted)", margin: 0 }}>Sem despesas registadas.</p>
      ) : (
        <div className="list">
          {items.map((i) => (
            <div key={i.id}>
              <div className="list-row">
                <div>
                  <div className="list-title">
                    {i.description} • {euros(i.amountCents)}
                  </div>
                  <div className="list-subtitle">
                    {i.expenseDate} • {i.category} • {STATUS_LABEL[i.fiscalStatus] ?? i.fiscalStatus}
                    {i.deductibleCents > 0 && ` • dedutível ${euros(i.deductibleCents)}`}
                    {i.fiscalStatus === "MANUAL_REVIEW" && ` • motivo: ${i.reasonCode}`}
                  </div>
                  <div className="list-subtitle">Contexto: {contextLabel(i)}</div>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "6px 10px" }}
                  onClick={() => setEditingId(editingId === i.id ? null : i.id)}
                >
                  Contexto
                </button>
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "6px 10px" }}
                  onClick={() => handleDelete(i.id)}
                >
                  Remover
                </button>
              </div>
              {editingId === i.id && (
                <RowContextEditor
                  item={i}
                  onCancel={() => setEditingId(null)}
                  onSave={(flags) => handleContext(i.id, flags)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
