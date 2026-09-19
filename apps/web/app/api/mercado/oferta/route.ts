import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";

const PRICE_TYPES = ["FIXED", "PER_HOUR", "FREE_ESTIMATE", "NEGOTIABLE"];
const SERVICE_MODES = ["REMOTE", "ON_SITE", "BOTH"];

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!hasPermission(ctx.permissions, "marketplace.quotes.create")) {
    return NextResponse.json(
      { error: "Sem permissão para publicar ofertas" },
      { status: 403 },
    );
  }

  const formData = await req.formData();
  const title = (formData.get("title") as string) ?? "";
  const description = (formData.get("description") as string) ?? "";
  const categoryId = (formData.get("categoryId") as string) ?? "";
  const priceType = (formData.get("priceType") as string) ?? "NEGOTIABLE";
  const priceRaw = formData.get("priceCents");
  const priceCents = priceRaw ? parseInt(String(priceRaw), 10) : null;
  const currency = (formData.get("currency") as string) || "EUR";
  const locationServiceMode = (formData.get("locationServiceMode") as string) || "BOTH";
  const locationCity = ((formData.get("locationCity") as string) ?? "").trim() || null;
  const locationDistrict =
    ((formData.get("locationDistrict") as string) ?? "").trim() || null;

  const errors: string[] = [];
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();

  if (!cleanTitle || cleanTitle.length < 3 || cleanTitle.length > 200) {
    errors.push("Título com 3 a 200 caracteres");
  }
  if (!cleanDescription || cleanDescription.length > 5000) {
    errors.push("Descrição obrigatória (máx 5000 caracteres)");
  }
  if (!categoryId) errors.push("Categoria obrigatória");
  if (!PRICE_TYPES.includes(priceType)) errors.push("Tipo de preço inválido");
  if (
    (priceType === "FIXED" || priceType === "PER_HOUR") &&
    (!priceCents || priceCents <= 0)
  ) {
    errors.push("Valor obrigatório em cêntimos > 0");
  }
  if (priceCents && priceCents > 100_000_000) {
    errors.push("Valor acima do limite permitido");
  }
  if (!SERVICE_MODES.includes(locationServiceMode)) {
    errors.push("Modalidade de atendimento inválida");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("provider_offerings")
      .insert({
        provider_id: ctx.user.id,
        category_id: categoryId,
        title: cleanTitle,
        description: cleanDescription,
        price_type: priceType,
        price_cents: priceCents,
        currency,
        location_service_mode: locationServiceMode,
        location_city: locationCity,
        location_district: locationDistrict,
        status: "PUBLISHED",
        moderation_status: "APPROVED",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/mercado");
    return NextResponse.json({ success: true, offeringId: data.id });
  } catch (err) {
    console.error("[API/mercado/oferta] Erro:", err);
    return NextResponse.json({ error: "Erro ao publicar a oferta" }, { status: 500 });
  }
}