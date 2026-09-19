"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
}

export default function NovaOfertaPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    categoryId: "",
    priceType: "NEGOTIABLE",
    priceCents: "",
    currency: "EUR",
    locationServiceMode: "BOTH",
    locationCity: "",
    locationDistrict: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    const newErrors: Record<string, string> = {};

    if (!formData.title.trim() || formData.title.trim().length < 3) {
      newErrors.title = "Título com 3 ou mais caracteres";
    } else if (formData.title.length > 200) {
      newErrors.title = "Máximo 200 caracteres";
    }
    if (!formData.description.trim()) newErrors.description = "Descrição obrigatória";
    else if (formData.description.length > 5000) newErrors.description = "Máximo 5000 caracteres";
    if (!formData.categoryId) newErrors.categoryId = "Categoria obrigatória";
    if (
      (formData.priceType === "FIXED" || formData.priceType === "PER_HOUR") &&
      (!formData.priceCents || parseInt(formData.priceCents) <= 0)
    ) {
      newErrors.priceCents = "Valor obrigatório > 0";
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
      fd.append("priceType", formData.priceType);
      if (formData.priceCents) fd.append("priceCents", formData.priceCents);
      fd.append("currency", formData.currency);
      fd.append("locationServiceMode", formData.locationServiceMode);
      if (formData.locationCity) fd.append("locationCity", formData.locationCity);
      if (formData.locationDistrict) fd.append("locationDistrict", formData.locationDistrict);

      const res = await fetch("/api/mercado/oferta", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        setErrors({ submit: data.error });
      } else if (data.offeringId) {
        router.push("/mercado?tab=prestadores");
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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <Link
        href="/mercado?tab=prestadores"
        style={{
          color: "#2563eb",
          textDecoration: "none",
          fontSize: "14px",
          display: "inline-block",
          marginBottom: "16px",
        }}
      >
        ← Voltar ao Mercado
      </Link>

      <h1 style={{ margin: "0 0 24px", fontSize: "28px" }}>Nova Oferta</h1>

      <form onSubmit={handleSubmit} className="card" style={{ padding: "24px" }}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", fontWeight: 500 }}>
            Título *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Pintura e estuques em obra"
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
            placeholder="Descreve o serviço, experiência, zona de atuação..."
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
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>Preço</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="priceType"
                value="FIXED"
                checked={formData.priceType === "FIXED"}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
              />
              Valor fixo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="priceType"
                value="PER_HOUR"
                checked={formData.priceType === "PER_HOUR"}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
              />
              Por hora
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="priceType"
                value="FREE_ESTIMATE"
                checked={formData.priceType === "FREE_ESTIMATE"}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
              />
              Orçamento grátis
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="radio"
                name="priceType"
                value="NEGOTIABLE"
                checked={formData.priceType === "NEGOTIABLE"}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
              />
              A combinar
            </label>
          </div>

          {(formData.priceType === "FIXED" || formData.priceType === "PER_HOUR") && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>
                {formData.priceType === "FIXED" ? "Valor total" : "Valor por hora"} (cêntimos) *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.priceCents}
                onChange={(e) => setFormData({ ...formData, priceCents: e.target.value })}
                placeholder="Ex: 34000 (340,00 €)"
                className="input"
                required
              />
              {errors.priceCents && <div className="error" style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{errors.priceCents}</div>}
            </div>
          )}

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Moeda</label>
            <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="input">
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Modalidade</label>
          <select
            value={formData.locationServiceMode}
            onChange={(e) => setFormData({ ...formData, locationServiceMode: e.target.value })}
            className="input"
          >
            <option value="BOTH">Remoto + Presencial</option>
            <option value="ON_SITE">Presencial</option>
            <option value="REMOTE">Remoto</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Cidade</label>
            <input
              type="text"
              value={formData.locationCity}
              onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
              placeholder="Ex: Lisboa"
              className="input"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Distrito</label>
            <input
              type="text"
              value={formData.locationDistrict}
              onChange={(e) => setFormData({ ...formData, locationDistrict: e.target.value })}
              placeholder="Ex: Lisboa"
              className="input"
            />
          </div>
        </div>

        {errors.submit && (
          <div style={{ padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", marginBottom: "16px" }}>
            {errors.submit}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Link href="/mercado?tab=prestadores" className="button secondary">
            Cancelar
          </Link>
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? "A publicar..." : "Publicar oferta"}
          </button>
        </div>
      </form>
    </div>
  );
}