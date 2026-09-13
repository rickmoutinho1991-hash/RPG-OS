import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

export async function POST(request: Request) {
  try {
    let currentUser;
    try {
      currentUser = await requireAuth();
    } catch {
      return NextResponse.json(
        { error: "Não autorizado. Inicie sessão para prosseguir." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { email, confirmation } = body;

    if (!email || confirmation !== "CONFIRMAR_ELIMINACAO") {
      return NextResponse.json(
        { error: "Confirmação de eliminação de dados inválida." },
        { status: 400 },
      );
    }

    const targetEmail = email.trim().toLowerCase();

    // Apenas o próprio titular ou Administrador do sistema pode solicitar a eliminação
    if (currentUser.role !== "ADMIN" && currentUser.email.toLowerCase() !== targetEmail) {
      return NextResponse.json(
        { error: "Acesso negado: só pode solicitar a eliminação dos seus próprios dados." },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", targetEmail)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { error: "Utilizador não encontrado." },
        { status: 404 },
      );
    }

    // Anonimizar perfis e contactos preservando documentos fiscais obrigatórios por lei (Art. 17.º, n.º 3, alínea b) do RGPD)
    const anonymizedName = `Utilizador Anonimizado #${user.id.slice(0, 8)}`;

    await Promise.all([
      supabase
        .from("profiles")
        .update({
          name: anonymizedName,
          phone: "000000000",
          tax_number: "999999990",
        })
        .eq("user_id", user.id),
      supabase.from("contacts").delete().eq("user_id", user.id),
      supabase
        .from("rgpd_consents")
        .update({
          marketing_consent: false,
          communication_consent: false,
        })
        .eq("user_id", user.id),
      supabase.from("audit_logs").insert({
        user_id: currentUser.id,
        action: "GDPR_RIGHT_TO_ERASURE_EXECUTED",
        module: "RGPD",
        entity_type: "USER",
        entity_id: user.id,
        metadata: {
          requestedEmail: "[REDACTED]",
          operatorId: currentUser.id,
          timestamp: new Date().toISOString(),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message:
        "Direito ao esquecimento executado com sucesso nos termos do RGPD.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao processar pedido RGPD.",
      },
      { status: 500 },
    );
  }
}

