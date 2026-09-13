import { getSessionContext } from "@/lib/session";

export default async function DocumentosPage() {
  const ctx = await getSessionContext();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documentos</h1>
          {ctx && (
            <p className="text-sm text-muted">
              {ctx.organization ? `Organiza\u00E7\u00E3o: ${ctx.organization.name}` : `Contexto pessoal`}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Consulte as faturas, recibos e documentos de mobilidade.
      </p>

      <div className="card p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Documentos</h3>
          <span className="badge bg-blue-100 text-blue-800">Preparado para integra\u00E7\u00E3o oficial</span>
        </div>
        <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <h3 style={{ margin: "0 0 8px" }}>Nenhum documento dispon\u00EDvel</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Configure uma liga\u00E7\u00E3o a um servi\u00E7o de mobilidade para consultar documentos
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t">
        <p className="text-xs text-muted">
          A consulta de documentos requer onboarding oficial com Via Verde ou CTT Portagens.
          Funcionalidade dispon\u00EDvel ap\u00F3s onboarding autorizado.
        </p>
      </div>
    </main>
  );
}