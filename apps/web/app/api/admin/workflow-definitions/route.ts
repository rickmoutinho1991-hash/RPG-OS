import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { getWorkflowDefinitionsAction } from "@/app/administracao/actions";

export const dynamic = "force-dynamic";

/** Lista definições de workflow da organização ativa (REST, protegido). */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const canManage =
    hasPermission(ctx.permissions, "workflows.manage") ||
    hasPermission(ctx.permissions, "admin.view");
  if (!canManage)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const definitions = await getWorkflowDefinitionsAction();
  return NextResponse.json({ definitions });
}