"use client";

import { useState, useEffect } from "react";

interface Document {
  id: string;
  document_type: string;
  title: string;
  file_url?: string;
  issued_at: string;
  issued_by?: { name: string; organization: string };
  valid_until?: string;
}

export function SaudeDocumentosClient() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDocuments() {
      try {
        const res = await fetch("/api/saude/documents");
        if (res.ok) {
          const data = await res.json();
          setDocuments(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load documents:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDocuments();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "RECEITA": return "📋";
      case "RECEITUARIO_ELETRONICO": return "📄";
      case "GUIA_TRATAMENTO": return "📋";
      case "CERTIFICADO_VACINACAO": return "💉";
      case "RELATORIO_EXAME": return "🧪";
      case "ATTESTADO": return "📝";
      default: return "📄";
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Documentos de Saúde</h2>

      {loading ? (
        <div className="text-center text-muted py-8">A carregar documentos...</div>
      ) : documents.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📄</div>
          <h3 className="font-medium mb-1">Nenhum documento encontrado</h3>
          <p className="text-sm text-muted">
            Os documentos de saúde aparecerão aqui após configurar a ligação oficial SNS 24.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="card p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-2xl">{getTypeIcon(doc.document_type)}</span>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{doc.title}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-muted">
                    <span>{doc.document_type}</span>
                    <span>Emitido: {new Date(doc.issued_at).toLocaleDateString("pt-PT")}</span>
                    {doc.issued_by && <span>Emitido por: {doc.issued_by.name}</span>}
                    {doc.valid_until && <span>Válido até: {new Date(doc.valid_until).toLocaleDateString("pt-PT")}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="button secondary text-sm">
                    Baixar
                  </a>
                )}
                <button className="button secondary text-sm">Ver detalhes</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}