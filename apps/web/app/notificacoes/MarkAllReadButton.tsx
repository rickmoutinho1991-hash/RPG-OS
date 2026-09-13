"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "ALL" }),
    });
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className="button secondary"
      onClick={markAll}
      disabled={busy || pending}
    >
      {busy || pending ? "A marcar..." : "Marcar tudo como lido"}
    </button>
  );
}
