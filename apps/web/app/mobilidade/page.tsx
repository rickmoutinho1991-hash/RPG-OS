import { getSessionContext } from "@/lib/session";
import { MobilidadeDashboardClient } from "./MobilidadeDashboardClient";

export default async function MobilidadeDashboardPage() {
  const ctx = await getSessionContext();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A Minha Mobilidade</h1>
          {ctx && (
            <p className="text-sm text-muted">
              {ctx.organization ? `Organiza\u00E7\u00E3o: ${ctx.organization.name}` : `Contexto pessoal`}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Aceda aos seus dados de mobilidade atrav\u00E9s dos servi\u00E7os oficiais de portagens.
        Integra\u00E7\u00F5es com Via Verde e CTT Portagens.
      </p>

      <MobilidadeDashboardClient ctx={ctx} />

      <div className="mt-6 pt-6 border-t">
        <p className="text-xs text-muted">
          As integra\u00E7\u00F5es com servi\u00E7os oficiais de mobilidade (Via Verde, CTT Portagens, IMT)
          requerem credenciais oficiais e onboarding autorizado.
          Funcionalidades marcadas como &quot;Preparado para integra\u00E7\u00E3o oficial&quot;
          est\u00E3o prontas para ativa\u00E7\u00E3o quando as credenciais estiverem configuradas.
        </p>
      </div>
    </main>
  );
}