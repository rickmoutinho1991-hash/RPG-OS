const quotesSelect = `
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
`;

/**
 * Propostas de um pedido visíveis ao visitante (fail-closed):
 * - owner → todas as propostas (decisão de gestão do pedido);
 * - provider → apenas as PRÓPRIAS (nunca as dos concorrentes).
 * RLS deve espelhar o mesmo critério na tabela service_quotes.
 */
export async function loadVisibleQuotes(
  from: (table: string, columns?: string) => any,
  requestId: string,
  viewerId: string,
  isOwner: boolean,
): Promise<any[]> {
  let query = from("service_quotes", quotesSelect)
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  if (!isOwner) {
    query = query.eq("provider_id", viewerId);
  }
  const res = await query;
  return res?.data ?? [];
}