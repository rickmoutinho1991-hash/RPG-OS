"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  domainHome,
  domainLabel,
  resolveLifeAction,
  sourceLabel,
  type LifeItem,
} from "@rpg/core";
import { StatusBadge } from "./StatusBadge";

const PRIORITY_META: Record<LifeItem["priority"], { icon: string; label: string }> = {
  high: { icon: "▲", label: "Prioridade alta" },
  medium: { icon: "◆", label: "Prioridade média" },
  low: { icon: "▽", label: "Prioridade baixa" },
  info: { icon: "ℹ", label: "Informativo" },
};

function dueLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

/**
 * Detalhe consistente de um LifeItem: contexto, origem, estado,
 * ação disponível, domínio, data e explicação. Só mostra o que
 * o domínio realmente fornece (referência, nunca dados duplicados).
 */
function LifeItemDetail({
  item,
  onClose,
}: {
  item: LifeItem;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const target = resolveLifeAction(item);
  const due = dueLabel(item.dueDate);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="life-item-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: "16px",
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "480px", width: "100%", margin: 0 }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: "var(--muted)",
            margin: "0 0 4px",
          }}
        >
          {domainLabel(item.domain)}
        </p>
        <h3 id="life-item-title" style={{ margin: "0 0 12px" }}>
          {item.title}
        </h3>

        <dl style={{ margin: 0, fontSize: "13px", display: "grid", gap: "8px" }}>
          <div>
            <dt style={{ color: "var(--muted)" }}>Origem</dt>
            <dd style={{ margin: 0 }}>{sourceLabel(item)}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--muted)" }}>Estado</dt>
            <dd style={{ margin: 0 }}>
              <StatusBadge state={item.status} />
            </dd>
          </div>
          {due && (
            <div>
              <dt style={{ color: "var(--muted)" }}>Data</dt>
              <dd style={{ margin: 0 }}>{due}</dd>
            </div>
          )}
          {item.description && (
            <div>
              <dt style={{ color: "var(--muted)" }}>Por que aparece aqui</dt>
              <dd style={{ margin: 0 }}>{item.description}</dd>
            </div>
          )}
          {target.instructions && (
            <div>
              <dt style={{ color: "var(--muted)" }}>Como resolver</dt>
              <dd style={{ margin: 0 }}>{target.instructions}</dd>
            </div>
          )}
        </dl>

        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          {target.kind === "link" && target.href ? (
            <Link href={target.href} className="button">
              {target.label} →
            </Link>
          ) : (
            <span style={{ fontSize: "13px", color: "var(--muted)" }}>
              {target.kind === "none" ? "Sem ação disponível." : target.label}
            </span>
          )}
          <button
            ref={closeRef}
            type="button"
            className="button secondary"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Merece a tua atenção": itens prioritários (ordenação determinística
 * feita na agregação). Empty state honesto quando não há dados reais.
 */
export function LifeAttention({ items }: { items: LifeItem[] }) {
  const [selected, setSelected] = useState<LifeItem | null>(null);
  const close = useCallback(() => setSelected(null), []);
  const top = items.slice(0, 3);

  if (top.length === 0) {
    return (
      <section aria-labelledby="vida-attention-heading">
        <h2 id="vida-attention-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
          Merece a tua atenção
        </h2>
        <div className="card">
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
            Não há nada que exija a tua atenção neste momento.
          </p>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            À medida que os teus serviços estiverem ligados, esta área poderá
            mostrar situações que merecem a tua atenção.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="vida-attention-heading">
      <h2 id="vida-attention-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
        Merece a tua atenção
      </h2>
      <div className="list">
        {top.map((item) => {
          const p = PRIORITY_META[item.priority];
          const target = resolveLifeAction(item);
          const due = dueLabel(item.dueDate);
          return (
            <div key={item.id} className="card list-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="list-title">
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    aria-haspopup="dialog"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                      fontWeight: 700,
                      textAlign: "left",
                      color: "inherit",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                  >
                    {item.title}
                  </button>
                </div>
                <div className="list-subtitle">
                  <span aria-label={p.label}>
                    <span aria-hidden="true">{p.icon}</span> {p.label}
                  </span>
                  {" • "}
                  Fonte: {sourceLabel(item)}
                  {due ? ` • ${due}` : ""}
                </div>
              </div>
              {target.kind === "link" && target.href ? (
                <Link
                  href={target.href}
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "6px 10px", whiteSpace: "nowrap" }}
                  aria-label={`${target.label}: ${item.title}`}
                >
                  {target.label} →
                </Link>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "6px 10px", whiteSpace: "nowrap" }}
                  onClick={() => setSelected(item)}
                  aria-label={`Ver detalhes: ${item.title}`}
                >
                  Detalhes
                </button>
              )}
            </div>
          );
        })}
      </div>
      {items.length > 3 && (
        <p style={{ fontSize: "13px", color: "var(--muted)", margin: "8px 0 0" }}>
          + {items.length - 3} {items.length - 3 === 1 ? "outro assunto" : "outros assuntos"} nos
          serviços de origem:{" "}
          <Link href={domainHome(items[3].domain)} style={{ textDecoration: "underline" }}>
            {domainLabel(items[3].domain)}
          </Link>
          .
        </p>
      )}
      {selected && <LifeItemDetail item={selected} onClose={close} />}
    </section>
  );
}
