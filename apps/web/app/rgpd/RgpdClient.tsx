"use client";

import { useState } from "react";

export function RgpdClient() {
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteData(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirmation !== "CONFIRMAR_ELIMINACAO") {
      setStatus("Por favor digite 'CONFIRMAR_ELIMINACAO' no campo de texto para confirmar.");
      return;
    }

    setIsDeleting(true);
    setStatus("A processar pedido de anonimização e esquecimento nos termos do RGPD...");

    try {
      const res = await fetch("/api/rgpd/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: deleteEmail, confirmation: deleteConfirmation }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("Direito ao esquecimento executado com sucesso! Os dados pessoais foram anonimizados conforme exigido por lei.");
        setDeleteEmail("");
        setDeleteConfirmation("");
      } else {
        setStatus(data.error || "Erro ao processar pedido.");
      }
    } catch {
      setStatus("Erro de comunicação com o servidor.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <div className="grid-2">
        {/* Portabilidade de Dados */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>📦 Portabilidade de Dados (Art. 20.º RGPD)</h3>
            <span className="badge success">JSON Seguro</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
            Descarregue uma cópia integral estruturada de todos os seus dados registados no RPG-OS (perfil, orçamentos, faturas, obras e registos de auditoria).
          </p>
          <a
            href="/api/rgpd/export"
            download
            className="button"
            style={{ display: "inline-block", fontSize: "13px", padding: "8px 16px" }}
          >
            📥 Descarregar Arquivo RGPD (.JSON)
          </a>
        </div>

        {/* Políticas e Consentimentos */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>🛡️ Políticas e Consentimentos</h3>
            <span className="badge success">Conforme</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
            O RPG-OS assegura encriptação de dados em repouso e em trânsito (TLS 1.3), registo imutável de acessos e cumprimento estrito do Regulamento (UE) 2016/679.
          </p>
          <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", fontSize: "12px", color: "#475569", border: "1px solid var(--border)" }}>
            ✓ Termos de Serviço: <strong>Versão 1.0 (Aceite)</strong><br />
            ✓ Política de Privacidade: <strong>Versão 1.0 (Aceite)</strong><br />
            ✓ Encarregado de Proteção de Dados (DPO): <code>dpo@rpg-os.pt</code>
          </div>
        </div>
      </div>

      {/* Direito ao Esquecimento */}
      <div className="card" style={{ marginTop: "24px" }}>
        <h3 style={{ color: "#dc2626" }}>⚠️ Direito ao Esquecimento & Eliminação de Dados (Art. 17.º RGPD)</h3>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
          Ao solicitar a eliminação, os seus dados pessoais de identificação e contactos serão permanentemente anonimizados. Faturas e documentos fiscais emitidos serão conservados com valor anonimizado para cumprimento dos prazos legais fiscais da Autoridade Tributária.
        </p>

        <form onSubmit={handleDeleteData} style={{ maxWidth: "500px" }}>
          <div className="form-field">
            <label>Email do Titular dos Dados</label>
            <input
              type="email"
              value={deleteEmail}
              onChange={(e) => setDeleteEmail(e.target.value)}
              placeholder="email@empresa.pt"
              required
            />
          </div>

          <div className="form-field">
            <label>Para confirmar, digite exatamente: <code>CONFIRMAR_ELIMINACAO</code></label>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="CONFIRMAR_ELIMINACAO"
              required
            />
          </div>

          <button
            type="submit"
            className="button secondary"
            style={{ color: "#dc2626", borderColor: "#fca5a5" }}
            disabled={isDeleting}
          >
            {isDeleting ? "A processar..." : "Executar Anonimização RGPD"}
          </button>
        </form>

        {status && (
          <div className="alert alert-info" style={{ marginTop: "16px" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
