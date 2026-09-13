import { getSessionContext } from "@/lib/session";
import { SaudeReceitasClient } from "./SaudeReceitasClient";

export default async function SaudeReceitasPage() {
  const ctx = await getSessionContext();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receitas</h1>
          {ctx && (
            <p className="text-sm text-muted">
              {ctx.organization ? `Organização: ${ctx.organization.name}` : `Contexto pessoal`}
            </p>
          )}
        </div>
        <a href="/saude" className="button secondary">
          ← Voltar à Saúde
        </a>
      </div>

      <p className="text-sm text-muted mb-4">
        Lista de receitas médicas ativas e históricas obtidas através da integração oficial SNS 24.
      </p>

      <SaudeReceitasClient />
    </main>
  );
}