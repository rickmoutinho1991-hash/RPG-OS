"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
export async function switchOrganizationAction(formData: FormData) {
  const ctx = await getSessionContext();
  const id = String(formData.get("organization_id") ?? "");
  if (!ctx || !id || !ctx.availableOrganizations.some((org) => org.id === id))
    return { error: "Organização inválida." };
  (await cookies()).set("rpgos_active_org", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
  return { success: true };
}
