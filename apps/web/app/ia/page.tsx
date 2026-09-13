"use client";

import { useState } from "react";
import Link from "next/link";
import { generateAiQuoteSuggestions, chatWithAiAction, ChatMessage, ProposedActionDto } from "./actions";
import { AiSuggestedQuoteItem, BUSINESS_SECTORS, BusinessSector } from "@rpg/core";
import { ActionCardsSection } from "@/components/actionPlans/ActionCards";

export default function AssistenteIaPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "estimator">("chat");

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou o seu Assistente Inteligente RPG-OS. Estou preparado para apoiá-lo na gestão de qualquer profissão (construção, medicina, fitness, advocacia, comércio, serviços) e também na sua vida pessoal (lembretes, medicação, marcações de agenda e finanças). Como posso ajudar hoje?",
      timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isChatPending, setIsChatPending] = useState(false);
  const [assistantProposals, setAssistantProposals] = useState<ProposedActionDto[]>([]);

  // Estimator State
  const [description, setDescription] = useState(
    "Prestação de serviços e fornecimento especializado para cliente particular",
  );
  const [area, setArea] = useState(75);
  const [sector, setSector] = useState<BusinessSector>("CONSTRUCTION");
  const [suggestions, setSuggestions] = useState<AiSuggestedQuoteItem[]>([]);
  const [isPending, setIsPending] = useState(false);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || isChatPending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setChatInput("");
    setIsChatPending(true);

    const res = await chatWithAiAction(newHistory, userMsg.content);

    setMessages([
      ...newHistory,
      {
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setAssistantProposals(res.proposals ?? []);
    setIsChatPending(false);
  }

  function handleQuickPrompt(promptText: string) {
    setChatInput(promptText);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    const result = await generateAiQuoteSuggestions({
      projectTitle: "Estimativa IA Universal",
      projectDescription: description,
      areaSquareMeters: area,
      category: sector as any,
    });
    setSuggestions(result);
    setIsPending(false);
  }

  const estimatedTotal = suggestions.reduce(
    (sum, s) =>
      sum + s.suggestedQuantity * s.estimatedUnitPrice * (1 + s.vatRate / 100),
    0,
  );

  return (
    <main>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2>Assistente de Inteligência RPG-OS</h2>
            <span
              className="tag-badge"
              style={{ background: "#2563eb", color: "white" }}
            >
              IA Negocial & Pessoal
            </span>
          </div>
          <p>
            Diálogo em tempo real, automação de tarefas, estimativas por setor, marcações de agenda e apoio à decisão.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`button secondary ${activeTab === "chat" ? "active" : ""}`}
        >
          💬 Conversar com a IA (Chat Inteligente)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("estimator")}
          className={`button secondary ${activeTab === "estimator" ? "active" : ""}`}
        >
          ⚡ Gerador Preditivo de Propostas (7 Setores)
        </button>
      </div>

      {activeTab === "chat" && (
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", height: "520px" }}>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
                background: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      fontSize: "14px",
                      lineHeight: "1.5",
                      background: m.role === "user" ? "#0f172a" : "white",
                      color: m.role === "user" ? "white" : "#1e293b",
                      border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    {m.content}
                  </div>
                  {m.timestamp && (
                    <span style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px", padding: "0 4px" }}>
                      {m.timestamp}
                    </span>
                  )}
                </div>
              ))}
              {isChatPending && (
                <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "white", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "12px", color: "var(--muted)" }}>
                  ✍️ O Assistente RPG-OS está a processar...
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", margin: "12px 0 8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>Sugestões rápidas:</span>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Como posso calcular o IVA reduzido de 6% numa obra?")}
                className="button secondary"
                style={{ fontSize: "11px", padding: "4px 8px" }}
              >
                ⚖️ IVA 6% em Obras
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Como registar a minha medicação diária no RPG-OS?")}
                className="button secondary"
                style={{ fontSize: "11px", padding: "4px 8px" }}
              >
                💊 Rotina de Medicação
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Quais são as regras para emitir uma Guia de Transporte à AT?")}
                className="button secondary"
                style={{ fontSize: "11px", padding: "4px 8px" }}
              >
                🚚 Guias de Transporte AT
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Como agendar uma consulta médica ou reunião?")}
                className="button secondary"
                style={{ fontSize: "11px", padding: "4px 8px" }}
              >
                📅 Marcação na Agenda
              </button>
            </div>

            <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "10px" }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escreva a sua mensagem ou pergunta ao assistente..."
                className="search-input"
                style={{ flex: 1, padding: "12px 14px", fontSize: "14px" }}
                disabled={isChatPending}
              />
              <button type="submit" className="button" disabled={isChatPending || !chatInput.trim()}>
                Enviar Mensagem
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "chat" && assistantProposals.length > 0 && (
        <ActionCardsSection
          actions={assistantProposals}
          title="🧭 Ações recomendadas para ti"
          emptyText="Sem ações pendentes."
          onChanged={(id, status) => {
            setAssistantProposals((prev) =>
              status === "EXECUTED" || status === "CANCELLED"
                ? prev.filter((p) => p.id !== id)
                : prev.map((p) => (p.id === id ? { ...p, status } : p)),
            );
          }}
        />
      )}

      {activeTab === "estimator" && (
        <div className="grid-2">
          <div className="card">
            <h3>Gerador Preditivo de Linhas de Obra & Serviços</h3>
            <form onSubmit={handleGenerate}>
              <div className="form-grid">
                <div className="form-field full">
                  <label htmlFor="desc">
                    Descrição do Projeto / Trabalhos Pretendidos
                  </label>
                  <textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <div className="form-field full">
                  <label htmlFor="sector">Setor de Atividade / Profissão *</label>
                  <select
                    id="sector"
                    value={sector}
                    onChange={(e) => setSector(e.target.value as BusinessSector)}
                  >
                    {Object.values(BUSINESS_SECTORS).map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.title} (CAE {sec.defaultCae})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                    {BUSINESS_SECTORS[sector]?.taxNotes}
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor="area">Volume / Quantidade / Área (m² ou Unidades)</label>
                  <input
                    id="area"
                    type="number"
                    min="1"
                    value={area}
                    onChange={(e) => setArea(parseInt(e.target.value, 10) || 1)}
                    required
                  />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button type="submit" className="button" disabled={isPending}>
                  {isPending
                    ? "A processar estimativa..."
                    : "✨ Gerar Linhas com Inteligência Artificial"}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <h3>Alertas e Recomendações Automáticas</h3>
            <div className="list">
              <div className="list-row">
                <div>
                  <div className="list-title">Validação de Normas Fiscais PT</div>
                  <div className="list-subtitle">
                    Taxas de IVA (23%, 13%, 6%) automaticamente associadas por
                    tipo de trabalho e região.
                  </div>
                </div>
                <span className="badge success">Conforme</span>
              </div>

              <div className="list-row">
                <div>
                  <div className="list-title">Preços de Referência do Setor</div>
                  <div className="list-subtitle">
                    Custos médios ponderados de mão-de-obra e materiais
                    atualizados para Portugal Continental.
                  </div>
                </div>
                <span className="badge">Atualizado</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "estimator" && suggestions.length > 0 && (
        <div className="card" style={{ marginTop: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>
              Proposta Gerada pelo Assistente ({suggestions.length} linhas)
            </h3>
            <span
              style={{ fontSize: "16px", fontWeight: 700, color: "#15803d" }}
            >
              Estimativa Total: €{estimatedTotal.toFixed(2)} (c/ IVA)
            </span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Descrição Sugerida</th>
                <th>Tipo</th>
                <th>Unid.</th>
                <th>Qtd. Sugerida</th>
                <th>Preço Estimado</th>
                <th>IVA</th>
                <th style={{ textAlign: "right" }}>Total s/ IVA</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s, idx) => {
                const sub = s.suggestedQuantity * s.estimatedUnitPrice;
                return (
                  <tr key={idx}>
                    <td>
                      <strong>{s.description}</strong>
                      {s.notes && (
                        <div
                          style={{ fontSize: "11px", color: "var(--muted)" }}
                        >
                          {s.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="tag-badge">{s.itemType}</span>
                    </td>
                    <td>{s.unit}</td>
                    <td>{s.suggestedQuantity}</td>
                    <td>€{s.estimatedUnitPrice.toFixed(2)}</td>
                    <td>{s.vatRate}%</td>
                    <td style={{ textAlign: "right" }}>€{sub.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "20px",
            }}
          >
            <Link href="/orcamentos/novo" className="button">
              Transferir para Novo Orçamento Oficial →
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
