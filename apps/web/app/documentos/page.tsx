import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getDocumentsList, verifyDocumentAction, createDocumentAction, submitDocumentForApprovalAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const statusFilter = resolvedParams.status;
  const docs = await getDocumentsList({ status: statusFilter });

  const pendingDocs = docs.filter((d) => d.status === "PENDING").length;
  const verifiedDocs = docs.filter((d) => d.status === "VERIFIED").length;

  async function handleVerify(documentId: string) {
    "use server";
    await verifyDocumentAction(documentId, "VERIFIED");
  }

  async function handleReject(documentId: string) {
    "use server";
    await verifyDocumentAction(documentId, "REJECTED", "Documento ilegível ou expirado");
  }

  async function handleCreateDocument(formData: FormData) {
    "use server";
    await createDocumentAction(formData);
  }

  async function handleRequestApproval(documentId: string) {
    "use server";
    await submitDocumentForApprovalAction(documentId);
  }

  return (
    <main>
      <SectionHeader
        title="Gestão Documental"
        description="Repositório central de documentos legais, identificações, certidões e alvarás."
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Documentos</span>
          <strong className="metric-value">{docs.length}</strong>
          <span className="metric-change">Ficheiros arquivados</span>
        </div>

        <div className="card">
          <span className="metric-label">Pendentes de Validação</span>
          <strong className="metric-value">{pendingDocs}</strong>
          <span className="metric-change warning">A aguardar análise</span>
        </div>

        <div className="card">
          <span className="metric-label">Documentos Verificados</span>
          <strong className="metric-value">{verifiedDocs}</strong>
          <span className="metric-change success">Conformes</span>
        </div>

        <div className="card">
          <span className="metric-label">Armazenamento</span>
          <strong className="metric-value">Supabase Storage</strong>
          <span className="metric-change success">Encriptado</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3>Novo Upload de Documento</h3>
          <form action={handleCreateDocument}>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="user_email">Email do Titular *</label>
                <input id="user_email" name="user_email" required placeholder="email@exemplo.pt" />
              </div>

              <div className="form-field">
                <label htmlFor="type">Tipo de Documento *</label>
                <select id="type" name="type" defaultValue="IDENTITY_CARD">
                  <option value="IDENTITY_CARD">Cartão de Cidadão / BI</option>
                  <option value="TAX_DOCUMENT">Certidão de Não Dívida (AT / SS)</option>
                  <option value="COMPANY_REGISTRATION">Certidão Comercial Permanente</option>
                  <option value="INSURANCE">Apólice de Seguro Acidentes / RC</option>
                  <option value="LICENSE">Alvará de Construção / IMPIC</option>
                  <option value="ADDRESS_PROOF">Comprovativo de Morada / Sede</option>
                  <option value="COMPANY_BANK_DOCUMENT">Comprovativo de IBAN</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="file">Selecionar Ficheiro (PDF ou Imagem)</label>
                <input id="file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
              </div>

              <div className="form-field">
                <label htmlFor="file_name">Nome Descritivo</label>
                <input id="file_name" name="file_name" placeholder="Ex: CC_Frente_Verso.pdf" />
              </div>

              <div className="form-field">
                <label htmlFor="issued_at">Data de Emissão</label>
                <input id="issued_at" name="issued_at" type="date" />
              </div>

              <div className="form-field">
                <label htmlFor="expires_at">Data de Validade</label>
                <input id="expires_at" name="expires_at" type="date" />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button type="submit" className="button">
                + Registar Documento
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Normas & Conformidade Documental</h3>
          <div style={{ fontSize: "13px", lineHeight: "1.7", color: "#475569" }}>
            <p><strong>• Formatos aceites:</strong> PDF, PNG, JPG (máx. 15MB por ficheiro).</p>
            <p><strong>• Validação Fiscal:</strong> Certidões de não dívida às Finanças e Segurança Social com validade standard de 90 dias.</p>
            <p><strong>• Alvará IMPIC:</strong> Verificação de classe e habilitações para execução de obras públicas e privadas.</p>
            <p><strong>• Proteção RGPD:</strong> Documentos de identificação encriptados com acesso estritamente restrito a administradores autorizados.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <h3 style={{ margin: 0 }}>Documentos Registados ({docs.length})</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/documentos" className={`button secondary ${!statusFilter ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Todos
            </Link>
            <Link href="/documentos?status=PENDING" className={`button secondary ${statusFilter === "PENDING" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Pendentes
            </Link>
            <Link href="/documentos?status=VERIFIED" className={`button secondary ${statusFilter === "VERIFIED" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Verificados
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Ficheiro</th>
                <th>Tipo</th>
                <th>Titular</th>
                <th>Data Envio</th>
                <th>Validade</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Validação</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    Nenhum documento encontrado.
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.fileName}</strong>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>{(d.fileSize / (1024 * 1024)).toFixed(1)} MB • {d.mimeType}</div>
                      {d.fileUrl && (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: "11px", color: "#2563eb", textDecoration: "underline", marginTop: "2px", display: "inline-block" }}
                        >
                          Abrir Ficheiro ↗
                        </a>
                      )}
                    </td>
                    <td><span className="tag-badge">{d.category}</span></td>
                    <td>
                      <div>{d.ownerName}</div>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>{d.ownerEmail}</div>
                    </td>
                    <td>{new Date(d.uploadedAt).toLocaleDateString("pt-PT")}</td>
                    <td>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString("pt-PT") : "Sem validade"}</td>
                    <td>
                      <span className={`badge ${d.status === "VERIFIED" ? "success" : d.status === "REJECTED" ? "danger" : "warning"}`}>
                        {d.status === "VERIFIED" ? "Verificado" : d.status === "REJECTED" ? "Rejeitado" : "Pendente"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {d.status === "PENDING" ? (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <form action={handleVerify.bind(null, d.id)}>
                            <button type="submit" className="button" style={{ padding: "4px 8px", fontSize: "11px", background: "#15803d" }}>
                              Aprovar
                            </button>
                          </form>
                          <form action={handleReject.bind(null, d.id)}>
                            <button type="submit" className="button secondary" style={{ padding: "4px 8px", fontSize: "11px", color: "#b91c1c" }}>
                              Rejeitar
                            </button>
                          </form>
                          <form action={handleRequestApproval.bind(null, d.id)}>
                            <button type="submit" className="button secondary" style={{ padding: "4px 8px", fontSize: "11px" }} title="Submeter para o Centro de Aprovações">
                              Pedir revisão
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--muted)" }}>Processado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
