"use client";

import { useState } from "react";

export interface NotifItem {
  id: string;
  title: string;
  body?: string | null;
  category: string;
  read_at: string | null;
  created_at: string;
}

const LOOKS_LOW: ReadonlySet<string> = new Set([
  "INFO",
  "SUCCESS",
  "APPROVAL",
  "MESSAGE",
  "TASK",
]);

function isGroupable(n: NotifItem): boolean {
  return LOOKS_LOW.has(n.category) && Boolean(n.read_at);
}

function Row({ item }: { item: NotifItem }) {
  return (
    <div className="list-row" style={!item.read_at ? undefined : { opacity: 0.7 }}>
      <div>
        <div className="list-title">
          {!item.read_at && <span aria-label="não lida">● </span>}
          {item.title}
        </div>
        {item.body && <div className="list-subtitle">{item.body}</div>}
        <div className="list-subtitle">
          {new Date(item.created_at).toLocaleString("pt-PT")}
        </div>
      </div>
      <span className="badge">{item.category}</span>
    </div>
  );
}

export function NotificationGroupList({ notifications }: { notifications: NotifItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (notifications.length === 0) return null;

  // Agrupa apenas itens CONSECUTIVOS low/info + lidos. Ordem original preservada.
  const groups: Array<{ type: "single"; item: NotifItem } | { type: "group"; items: NotifItem[] }> = [];
  let run: NotifItem[] = [];
  const flush = () => {
    if (run.length > 0) {
      groups.push(
        run.length === 1
          ? { type: "single", item: run[0] }
          : { type: "group", items: run },
      );
      run = [];
    }
  };
  for (const n of notifications) {
    if (isGroupable(n)) {
      run.push(n);
    } else {
      flush();
      groups.push({ type: "single", item: n });
    }
  }
  flush();

  return (
    <div className="list">
      {groups.map((g, idx) =>
        g.type === "single" ? (
          <Row key={g.item.id} item={g.item} />
        ) : (
          <div key={`group-${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              type="button"
              className="list-row"
              style={{
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
              onClick={() => setExpanded((v) => !v)}
            >
              <div>
                <div className="list-title">
                  Outras {g.items.length} coisas resolvidas/lidas
                </div>
                <div className="list-subtitle">
                  {expanded ? "Ocultar detalhes" : "Expandir para ver"}
                </div>
              </div>
              <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
            </button>
            {expanded && (
              <div>
                {g.items.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}