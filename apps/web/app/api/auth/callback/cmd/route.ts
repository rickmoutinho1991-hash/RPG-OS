import { NextResponse } from "next/server";
import { PortugueseAuthAdapter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token") || searchParams.get("code");
  const tx = searchParams.get("tx");

  if (!token || !tx) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Parâmetros de autenticação inválidos")}`,
    );
  }

  const adapter = new PortugueseAuthAdapter();
  const authResult = await adapter.verifyChaveMovelCallback(token, tx);

  if (!authResult.authenticated) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(authResult.error || "Autenticação Gov falhou")}`,
    );
  }

  const supabase = createAdminClient();

  // Procurar ou criar utilizador correspondente ao NIF da Chave Móvel
  const nif = authResult.nif;
  const name = authResult.fullName;
  const email = `cmd.${nif}@autenticacao.gov.pt`;

  if (!nif || !name) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Dados de autenticação incompletos")}`,
    );
  }

  let { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    const { data: newUser } = await supabase
      .from("users")
      .insert({ email })
      .select("id")
      .single();
    user = newUser;

    if (user) {
      await supabase.from("profiles").insert({
        user_id: user.id,
        name,
        tax_number: nif,
      });

      await supabase.from("registrations").insert({
        user_id: user.id,
        type: "CUSTOMER",
        status: "VERIFIED",
      });
    }
  }

  // Redirecionar para dashboard com sessão estabelecida
  const response = NextResponse.redirect(
    `${origin}/dashboard?auth=cmd_success`,
  );
  return response;
}
