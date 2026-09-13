import { getSessionContext } from "@/lib/session";

export default async function VeiculosPage() {
  const ctx = await getSessionContext();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ve\u00EDculos</h1>
          {ctx && (
            <p className="text-sm text-muted">
              {ctx.organization ? `Organiza\u00E7\u00E3o: ${ctx.organization.name}` : `Contexto pessoal`}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Consulte os seus ve\u00EDculos associados aos servi\u00E7os de mobilidade.
      </p>

      <div className="card p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Ve\u00EDculos Configurados</h3>
          <span className="badge bg-blue-100 text-blue-800">Preparado para integra\u00E7\u00E3o oficial</span>
        </div>
        <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚗</div>
          <h3 style={{ margin: "0 0 8px" }}>Nenhum ve\u00EDculo configurado</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Configure uma liga\u00E7\u00E3o a um servi\u00E7o de mobilidade para consultar os seus ve\u00EDculos
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t">
        <p className="text-xs text-muted">
          A consulta de ve\u00EDculos requer onboarding oficial com os servi\u00E7os de mobilidade.
          Funcionalidade dispon\u00EDvel ap\u00F3s onboarding autorizado.
        </p>
      </div>
    </main>
  );
}