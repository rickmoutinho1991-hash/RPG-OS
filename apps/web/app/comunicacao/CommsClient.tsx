"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendMessageAction,
  createChannelAction,
  startDmAction,
  markChannelReadAction,
} from "./actions";

export function CommsComposer({
  channelId,
  canAnnounce,
}: {
  channelId: string;
  canAnnounce: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="card"
      style={{ marginTop: "12px" }}
      action={async (formData) => {
        setError(null);
        const res = await sendMessageAction(formData);
        if (res?.error) setError(res.error);
        else {
          formRef.current?.reset();
          startTransition(() => router.refresh());
        }
      }}
    >
      <input type="hidden" name="channel_id" value={channelId} />
      <div className="form-field">
        <label htmlFor="comms-body">Mensagem</label>
        <textarea
          id="comms-body"
          name="body"
          required
          rows={3}
          placeholder="Escreva a sua mensagem... use @nome para mencionar"
        />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {canAnnounce && (
          <select
            name="kind"
            defaultValue="MESSAGE"
            aria-label="Tipo de mensagem"
            style={{ width: "auto" }}
          >
            <option value="MESSAGE">Mensagem normal</option>
            <option value="ANNOUNCEMENT">Comunicado oficial</option>
            <option value="URGENT">Urgente</option>
          </select>
        )}
        <button type="submit" className="button" disabled={pending}>
          {pending ? "A enviar..." : "Enviar"}
        </button>
        {error && (
          <span style={{ color: "#dc2626", fontSize: "13px" }}>{error}</span>
        )}
      </div>
    </form>
  );
}

export function ThreadReply({
  channelId,
  threadRootId,
}: {
  channelId: string;
  threadRootId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      style={{
        display: "flex",
        gap: "6px",
        marginTop: "8px",
        marginLeft: "12px",
        flexWrap: "wrap",
      }}
      action={async (formData) => {
        setError(null);
        const res = await sendMessageAction(formData);
        if (res?.error) setError(res.error);
        else {
          formRef.current?.reset();
          startTransition(() => router.refresh());
        }
      }}
    >
      <input type="hidden" name="channel_id" value={channelId} />
      <input type="hidden" name="thread_root_id" value={threadRootId} />
      <input
        name="body"
        placeholder="Responder em thread..."
        aria-label="Responder em thread"
        required
        style={{ flex: 1, minWidth: "160px", padding: "6px 10px", fontSize: "13px" }}
      />
      <button type="submit" className="button secondary" style={{ fontSize: "12px", padding: "6px 10px" }} disabled={pending}>
        Responder
      </button>
      {error && <span style={{ color: "#dc2626", fontSize: "12px" }}>{error}</span>}
    </form>
  );
}

export function MarkChannelRead({ channelId }: { channelId: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const formData = new FormData();
    formData.append("channel_id", channelId);
    void markChannelReadAction(formData);
  }, [channelId]);

  return null;
}

export function DmStarter({
  members,
}: {
  members: { user_id: string; name: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0) return null;

  return (
    <form
      style={{ display: "inline-flex", gap: "6px" }}
      action={async (formData) => {
        setError(null);
        const res = await startDmAction(formData);
        if (res?.error) setError(res.error);
        else if (res?.channelSlug) {
          startTransition(() => router.push(`/comunicacao?canal=${res.channelSlug}`));
        }
      }}
    >
      <select
        name="user_id"
        aria-label="Destinatário da mensagem direta"
        required
        style={{ padding: "6px 10px", fontSize: "12px", maxWidth: "160px" }}
      >
        <option value="">+ DM para...</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name ?? "Membro"}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="button secondary"
        style={{ fontSize: "12px", padding: "6px 10px" }}
        disabled={pending}
      >
        Abrir
      </button>
      {error && <span style={{ color: "#dc2626", fontSize: "12px" }}>{error}</span>}
    </form>
  );
}

export function CreateChannelForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      style={{ display: "inline-flex", gap: "6px" }}
      action={async (formData) => {
        await createChannelAction(formData);
        formRef.current?.reset();
        startTransition(() => router.refresh());
      }}
    >
      <input
        name="name"
        placeholder="+ Novo canal"
        aria-label="Nome do novo canal"
        required
        style={{ padding: "6px 10px", fontSize: "12px", minWidth: "120px" }}
      />
      <button
        type="submit"
        className="button secondary"
        style={{ fontSize: "12px", padding: "6px 10px" }}
        disabled={pending}
      >
        Criar
      </button>
    </form>
  );
}