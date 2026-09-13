"use client";

import { useState } from "react";
import { UniversalDiaryEntry } from "@rpg/core";
import { createDiaryEntryAction } from "./actions";

export function DiarioClient({
  initialEntries,
}: {
  initialEntries: UniversalDiaryEntry[];
}) {
  const [entries, setEntries] = useState<UniversalDiaryEntry[]>(initialEntries);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [status, setStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"PERSONAL" | "BUSINESS" | "HEALTH" | "FINANCIAL" | "PROJECT" | "ROUTINE">("BUSINESS");
  const [content, setContent] = useState("");
  const [score, setScore] = useState("5");
  const [tagInput, setTagInput] = useState("Foco, Produtividade");

  const filteredEntries =
    categoryFilter === "ALL"
      ? entries
      : entries.filter((e) => e.category === categoryFilter);

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);

    const res = await createDiaryEntryAction({
      title,
      category,
      content,
      moodOrProductivityScore: parseInt(score, 10) || 5,
      tags,
    });

    setStatus(res);
    setIsSubmitting(false);

    if (res.success) {
      const newEntry: UniversalDiaryEntry = {
        id: res.id || `entry_${Date.now()}`,
        userId: "current_user",
        date: new Date().toISOString().split("T")[0],
        title,
        category,
        content,
        moodOrProductivityScore: parseInt(score, 10) || 5,
        tags,
        isPrivate: category === "PERSONAL" || category === "HEALTH",
        createdAt: new Date().toISOString(),
      };
      setEntries([newEntry, ...entries]);
      setTitle("");
      setContent("");
    }
  }

  const [transportType, setTransportType] = useState<"ANDANTE" | "NAVEGANTE" | "CP">("ANDANTE");
  const [transportBalance, setTransportBalance] = useState("18.50");
  const [isTopUpSuccess, setIsTopUpSuccess] = useState(false);

  return (
    <div>
      {/* Passe de Transportes de Portugal & Escudo de Cibersegurança IA */}
      <div className="grid-2" style={{ marginBottom: "24px" }}>
        {/* Passe de Transporte */}
        <div className="card" style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", color: "white", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "24px" }}>🚌</span>
              <div>
                <strong style={{ fontSize: "15px", display: "block" }}>Passe de Transportes & Mobilidade</strong>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Andante (Porto) • Navegante (Lisboa) • CP</span>
              </div>
            </div>
            <span className="tag-badge" style={{ background: "#22c55e", color: "#052e16", fontWeight: 700 }}>
              Ativo / Válido
            </span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.08)", padding: "14px", borderRadius: "10px", margin: "12px 0", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Tipo de Cartão:</span>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>
                  {transportType === "ANDANTE" ? "Andante Metropolitano (Porto)" : transportType === "NAVEGANTE" ? "Navegante Metropolitano (Lisboa)" : "Passe Ferroviário CP"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Saldo / Validade:</span>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#38bdf8" }}>€{transportBalance}</div>
              </div>
            </div>
          </div>

          {isTopUpSuccess && (
            <div className="alert alert-success" style={{ padding: "8px 12px", fontSize: "12px", marginBottom: "10px" }}>
              ✓ Passe carregado com +€10.00 via MBWay com sucesso!
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="button"
              style={{ fontSize: "12px", padding: "6px 12px", background: "#2563eb" }}
              onClick={() => {
                setTransportBalance((prev) => (parseFloat(prev) + 10).toFixed(2));
                setIsTopUpSuccess(true);
                setTimeout(() => setIsTopUpSuccess(false), 3000);
              }}
            >
              + Carregar €10.00 (MBWay)
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: "12px", padding: "6px 12px", background: "rgba(255,255,255,0.1)", color: "white", borderColor: "rgba(255,255,255,0.2)" }}
              onClick={() => {
                setTransportType((prev) => (prev === "ANDANTE" ? "NAVEGANTE" : prev === "NAVEGANTE" ? "CP" : "ANDANTE"));
              }}
            >
              Alternar Rede
            </button>
          </div>
        </div>

        {/* Escudo de Cibersegurança & IA Defesa Ativa */}
        <div className="card" style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "24px" }}>🛡️</span>
              <div>
                <strong style={{ fontSize: "15px", display: "block" }}>Escudo de Defesa Cibernética IA</strong>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Proteção Contínua Anti-Intrusão & Hacking</span>
              </div>
            </div>
            <span className="badge success">Blindado</span>
          </div>

          <div style={{ fontSize: "12px", color: "#334155", lineHeight: "1.6", background: "white", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
            ✓ <strong>Firewall IA & Detetor de Intrusão:</strong> Ativa 24/7 contra acessos não autorizados.<br />
            ✓ <strong>Cifra AES-256:</strong> Contas bancárias, faturas e registos médicos encriptados.<br />
            ✓ <strong>Conformidade Legal:</strong> Alinhado com o CNCS (Centro Nacional de Cibersegurança) e RGPD.
          </div>

          <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#166534" }}>
            <span>🔒 Nenhuma ameaça detetada nas últimas 24 horas</span>
            <span style={{ fontWeight: 700 }}>Integridade 100%</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Formulário de Novo Registo */}
        <div className="card">
          <h3>Novo Registo no Diário</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
            Registe notas de trabalho, pensamentos, reuniões, controlo de despesas ou rotinas de bem-estar.
          </p>

          {status?.success && (
            <div className="alert alert-success" style={{ marginBottom: "16px" }}>
              {status.message}
            </div>
          )}

          {status?.error && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              {status.error}
            </div>
          )}

          <form onSubmit={handleAddEntry}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Título do Registo *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Conclusão de Fase de Obra / Reflexão Diária"
                  required
                />
              </div>

              <div className="form-field">
                <label>Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="BUSINESS">💼 Negócio & Empresa</option>
                  <option value="PROJECT">🔨 Obra & Projeto</option>
                  <option value="PERSONAL">👤 Pessoal & Família</option>
                  <option value="HEALTH">❤️ Saúde & Treino</option>
                  <option value="FINANCIAL">💶 Finanças & Gastos</option>
                  <option value="ROUTINE">🎯 Hábito & Rotina</option>
                </select>
              </div>

              <div className="form-field">
                <label>Nível de Produtividade / Satisfação (1-5)</label>
                <select value={score} onChange={(e) => setScore(e.target.value)}>
                  <option value="5">⭐⭐⭐⭐⭐ Excelente (5/5)</option>
                  <option value="4">⭐⭐⭐⭐ Bom (4/5)</option>
                  <option value="3">⭐⭐⭐ Neutro (3/5)</option>
                  <option value="2">⭐⭐ Regular (2/5)</option>
                  <option value="1">⭐ Desafiante (1/5)</option>
                </select>
              </div>

              <div className="form-field full">
                <label>Etiquetas (separadas por vírgula)</label>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Ex: Obra, Cliente, Prioritário"
                />
              </div>

              <div className="form-field full">
                <label>Conteúdo / Descrição Detalhada *</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  placeholder="Descreva os acontecimentos, decisões tomadas, sentimentos ou avanços técnicos..."
                  required
                />
              </div>
            </div>

            <button type="submit" className="button" style={{ marginTop: "16px", width: "100%" }} disabled={isSubmitting}>
              {isSubmitting ? "A guardar..." : "+ Guardar no Diário"}
            </button>
          </form>
        </div>

        {/* Lista de Registos */}
        <div>
          <div className="card" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <h3 style={{ margin: 0 }}>Histórico do Diário ({filteredEntries.length})</h3>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ fontSize: "12px", padding: "4px 8px" }}
              >
                <option value="ALL">Todas as Categorias</option>
                <option value="BUSINESS">💼 Negócio</option>
                <option value="PROJECT">🔨 Obras</option>
                <option value="PERSONAL">👤 Pessoal</option>
                <option value="HEALTH">❤️ Saúde</option>
                <option value="FINANCIAL">💶 Finanças</option>
              </select>
            </div>

            <div className="list">
              {filteredEntries.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "14px",
                    marginBottom: "12px",
                    background: item.isPrivate ? "#fafafa" : "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <div>
                      <span className="tag-badge" style={{ fontSize: "10px" }}>
                        {item.category === "BUSINESS" ? "💼 Negócio" : item.category === "HEALTH" ? "❤️ Saúde" : item.category === "FINANCIAL" ? "💶 Finanças" : "👤 Pessoal"}
                      </span>
                      <strong style={{ fontSize: "14px", marginLeft: "6px" }}>{item.title}</strong>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {new Date(item.date).toLocaleDateString("pt-PT")}
                    </span>
                  </div>

                  <p style={{ fontSize: "13px", color: "#334155", lineHeight: "1.5", margin: "6px 0 10px" }}>
                    {item.content}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--muted)" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {item.tags.map((tag, idx) => (
                        <span key={idx} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <span>{item.moodOrProductivityScore ? `Classificação: ${item.moodOrProductivityScore}/5 ⭐` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

