import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { MercadoDetail } from "./MercadoDetail";
import { loadVisibleQuotes } from "./requestQuotes";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MercadoPedidoPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getSessionContext();

  if (!ctx) {
    return redirect("/login");
  }

  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .from("service_requests")
    .select(
      `
      id,
      title,
      description,
      status,
      category_id,
      client_id,
      provider_id,
      urgency,
      desired_start_date,
      desired_end_date,
      budget_type,
      budget_amount_cents,
      budget_min_cents,
      budget_max_cents,
      budget_currency,
      created_at,
      updated_at,
      published_at
    `,
    )
    .eq("id", id)
    .single();

  if (error || !request) {
    notFound();
  }

  const isOwner = (request as any).client_id === ctx.user.id;

  // Cotações visíveis: próprias do provider, ou todas se owner (fail-closed).
  const quotes = await loadVisibleQuotes(supabase.from, id, ctx.user.id, isOwner);
  const hasQuote = quotes.some((q) => q.provider_id === ctx.user.id);

  if (!isOwner && !hasQuote) {
    notFound();
  }

  return (
    <MercadoDetail
      request={{ ...request, quotes } as any}
      isOwner={isOwner}
      hasQuote={hasQuote}
      currentUserId={ctx.user.id}
    />
  );
}

function redirect(href: string) {
  return notFound();
}