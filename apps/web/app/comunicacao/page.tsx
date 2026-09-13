import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@rpg/core";
import { CommsComposer, CreateChannelForm } from "./CommsClient";

export const dynamic = "force-dynamic";

export default async function CommsPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para aceder à comunicação.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "comunicacao.view")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para aceder à comunicação interna.
        </div>
      </main>
    );
  }

  const { canal } = await searchParams;
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  let channelsQuery = supabase
    .from("comms_channels")
    .select("id, name, slug, type, description")
    .order("name");
  channelsQuery = orgId
    ? channelsQuery.eq("organization_id", orgId)
    : channelsQuery.is("organization_id", null);

  const { data: channels } = await channelsQuery;
  const channelList = channels ?? [];
  const activeChannel =
    channelList.find((c) => c.slug === canal) ?? channelList[0] ?? null;

  const { data: messages } = activeChannel
    ? await supabase
        .from("comms_messages")
        .select("id, body, kind, created_at, author_id, profiles(name)")
        .eq("channel_id", activeChannel.id)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [] };

  const canManage = hasPermission(ctx.permissions, "comunicacao.manage");

  return (
    <main>
      <span className="topbar-eyebrow">RPG-OS Comms</span>
      <h1>Comunicação</h1>

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          margin: "12px 0",
        }}
      >
        {channelList.map((c) => (
          <a
            key={c.id}
            href={`/comunicacao?canal=${c.slug}`}
            className={`button secondary ${activeChannel?.id === c.id ? "active" : ""}`}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            # {c.name}
            {c.type === "ANNOUNCEMENTS" && " 📢"}
          </a>
        ))}
        {canManage && <CreateChannelForm />}
      </div>

      {activeChannel ? (
        <>
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}># {activeChannel.name}</h3>
            {(messages ?? []).length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                Ainda não há mensagens neste canal. Comece a conversa.
              </p>
            ) : (
              <div className="list">
                {(messages ?? []).map((m) => (
                  <div key={m.id} className="list-row">
                    <div>
                      <div className="list-title">
                        <strong>
                          {(m.profiles as unknown as { name?: string })?.name ??
                            "Membro"}
                        </strong>{" "}
                        {m.kind !== "MESSAGE" && (
                          <span className="badge warning">
                            {m.kind === "URGENT" ? "URGENTE" : "COMUNICADO"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "14px", whiteSpace: "pre-wrap" }}>
                        {m.body}
                      </div>
                      <div className="list-subtitle">
                        {new Date(m.created_at).toLocaleString("pt-PT")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CommsComposer channelId={activeChannel.id} canAnnounce={canManage} />
        </>
      ) : (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Ainda não existem canais{orgId ? " nesta organização" : ""}.{" "}
            {canManage
              ? "Crie o primeiro canal acima."
              : "Peça a um gestor para criar canais."}
          </p>
        </div>
      )}
    </main>
  );
}
