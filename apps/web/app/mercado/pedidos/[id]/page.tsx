import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { MercadoDetail } from "./MercadoDetail";

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
      published_at,
      quotes:service_quotes(
        id,
        request_id,
        provider_id,
        subtotal_cents,
        tax_cents,
        total_cents,
        currency,
        valid_until,
        terms,
        warranty_months,
        estimated_start_date,
        estimated_duration_days,
        response_to_questions,
        status,
        sent_at,
        viewed_at,
        responded_at,
        created_at,
        updated_at,
        items:service_quote_items(
          id,
          description,
          quantity,
          unit,
          unit_price_cents,
          tax_rate,
          total_cents
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !request) {
    notFound();
  }

  const isOwner = request.client_id === ctx.user.id;
  const hasQuote = request.quotes?.some((q: any) => q.provider_id === ctx.user.id);

  if (!isOwner && !hasQuote) {
    notFound();
  }

  return <MercadoDetail request={request} isOwner={isOwner} hasQuote={hasQuote} currentUserId={ctx.user.id} />;
}

function redirect(href: string) {
  return notFound();
}