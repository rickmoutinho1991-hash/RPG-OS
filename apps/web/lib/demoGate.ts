/**
 * RPG-OS — Modo demonstração opt-in.
 * O acesso demo só é ativado quando o ambiente DEV o permite (ALLOW_DEMO_ACCESS="true")
 * E quem pede a rota o faz explicitamente com ?demo=1. Nunca por omissão.
 * docs/DEPLOY.md: ALLOW_DEMO_ACCESS nunca definido em prod.
 */
export function isDemoRequest(
  envDemoEnabled: boolean,
  demoParam: string | undefined | null,
): boolean {
  return envDemoEnabled && demoParam === "1";
}