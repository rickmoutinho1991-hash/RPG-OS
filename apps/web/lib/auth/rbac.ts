import { getCurrentUser } from "../supabase/auth";
import { AuthenticatedUser, SystemRole } from "@rpg/core";

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "Sessão não iniciada. Por favor inicie sessão para continuar.",
    );
  }
  return user;
}

export async function requirePermission(
  permission: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (user.role === "ADMIN" || user.permissions.includes("*")) {
    return user;
  }

  if (!user.permissions.includes(permission)) {
    throw new Error(
      `Acesso negado: não tem a permissão necessária (${permission}).`,
    );
  }

  return user;
}

export async function requireRole(
  allowedRoles: SystemRole[],
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (user.role === "ADMIN" || allowedRoles.includes(user.role)) {
    return user;
  }

  throw new Error(
    `Acesso restrito a utilizadores com o perfil: ${allowedRoles.join(", ")}.`,
  );
}
