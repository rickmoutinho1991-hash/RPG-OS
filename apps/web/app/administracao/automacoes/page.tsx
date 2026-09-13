import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { getWorkflowDefinitionsAction } from "../actions";
import { WorkflowAdminClient } from "./WorkflowAdminClient";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para continuar.</div>
      </main>
    );
  }

  const canAdmin =
    hasPermission(ctx.permissions, "admin.view") ||
    hasPermission(ctx.permissions, "administracao.view");
  const canManage = hasPermission(ctx.permissions, "workflows.manage");

  if (!canAdmin || !canManage) {
    return (
      <main>
        <div className="card">
          Não tem permissão para gerir definições de workflow nesta organização.
        </div>
      </main>
    );
  }

  const definitions = await getWorkflowDefinitionsAction();

  return (
    <main>
      <Link href="/administracao" className="button secondary">
        ← Administração
      </Link>
      <span
        className="topbar-eyebrow"
        style={{ display: "block", marginTop: 20 }}
      >
        Governação · Automações
      </span>
      <h1>Definições de Workflow</h1>
      <p style={{ color: "var(--muted)" }}>
        Configure fluxos de aprovação por tipo de entidade: passos e transições
        com permissões exigidas. As alterações são protegidas por sessão, RBAC
        (workflows.manage) e RLS.
      </p>
      <WorkflowAdminClient definitions={definitions} />
    </main>
  );
}