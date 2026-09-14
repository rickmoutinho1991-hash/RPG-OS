"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
}

export function NovoPedidoPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    categoryId: "",
    budgetType: "FIXED",
    budgetAmountCents: "",
    budgetMinCents: "",
    budgetMaxCents: "",
    budgetCurrency: "EUR",
    urgency: "MEDIUM",
    desiredStartDate: "",
    desiredEndDate: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = "Título obrigatório";
    else if (formData.title.length > 200) newErrors.title = "Máximo 200 caracteres";

    if (!formData.description.trim()) newErrors.description = "Descrição obrigatória";
    else if (formData.description.length > 5000) newErrors.description = "Máximo 5000 caracteres";

    if (!formData.categoryId) newErrors.categoryId = "Categoria obrigatória";

    if (formData.budgetType === "FIXED" && (!formData.budgetAmountCents || parseInt(formData.budgetAmountCents) <= 0)) {
      newErrors.budgetAmountCents = "Valor obrigatório > 0";
    }
    if (formData.budgetType === "RANGE") {
      if (!formData.budgetMinCents || parseInt(formData.budgetMinCents) <= 0) {
        newErrors.budgetMinCents = "Mínimo obrigatório > 0";
      }
      if (!formData.budgetMaxCents || parseInt(formData.budgetMaxCents) <= 0) {
        newErrors.budgetMaxCents = "Máximo obrigatório > 0";
      }
      if (parseInt(formData.budgetMaxCents) < parseInt(formData.budgetMinCents)) {
        newErrors.budgetMaxCents = "Máximo deve ser >= mínimo";
      }
    }

    if (formData.desiredStartDate && isNaN(Date.parse(formData.desiredStartDate))) {
      newErrors.desiredStartDate = "Data inválida";
    }
    if (formData.desiredEndDate && isNaN(Date.parse(formData.desiredEndDate))) {
      newErrors.desiredEndDate = "Data inválida";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitting(false);
      return;
    }

    try {
      const fd = new FormData();
      fd.append("title", formData.title.trim());
      fd.append("description", formData.description.trim());
      fd.append("categoryId", formData.categoryId);
      fd.append("budgetType", formData.budgetType);
      if (formData.budgetAmountCents) fd.append("budgetAmountCents", formData.budgetAmountCents);
      if (formData.budgetMinCents) fd.append("budgetMinCents", formData.budgetMinCents);
      if (formData.budgetMaxCents) fd.append("budgetMaxCents", formData.budgetMaxCents);
      fd.append("budgetCurrency", formData.budgetCurrency);
      fd.append("urgency", formData.urgency);
      if (formData.desiredStartDate) fd.append("desiredStartDate", formData.desiredStartDate);
      if (formData.desiredEndDate) fd.append("desiredEndDate", formData.desiredEndDate);

      const res = await fetch("/api/mercado/pedido", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.error) {
        setErrors({ submit: data.error });
      } else if (data.requestId) {
        router.push(`/mercado/pedidos/${data.requestId}`);
      }
    } catch {
      setErrors({ submit: "Erro de rede" });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCategories(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }
    loadCategories();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <Link href="/mercado" style={{ color: "#2563eb", textDecoration: "none", fontSize: "14px", display: "inline-block", marginBottom: "16px" }}>
        ← Voltar ao Mercado
      </Link>

      <h1 style={{ margin: "0 0 24px", fontSize: "28px" }}>Novo Pedido</h1>

      <form onSubmit={handleSubmit} className="card" style={{ padding: "24px" }}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", fontWeight: 500 }}>
            Título *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Reparação de persiana exterior"
            maxLength={200}
            required
            className="input"
          />
          {errors.title && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.title}</div>}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", fontWeight: 500 }}>
            Descrição *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Descreva o problema, o que precisa, detalhes relevantes..."
            rows={5}
            maxLength={5000}
            required
            className="input"
          />
          {errors.description && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.description}</div>}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", fontWeight: 500 }}>
            Categoria *
          </label>
          {loadingCategories ? (
            <select disabled className="input" style={{ opacity: 0.6 }}>
              <option>A carregar...</option>
            </select>
          ) : (
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              required
              className="input"
            >
              <option value="">Selecionar categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          )}
          {errors.categoryId && (
            <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
              {errors.categoryId}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>Orçamento</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="budgetType"
                value="FIXED"
                checked={formData.budgetType === "FIXED"}
                onChange={(e) => setFormData({ ...formData, budgetType: e.target.value })}
              />
              Valor fixo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="budgetType"
                value="RANGE"
                checked={formData.budgetType === "RANGE"}
                onChange={(e) => setFormData({ ...formData, budgetType: e.target.value })}
              />
              Intervalo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="budgetType"
                value="NEGOTIABLE"
                checked={formData.budgetType === "NEGOTIABLE"}
                onChange={(e) => setFormData({ ...formData, budgetType: e.target.value })}
              />
              A negociar
            </label>
          </div>

          {formData.budgetType === "FIXED" && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Valor (cêntimos) *</label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.budgetAmountCents}
                onChange={(e) => setFormData({ ...formData, budgetAmountCents: e.target.value })}
                placeholder="Ex: 34000 (340,00 €)"
                className="input"
                required
              />
              {errors.budgetAmountCents && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.budgetAmountCents}</div>}
            </div>
          )}

          {formData.budgetType === "RANGE" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Mínimo (cêntimos) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.budgetMinCents}
                  onChange={(e) => setFormData({ ...formData, budgetMinCents: e.target.value })}
                  className="input"
                  required
                />
                {errors.budgetMinCents && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.budgetMinCents}</div>}
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Máximo (cêntimos) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.budgetMaxCents}
                  onChange={(e) => setFormData({ ...formData, budgetMaxCents: e.target.value })}
                  className="input"
                  required
                />
                {errors.budgetMaxCents && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.budgetMaxCents}</div>}
              </div>
            </div>
          )}

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Moeda</label>
            <select value={formData.budgetCurrency} onChange={(e) => setFormData({ ...formData, budgetCurrency: e.target.value })} className="input">
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Urgência</label>
          <select
            value={formData.urgency}
            onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
            className="input"
          >
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Início pretendido</label>
            <input
              type="date"
              value={formData.desiredStartDate}
              onChange={(e) => setFormData({ ...formData, desiredStartDate: e.target.value })}
              className="input"
            />
            {errors.desiredStartDate && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.desiredStartDate}</div>}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Fim pretendido</label>
            <input
              type="date"
              value={formData.desiredEndDate}
              onChange={(e) => setFormData({ ...formData, desiredEndDate: e.target.value })}
              className="input"
            />
            {errors.desiredEndDate && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.desiredEndDate}</div>}
          </div>
        </div>

        {errors.submit && (
          <div style={{ padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", marginBottom: "16px" }}>
            {errors.submit}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Link href="/mercado" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? "A criar..." : "Criar pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NovoPedidoPage;
