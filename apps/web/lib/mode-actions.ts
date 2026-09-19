"use server";

import { cookies } from "next/headers";
import {
  MODE_COOKIE,
  MODE_PERSONAL,
  MODE_WORK,
  type SpaceMode,
} from "@/lib/mode";

/**
 * Grava o modo de espaço (Pessoal/Trabalho) num cookie persistente.
 * O comutador na sidebar chama esta action e revalida a navegação.
 */
export async function setSpaceModeAction(
  mode: SpaceMode,
): Promise<{ ok: boolean; error?: string }> {
  if (mode !== MODE_PERSONAL && mode !== MODE_WORK) {
    return { ok: false, error: "Modo de espaço inválido." };
  }
  const cookieStore = await cookies();
  cookieStore.set(MODE_COOKIE, mode, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}