import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (error) {
    console.error("[api/categories] Erro ao ler categorias:", error.message);
    return NextResponse.json({ error: "Erro ao carregar categorias." }, { status: 500 });
  }

  return NextResponse.json(data || []);
}