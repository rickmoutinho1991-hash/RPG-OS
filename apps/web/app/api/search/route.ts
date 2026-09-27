/**
 * RPG-OS — Pesquisa Universal (⌘/Ctrl+K).
 * Respeita permissões: só pesquisa módulos que o utilizador pode ver.
 */
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { hasPermission } from "@rpg/core/constants/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SearchResultItem } from "@rpg/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  // Eixo fiscal/financeiro resolve-se da ORGANIZAÇÃO ativa através da bridge
  // company_organizations (vínculo formal, explícito e ACTIVE) — nunca de
  // profiles.company_id (empresa legada fora do eixo RBAC, poderia fugir para
  // a empresa errada quando as permissões vêm de outra organização).
  let companyIds: string[] = [];
  if (orgId) {
    const { data: links } = await supabase
      .from("company_organizations")
      .select("company_id")
      .eq("organization_id", orgId)
      .eq("status", "ACTIVE");
    companyIds = links?.map((l: { company_id: string }) => l.company_id) ?? [];
  } else {
    const me = await getCurrentUser();
    if (me?.companyId) companyIds = [me.companyId];
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const can = (perm: string) => hasPermission(ctx.permissions, perm);
  const like = `%${q}%`;
  const results: SearchResultItem[] = [];

  // Páginas de navegação (sempre disponíveis, filtradas por permissão)
  const pages: Array<[string, string, string]> = [
    ["Início", "/", "inicio.view"],
    ["Tarefas", "/tarefas", "tarefas.view"],
    ["Agenda", "/agenda", "agenda.view"],
    ["Documentos", "/documentos", "documentos.view"],
    ["Clientes", "/clientes", "clientes.view"],
    ["Obras", "/obras", "obras.view"],
    ["Orçamentos", "/orcamentos", "orcamentos.view"],
    ["Faturação", "/faturacao", "faturacao.view"],
    ["Contabilidade", "/contabilidade", "contabilidade.view"],
    ["Comunicação", "/comunicacao", "comunicacao.view"],
    ["Conhecimento", "/conhecimento", "conhecimento.view"],
    ["Auditoria", "/auditoria", "auditoria.view"],
  ];
  for (const [title, url, perm] of pages) {
    if (can(perm) && title.toLowerCase().includes(q.toLowerCase())) {
      results.push({ type: "page", id: `page-${url}`, title, url });
    }
  }

  const queries: Promise<void>[] = [];

  const push = (fn: () => void | Promise<void>) => {
    queries.push((async () => { await fn(); })());
  };

  if (can("tarefas.view")) {
    let query = supabase
      .from("tasks")
      .select("id, title, status")
      .ilike("title", like)
      .limit(5);
    query = orgId ? query.eq("organization_id", orgId) : query.eq("assignee_id", ctx.user.id);
    push(async () => {
      const { data: tasksData } = await query;
      for (const t of tasksData ?? []) {
        results.push({ type: "task", id: t.id, title: t.title, subtitle: t.status, url: "/tarefas" });
      }
    });
  }

  if (companyIds.length > 0 && can("clientes.view")) {
    push(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, tax_number")
        .in("company_id", companyIds)
        .ilike("name", like)
        .limit(5);
      for (const p of data ?? []) {
        results.push({
          type: "person",
          id: p.id,
          title: p.name,
          subtitle: p.tax_number ?? undefined,
          url: `/clientes/${p.id}`,
        });
      }
    });
  }

  if (companyIds.length > 0 && can("orcamentos.view")) {
    push(async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, quote_number, title")
        .in("company_id", companyIds)
        .or(`quote_number.ilike.${like},title.ilike.${like}`)
        .limit(5);
      for (const qt of data ?? []) {
        results.push({ type: "quote", id: qt.id, title: `${qt.quote_number} — ${qt.title}`, url: `/orcamentos/${qt.id}` });
      }
    });
  }

  if (companyIds.length > 0 && can("faturacao.view")) {
    push(async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total")
        .in("company_id", companyIds)
        .ilike("invoice_number", like)
        .limit(5);
      for (const inv of data ?? []) {
        results.push({
          type: "invoice",
          id: inv.id,
          title: inv.invoice_number,
          subtitle: `€${Number(inv.total).toFixed(2)}`,
          url: `/faturacao/${inv.id}`,
        });
      }
    });
  }

  if (companyIds.length > 0 && can("obras.view")) {
    push(async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, code, title")
        .in("company_id", companyIds)
        .or(`code.ilike.${like},title.ilike.${like}`)
        .limit(5);
      for (const pr of data ?? []) {
        results.push({ type: "project", id: pr.id, title: `${pr.code} — ${pr.title}`, url: `/obras/${pr.id}` });
      }
    });
  }

  if (can("conhecimento.view")) {
    push(async () => {
      let kbQuery = supabase
        .from("knowledge_articles")
        .select("id, title, category")
        .eq("status", "PUBLISHED")
        .ilike("title", like)
        .limit(5);
      kbQuery = orgId ? kbQuery.eq("organization_id", orgId) : kbQuery.is("organization_id", null);
      const { data } = await kbQuery;
      for (const k of data ?? []) {
        results.push({ type: "knowledge", id: k.id, title: k.title, subtitle: k.category, url: `/conhecimento` });
      }
    });
  }

  if (can("workflows.view")) {
    push(async () => {
      let wfQuery = supabase
        .from("workflow_instances")
        .select("id, title, entity_type, status, created_at")
        .ilike("title", like)
        .limit(5);
      wfQuery = orgId
        ? wfQuery.eq("organization_id", orgId)
        : wfQuery.or(`requested_by.eq.${ctx.user.id},approver_id.eq.${ctx.user.id}`);
      const { data } = await wfQuery;
      for (const w of data ?? []) {
        results.push({
          type: "workflow",
          id: w.id,
          title: w.title ?? w.entity_type,
          subtitle: w.status,
          url: "/aprovacoes",
        });
      }
    });
  }

  if (can("agenda.view")) {
    push(async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, title, start_time, location")
        .eq("user_id", ctx.user.id)
        .ilike("title", like)
        .order("start_time", { ascending: false })
        .limit(5);
      for (const ev of data ?? []) {
        results.push({
          type: "event",
          id: ev.id,
          title: ev.title,
          subtitle: `${new Date(ev.start_time).toLocaleString("pt-PT")}${ev.location ? ` • ${ev.location}` : ""}`,
          url: "/agenda",
        });
      }
    });
  }

  if (can("financas.view")) {
    push(async () => {
      let bq = supabase
        .from("finance_bills")
        .select("id, name, amount, due_date, status")
        .ilike("name", like)
        .order("due_date", { ascending: false })
        .limit(5);
      bq = companyIds.length > 0
        ? bq.or(`company_id.in.(${companyIds.join(",")}),user_id.eq.${ctx.user.id}`)
        : bq.eq("user_id", ctx.user.id);
      const { data } = await bq;
      for (const b of data ?? []) {
        results.push({
          type: "bill",
          id: b.id,
          title: b.name,
          subtitle: `${Number(b.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} € • ${b.status}`,
          url: "/financas",
        });
      }
    });
  }

  if (can("documentos.view")) {
    push(async () => {
      let dq = supabase
        .from("documents")
        .select("id, file_name, type, status")
        .ilike("file_name", like)
        .order("uploaded_at", { ascending: false })
        .limit(5);
      dq = companyIds.length > 0
        ? dq.or(`company_id.in.(${companyIds.join(",")}),owner_user_id.eq.${ctx.user.id}`)
        : dq.eq("owner_user_id", ctx.user.id);
      const { data } = await dq;
      for (const d of data ?? []) {
        results.push({
          type: "document",
          id: d.id,
          title: d.file_name,
          subtitle: `${d.type} • ${d.status}`,
          url: "/documentos",
        });
      }
    });
  }

  await Promise.allSettled(queries);

  return NextResponse.json({ results: results.slice(0, 25) });
}
