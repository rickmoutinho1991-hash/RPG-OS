/**
 * RPG-OS — Leitura do modo de espaço no servidor (cookie rpgos_mode).
 * Só deve ser importado em server components/actions.
 */
import { cookies } from "next/headers";
import {
  DEFAULT_MODE,
  MODE_COOKIE,
  MODE_WORK,
  type SpaceMode,
} from "@/lib/mode";

export async function getSpaceModeServer(): Promise<SpaceMode> {
  const cookieStore = await cookies();
  const value = cookieStore.get(MODE_COOKIE)?.value;
  return value === MODE_WORK ? MODE_WORK : DEFAULT_MODE;
}