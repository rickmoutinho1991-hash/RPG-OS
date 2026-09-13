import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    return NextResponse.json(
      { error: "Não autorizado. Inicie sessão para aceder a este recurso." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "";
  const supabase = createAdminClient();

  // Non-admin users can only export their own data
  if (user.role !== "ADMIN" && email && email !== user.email) {
    return NextResponse.json(
      { error: "Não tem permissão para exportar dados de outros utilizadores." },
      { status: 403 },
    );
  }

  // If no email specified, export current user's data
  const targetEmail = email || user.email;

  try {
    let query = supabase.from("users").select(`
      id,
      email,
      created_at,
      profiles(*),
      registrations(*),
      contacts(*),
      rgpd_consents(*),
      projects(*),
      quotes(*),
      invoices(*)
    `);

    if (targetEmail) {
      query = query.eq("email", targetEmail.trim().toLowerCase());
    }

    const { data: userData, error } = await query;

    if (error || !userData) {
      return NextResponse.json(
        { error: "Utilizador não encontrado." },
        { status: 404 },
      );
    }

    const exportPayload = {
      exportTimestamp: new Date().toISOString(),
      regime:
        "Regulamento Geral sobre a Proteção de Dados (RGPD - Regulamento UE 2016/679)",
      dataSubjectRight: "Artigo 20.º — Direito de Portabilidade dos Dados",
      platform: "RPG-OS Business Operating System",
      records: userData,
    };

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="RGPD_Export_${Date.now()}.json"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao exportar dados." },
      { status: 500 },
    );
  }
}
