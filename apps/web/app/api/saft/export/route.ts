import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    return NextResponse.json(
      { error: "Não autorizado. Inicie sessão para aceder a este recurso." },
      { status: 401 },
    );
  }

  // Only admins can export SAF-T files
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Acesso restrito a administradores." },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();

  try {
    // HARDENING (integridade SAF-T + tenant isolation):
    // - invoices não tem user_id: sem companyId NÃO há scope possível,
    //   por isso a query NÃO corre (nunca global via service-role).
    // - nome/NIF da empresa vêm de companies; sem valores reais, erro
    //   explícito em vez de fallbacks ("RPG-OS Enterprise Portugal",
    //   "501234567", "999999990", "Lisboa") que poderiam ser submetidos à AT.
    // - companies não tem morada fiscal em nenhuma fonte first-party:
    //   sem ela o SAF-T seria inválido → erro explícito (export ≠ submission).
    if (!user.companyId) {
      return NextResponse.json(
        { error: "Exportação SAF-T indisponível: sem empresa associada à sessão." },
        { status: 403 },
      );
    }
    // Get company information from user's profile
    let companyData: any = null;
    {
      const { data } = await supabase
        .from("companies")
        .select("legal_name,tax_number")
        .eq("id", user.companyId)
        .maybeSingle();
      companyData = data;
    }

    const companyName: string | null = companyData?.legal_name ?? null;
    const companyTaxId: string | null = companyData?.tax_number ?? null;
    if (!companyName || !companyTaxId) {
      return NextResponse.json(
        { error: "Exportação SAF-T indisponível: dados fiscais da empresa incompletos (nome/NIF)." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Exportação SAF-T indisponível: morada fiscal da empresa não registada. Complete os dados da empresa antes de exportar." },
      { status: 500 },
    );

    /* CAMINHO PRESERVADO para quando existir morada fiscal first-party.
       Reativar apenas com: scope company_id obrigatório, nome/NIF reais e
       morada real — nunca fallbacks.
    let invQuery = supabase
      .from("invoices")
      .select(
        `
        *,
        users!inner(id, email, profiles(name, tax_number), addresses(*)),
        invoice_items(*)
      `,
      )
      .eq("company_id", user.companyId)
      .order("issue_date", { ascending: true });

    const { data: invoices } = await invQuery;
    ... (geração XML com dados reais — reativar sem fallbacks "999999990",
    "Lisboa", "1000-001", "Cliente Geral") ...
    */
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar SAF-T." },
      { status: 500 },
    );
  }
}
