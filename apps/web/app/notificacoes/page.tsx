import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarkAllReadButton } from "./MarkAllReadButton";
import { NotificationGroupList } from "./NotificationGroupList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para ver as suas notificações.</div>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <main>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span className="topbar-eyebrow">Centro de Notificações</span>
          <h1>Notificações</h1>
          <p style={{ color: "var(--muted)" }}>
            {unread > 0 ? `${unread} não lida(s)` : "Tudo lido."}
          </p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        {notifications.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Ainda não tem notificações. Quando algo precisar da sua atenção,
            aparece aqui.
          </p>
        ) : (
          <NotificationGroupList notifications={notifications} />
        )}
      </div>
    </main>
  );
}
