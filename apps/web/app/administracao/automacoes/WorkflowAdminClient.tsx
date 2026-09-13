"use client";

import { useState } from "react";
import {
  WORKFLOW_ENTITY_TYPES,
  WORKFLOW_ENTITY_LABELS,
  defaultWorkflowSteps,
  defaultWorkflowTransitions,
} from "@rpg/core";
import {
  createWorkflowDefinitionAction,
  toggleWorkflowDefinitionAction,
  type WorkflowDefinitionItem,
} from "../actions";

interface StepDraft {
  key: string;
  name: string;
}
interface TransitionDraft {
  fromStep: string;
  toStep: string;
  condition?: Record<string, unknown>;
}

const DEFAULT_STEPS: StepDraft[] = defaultWorkflowSteps().map((s) => ({
  key: s.key,
  name: s.name ?? s.key,
}));
const DEFAULT_TRANSITIONS: TransitionDraft[] = defaultWorkflowTransitions().map(
  (t) => ({ fromStep: t.fromStep, toStep: t.toStep, condition: t.condition }),
);

export function WorkflowAdminClient({
  definitions,
}: {
  definitions: WorkflowDefinitionItem[];
}) {
  const [list, setList] = useState(definitions);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [entityType, setEntityType] = useState<string>(WORKFLOW_ENTITY_TYPES[0]);
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>(DEFAULT_STEPS);
  const [transitions, setTransitions] =
    useState<TransitionDraft[]>(DEFAULT_TRANSITIONS);
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const stepKeys = steps.map((s) => s.key.trim().toUpperCase()).filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const fd = new FormData();
    fd.set("name", name);
    fd.set("key", key);
    fd.set("entity_type", entityType);
    fd.set("description", description);
    fd.set(
      "steps",
      JSON.stringify(
        steps.map((s, i) => ({ key: s.key, name: s.name, position: i })),
      ),
    );
    fd.set(
      "transitions",
      JSON.stringify(
        transitions.map((t) => ({
          fromStep: t.fromStep,
          toStep: t.toStep,
          ...(t.condition ? { condition: t.condition } : {}),
        })),
      ),
    );

    const res = await createWorkflowDefinitionAction(fd);
    if (res.error) {
      setMessage({ type: "error", text: res.error });
      return;
    }
    setMessage({ type: "success", text: "Definição de workflow criada." });
    setName("");
    setKey("");
    setDescription("");
    setSteps(DEFAULT_STEPS);
    setTransitions(DEFAULT_TRANSITIONS);

    const fresh = await fetch("/api/admin/workflow-definitions");
    if (fresh.ok) {
      const json = await fresh.json();
      if (Array.isArray(json.definitions)) setList(json.definitions);
    }
  }

  function addStep() {
    setSteps((prev) => [...prev, { key: "", name: "" }]);
  }
  function addTransition() {
    const src = stepKeys[0] ?? "SUBMITTED";
    const dst = stepKeys[1] ?? stepKeys[0] ?? "APPROVED";
    setTransitions((prev) => [...prev, { fromStep: src, toStep: dst }]);
  }
  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }
  function updateTransition(index: number, patch: Partial<TransitionDraft>) {
    setTransitions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }
  function removeTransition(index: number) {
    setTransitions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleToggle(item: WorkflowDefinitionItem) {
    const res = await toggleWorkflowDefinitionAction(item.id, !item.active);
    if (res.error) {
      setMessage({ type: "error", text: res.error });
      return;
    }
    setList((prev) =>
      prev.map((d) => (d.id === item.id ? { ...d, active: !d.active } : d)),
    );
  }

  return (
    <div className="grid-2" style={{ marginTop: 20 }}>
      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Nova definição de workflow</h3>

        {message && (
          <div
            className={
              message.type === "error"
                ? "alert alert-danger"
                : "alert alert-success"
            }
            role="status"
            style={{ marginBottom: 16 }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field">
            <label>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aprovação de Fatura" required />
          </div>
          <div className="form-field">
            <label>Identificador (key) *</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="INVOICE_APPROVAL" required />
          </div>
          <div className="form-field full">
            <label>Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fluxo de aprovação para faturas (opcional)" />
          </div>
          <div className="form-field full">
            <label>Tipo de Entidade *</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              {WORKFLOW_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WORKFLOW_ENTITY_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field full">
            <label>Passos</label>
            {steps.length === 0 && (
              <div className="empty-state" style={{ margin: "6px 0" }}>
                Sem passos. Adicione pelo menos um.
              </div>
            )}
            <div className="list">
              {steps.map((step, i) => (
                <div key={i} className="list-row" style={{ padding: "8px 0", gap: 8 }}>
                  <input
                    value={step.key}
                    onChange={(e) => updateStep(i, { key: e.target.value })}
                    placeholder="KEY"
                    style={{ width: 130, fontSize: 12 }}
                  />
                  <input
                    value={step.name}
                    onChange={(e) => updateStep(i, { name: e.target.value })}
                    placeholder="Nome do passo"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="button secondary"
                    style={{ padding: "2px 8px", fontSize: 11 }}
                    disabled={steps.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addStep} className="button secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
              + Adicionar passo
            </button>
          </div>

          <div className="form-field full">
            <label>Transições (origem → destino)</label>
            {transitions.length === 0 && (
              <div className="empty-state" style={{ margin: "6px 0" }}>
                Sem transições.
              </div>
            )}
            <div className="list">
              {transitions.map((t, i) => (
                <div key={i} className="list-row" style={{ padding: "8px 0", gap: 8 }}>
                  <select
                    value={t.fromStep}
                    onChange={(e) => updateTransition(i, { fromStep: e.target.value })}
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    {stepKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select
                    value={t.toStep}
                    onChange={(e) => updateTransition(i, { toStep: e.target.value })}
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    {stepKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeTransition(i)}
                    className="button secondary"
                    style={{ padding: "2px 8px", fontSize: 11 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addTransition} className="button secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
              + Adicionar transição
            </button>
          </div>

          <div className="form-field full">
            <button type="submit" className="button" style={{ width: "100%" }}>
              Criar Definição de Workflow
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>
          Definições existentes ({list.length})
        </h3>
        {list.length === 0 ? (
          <div className="empty-state">
            Ainda não existem definições de workflow nesta organização.
          </div>
        ) : (
          <div className="list">
            {list.map((item) => (
              <div
                key={item.id}
                className="list-row"
                style={{ alignItems: "flex-start", gap: 12 }}
              >
                <div style={{ flex: 1 }}>
                  <div className="list-title">
                    {item.name}{" "}
                    <span className="tag-badge">
                      {WORKFLOW_ENTITY_LABELS[
                        item.entity_type as keyof typeof WORKFLOW_ENTITY_LABELS
                      ] ?? item.entity_type}
                    </span>
                  </div>
                  <div className="list-subtitle">
                    {item.key} · v{item.version} ·{" "}
                    {new Date(item.created_at).toLocaleDateString("pt-PT")}
                  </div>
                  {item.description && (
                    <div className="list-subtitle">{item.description}</div>
                  )}
                  <div className="list-subtitle">
                    Fluxo: {item.steps.map((s) => s.key).join(" → ") || "—"}
                  </div>
                  <div className="list-subtitle">
                    Transições:{" "}
                    {item.transitions
                      .map((t) => `${t.from_step}→${t.to_step}`)
                      .join(", ") || "—"}
                  </div>
                  <span className={`badge ${item.active ? "success" : ""}`}>
                    {item.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  className="button secondary"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                >
                  {item.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}