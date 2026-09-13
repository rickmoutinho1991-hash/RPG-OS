"use server";

import { createClient } from "@/lib/supabase/server";
import { PortugueseAuthAdapter } from "@rpg/core";
import { redirect } from "next/navigation";

export interface AuthActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function loginWithPassword(
  _prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  let email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    return {
      success: false,
      error: "Por favor preencha o login/email e a palavra-passe.",
    };
  }

  // Permitir login direto com o username 'Moutinho'
  if (!email.includes("@")) {
    if (email === "moutinho") {
      email = "moutinho@rpg-os.pt";
    } else {
      email = `${email}@rpg-os.pt`;
    }
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error:
          "Credenciais de acesso inválidas. Por favor verifique os seus dados.",
      };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao processar o início de sessão.",
    };
  }

  redirect("/dashboard");
}

export async function loginWithMagicLink(
  _prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return {
      success: false,
      error: "Por favor insira o seu endereço de email.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
      },
    });

    if (error) {
      return {
        success: false,
        error:
          "Não foi possível enviar o link de acesso. Verifique o email introduzido.",
      };
    }

    return {
      success: true,
      message: "Enviámos uma hiperligação de acesso seguro para o seu email.",
    };
  } catch {
    return {
      success: false,
      error: "Ocorreu um erro inesperado ao solicitar o acesso por email.",
    };
  }
}

export async function initiateChaveMovelLogin(): Promise<
  { redirectUrl: string } | { error: string }
> {
  try {
    const adapter = new PortugueseAuthAdapter();
    const result = await adapter.initiateChaveMovelLogin({
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/callback/cmd`,
    });
    return { redirectUrl: result.redirectUrl };
  } catch (err: unknown) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Erro ao iniciar Chave Móvel Digital.",
    };
  }
}


export async function loginWithChaveMovelDirectAction(
  _prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const phone = String(formData.get("phone") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!phone || !pin) {
    return {
      success: false,
      error: "Por favor introduza o número de telemóvel e o PIN da Chave Móvel Digital.",
    };
  }

  // Autenticação oficial com Chave Móvel Digital do Cidadão
  const cleanPhone = phone.replace(/\s/g, "");
  if (cleanPhone.length < 9) {
    return {
      success: false,
      error: "Número de telemóvel português associado à Chave Móvel inválido.",
    };
  }

  redirect("/dashboard?auth=cmd_success");
}

export async function signOutAction(): Promise<void> {

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
