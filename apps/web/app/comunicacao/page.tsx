import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@rpg/core";
import {
  CommsComposer,
  CreateChannelForm,
  DmStarter,
  MarkChannelRead,
  RealtimeComms,
  ThreadReply,
} from "./CommsClient";
import {
  groupThreads,
  splitMentionedBody,
  unreadSinceCount,
} from "@/lib/comunicacao/helpers";

export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
}

interface MessageRow {
  id: string;
  body: string;
  kind: string;
  author_id: string;
  thread_root_id: string | null;
  mentions: string[];
  created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  ANNOUNCEMENT: "COMUNICADO",
  URGENT: "URGENTE",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBody({
  body,
  namesById,
}: {
  body: string;
  namesById: Map<string, string>;
}) {
  const highlighted = new Set(
    Array.from(namesById.values()).filter((name): name is string => Boolean(name)),
  );

  return (
    <div style={{ fontSize: "14px", whiteSpace: "pre-wrap" }}>
      {splitMentionedBody(body, Array.from(highlighted)).map((part, i) =>
        part.mentioned ? (
          <strong key={i} style={{ color: "var(--brand, #2563eb)" }}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}

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
  const orgId = ctx.organization?.id ?? null;
  const isPersonal = !orgId;

  let channelsQuery = supabase
    .from("comms_channels")
    .select("id, name, slug, type, description")
    .order("name");
  channelsQuery = orgId
    ? channelsQuery.eq("organization_id", orgId)
    : channelsQuery.is("organization_id", null);

  const { data: channelsData } = await channelsQuery;
  const rawChannels = (channelsData ?? []) as ChannelRow[];

  let orgChannels: ChannelRow[] = [];
  let personalTeamChannels: ChannelRow[] = [];
  let dmChannels: ChannelRow[] = [];

  if (isPersonal) {
    personalTeamChannels = rawChannels.filter((c) => c.type !== "DIRECT");
    dmChannels = rawChannels.filter((c) => c.type === "DIRECT");
  } else {
    orgChannels = rawChannels.filter((c) => c.type !== "DIRECT");
  }

  const listedChannels = [...dmChannels, ...personalTeamChannels, ...orgChannels];
  const listedIds = listedChannels.map((c) => c.id);

  // Pertencimento + estado de leitura nas listas
  let myMemberships = new Map<string, string | null>();
  if (listedIds.length > 0) {
    const { data: membershipsData } = await supabase
      .from("comms_channel_members")
      .select("channel_id, last_read_at")
      .eq("user_id", ctx.user.id)
      .in("channel_id", listedIds);
    myMemberships = new Map(
      ((membershipsData ?? []) as { channel_id: string; last_read_at: string | null }[])
        .map((m) => [m.channel_id, m.last_read_at]),
    );
    // DMs pessoais: só os em que participo
    if (isPersonal) {
      dmChannels = dmChannels.filter((c) => myMemberships.has(c.id));
    }
  }

  // Não-lidos: mensagens mais recentes por canal (light)
  const unreadByChannel = new Map<string, number>();
  if (listedIds.length > 0) {
    const { data: recentData } = await supabase
      .from("comms_messages")
      .select("id, channel_id, created_at")
      .in("channel_id", listedIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const channelId of listedIds) {
      unreadByChannel.set(
        channelId,
        unreadSinceCount(
          ((recentData ?? []) as { id: string; channel_id: string; created_at: string }[])
            .filter((m) => m.channel_id === channelId),
          myMemberships.get(channelId) ?? null,
        ),
      );
    }
  }

  const allListedChannels = [...dmChannels, ...personalTeamChannels, ...orgChannels];
  const activeChannel =
    allListedChannels.find((c) => c.slug === canal) ?? allListedChannels[0] ?? null;

  // Mensagens do canal ativo (com threads e menções)
  let messages: MessageRow[] = [];
  if (activeChannel) {
    const { data: messagesData } = await supabase
      .from("comms_messages")
      .select("id, body, kind, created_at, author_id, thread_root_id, mentions")
      .eq("channel_id", activeChannel.id)
      .order("created_at", { ascending: true })
      .limit(200);
    messages = (messagesData ?? []) as MessageRow[];
  }

  const nameIds = new Set<string>();
  for (const message of messages) {
    nameIds.add(message.author_id);
    for (const mentionId of message.mentions ?? []) nameIds.add(mentionId);
  }

  const namesById = new Map<string, string>();
  if (nameIds.size > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", Array.from(nameIds));
    for (const p of (profilesData ?? []) as { user_id: string; name: string | null }[]) {
      if (p.name) namesById.set(p.user_id, p.name);
    }
  }

  // Membros da organização (para iniciar mensagens diretas)
  let orgMembers: { user_id: string; name: string | null }[] = [];
  if (orgId) {
    const { data: membersData } = await supabase
      .from("org_memberships")
      .select("user_id, profiles(name)")
      .eq("organization_id", orgId)
      .eq("status", "ACTIVE")
      .limit(100);
    orgMembers = ((membersData ?? []) as unknown as {
      user_id: string;
      profiles: { name: string | null } | { name: string | null }[] | null;
    }[]).map((m) => ({
      user_id: m.user_id,
      name: Array.isArray(m.profiles) ? m.profiles[0]?.name ?? null : (m.profiles?.name ?? null),
    }));
  }

  const { roots, repliesByParent } = groupThreads(messages);

  const renderMessage = (message: MessageRow, isReply: boolean) => (
    <div
      key={message.id}
      style={{
        padding: isReply ? "6px 10px" : "10px 0",
        marginBottom: isReply ? "4px" : "0",
        background: isReply ? "var(--bg-tertiary, #f8fafc)" : "transparent",
        borderRadius: isReply ? "8px" : "0",
      }}
    >
      <div className="list-title" style={{ fontSize: "13px" }}>
        <strong>{namesById.get(message.author_id) ?? "Membro"}</strong>{" "}
        {message.kind !== "MESSAGE" && (
          <span className="badge warning">
            {KIND_LABELS[message.kind] ?? message.kind}
          </span>
        )}
        <span className="list-subtitle"> · {formatDate(message.created_at)}</span>
      </div>
      <MessageBody body={message.body} namesById={namesById} />
    </div>
  );

  const canManage = hasPermission(ctx.permissions, "comunicacao.manage");

  return (
    <main>
      <span className="topbar-eyebrow">RPG-OS Comms</span>
      <h1>Comunicação</h1>

      {activeChannel && <MarkChannelRead channelId={activeChannel.id} />}{" "}
      {activeChannel && <RealtimeComms channelId={activeChannel.id} channelIds={[...myMemberships.keys()]} />}

      {isPersonal && dmChannels.length > 0 ? (
        <div style={{ margin: "12px 0 4px", fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
          Mensagens diretas
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "12px 0" }}>
        {dmChannels.map((c) => {
          const unread = unreadByChannel.get(c.id) ?? 0;
          return (
            <a
              key={c.id}
              href={`/comunicacao?canal=${c.slug}`}
              className={`button secondary ${activeChannel?.id === c.id ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              💬 {c.name}
              {unread > 0 && (
                <span
                  style={{
                    marginLeft: "6px",
                    background: "#dc2626",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0 6px",
                    fontSize: "11px",
                  }}
                >
                  {unread}
                </span>
              )}
            </a>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          margin: "12px 0",
          alignItems: "center",
        }}
      >
        {allListedChannels
          .filter((c) => c.type !== "DIRECT" || !isPersonal)
          .map((c) => {
            const unread = unreadByChannel.get(c.id) ?? 0;
            return (
              <a
                key={c.id}
                href={`/comunicacao?canal=${c.slug}`}
                className={`button secondary ${activeChannel?.id === c.id ? "active" : ""}`}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                # {c.name}
                {c.type === "ANNOUNCEMENTS" && " 📢"}
                {unread > 0 && (
                  <span
                    style={{
                      marginLeft: "6px",
                      background: "#dc2626",
                      color: "#fff",
                      borderRadius: "999px",
                      padding: "0 6px",
                      fontSize: "11px",
                    }}
                  >
                    {unread}
                  </span>
                )}
              </a>
            );
          })}
        <DmStarter members={orgMembers} />
        {canManage && <CreateChannelForm />}
      </div>

      {!isPersonal && activeChannel && activeChannel.type === "DIRECT" ? (
        <div className="card" style={{ marginTop: "12px" }}>
          <h3 style={{ margin: "0 0 8px" }}>
            {activeChannel.name}
          </h3>
          <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
            Conversas diretas vivem no seu Espaço Pessoal — abra a partir da sua
            área pessoal.
          </p>
        </div>
      ) : activeChannel ? (
        <>
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}># {activeChannel.name}</h3>
            {activeChannel.description && (
              <p style={{ color: "var(--muted)", fontSize: "13px", margin: "0 0 12px" }}>
                {activeChannel.description}
              </p>
            )}
            {roots.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                Ainda não há mensagens neste canal. Comece a conversa.
              </p>
            ) : (
              <div className="list">
                {roots.map((root) => (
                  <div key={root.id} className="list-row">
                    {renderMessage(root as MessageRow, false)}
                    {(repliesByParent.get(root.id) ?? []).length > 0 && (
                      <div style={{ marginTop: "4px" }}>
                        {(repliesByParent.get(root.id) ?? []).map((reply) =>
                          renderMessage(reply as MessageRow, true),
                        )}
                      </div>
                    )}
                    <ThreadReply channelId={activeChannel.id} threadRootId={root.id} />
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