import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationCategory =
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "URGENT"
  | "SYSTEM"
  | "TASK"
  | "APPROVAL"
  | "MESSAGE"
  | "SECURITY";
export async function createNotification(input: {
  userId: string;
  title: string;
  body?: string;
  link?: string;
  category?: NotificationCategory;
  dedupeKey?: string;
}) {
  const supabase = createAdminClient();
  if (input.dedupeKey) {
    const { data } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", input.userId)
      .eq("title", input.dedupeKey)
      .is("read_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return { id: data.id, deduplicated: true };
  }
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      title: input.dedupeKey ?? input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      category: input.category ?? "INFO",
    })
    .select("id")
    .single();
  if (error) throw new Error("NOTIFICATION_CREATE_FAILED");
  return { id: data.id, deduplicated: false };
}
export async function notifyUser(
  userId: string,
  title: string,
  options?: Omit<Parameters<typeof createNotification>[0], "userId" | "title">,
) {
  return createNotification({ userId, title, ...options });
}
