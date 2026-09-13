
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessageAction, createChannelAction } from "./actions";

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
