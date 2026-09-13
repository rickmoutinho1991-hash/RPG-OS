import { getSessionContext } from "@/lib/session";
import { HealthDashboardClient } from "./HealthDashboardClient";

export default async function SaudeDashboardPage() {
  const ctx = await getSessionContext();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A Minha Saúde</h1>
          {ctx && (
            <p className="text-sm text-muted">
              {ctx.organization ? `Organização: ${ctx.organization.name}` : `Contexto pessoal`}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Aceda às suas informações de saúde através dos serviços oficiais do SNS.
        Integrações com SNS 24, SPMS e Segurança Social.
      </p>

      <HealthDashboardClient ctx={ctx} />

      <div className="mt-6 pt-6 border-t">
        <p className="text-xs text-muted">
          As integrações com serviços oficiais de saúde (SNS 24, SPMS, Segurança Social) 
          requerem credenciais oficiais e onboarding autorizado. 
          As funcionalidades marcadas como &#34;Preparado para integração official&#34; est&atilde;o prontas para ativação quando as credenciais estiverem configuradas.
        </p>
      </div>
    </main>
  );
}