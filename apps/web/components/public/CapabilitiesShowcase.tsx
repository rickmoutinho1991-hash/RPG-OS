"use client";

import { useState } from "react";
import {
  ACTORS,
  buildPublicCatalog,
  isRelevantForActor,
  type ActorTag,
  type CatalogDomain,
} from "@/lib/publicCatalog";

/**
 * RPG-OS — Showcase "Tudo o que somos capazes" (página pública).
 * Catálogo derivado de NAV_SOURCE (fonte única §159), agrupado por domínio.
 * Os chips de ator REALÇAM os serviços relevantes — nunca escondem os outros.
 * Sem acesso a Supabase: dados puramente estáticos.
 */
export function CapabilitiesShowcase() {
  const [selectedActor, setSelectedActor] = useState<ActorTag | null>(null);
  const catalog = buildPublicCatalog();

  return (
    <section id="capacidades" aria-label="Tudo o que somos capazes">
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <h2 style={{ fontSize: "clamp(22px, 3vw, 30px)", margin: "0 0 8px" }}>
          Tudo o que somos capazes
        </h2>
        <p
          style={{
            color: "var(--muted)",
            maxWidth: "640px",
            margin: "0 auto",
          }}
        >
          Escolha o seu perfil para ver o que ganha mais relevo — os restantes
          serviços continuam sempre visíveis.
        </p>

        <div
          role="group"
          aria-label="Filtrar por ator"
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedActor(null)}
            aria-pressed={selectedActor === null}
            className="chip"
            style={{
              border: "1px solid var(--border)",
              background: selectedActor === null ? "#2563eb" : "transparent",
              color: selectedActor === null ? "#fff" : "var(--text)",
            }}
          >
            Todas as áreas
          </button>
          {ACTORS.map((actor) => (
            <button
              key={actor}
              type="button"
              onClick={() => setSelectedActor(actor)}
              aria-pressed={selectedActor === actor}
              className="chip"
              style={{
                border: "1px solid var(--border)",
                background: selectedActor === actor ? "#2563eb" : "transparent",
                color: selectedActor === actor ? "#fff" : "var(--text)",
              }}
            >
              {actor}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {catalog.map((domain) => (
          <PublicDomainCard
            key={domain.id}
            domain={domain}
            selectedActor={selectedActor}
          />
        ))}
      </div>
    </section>
  );
}

function PublicDomainCard({
  domain,
  selectedActor,
}: {
  domain: CatalogDomain;
  selectedActor: ActorTag | null;
}) {
  return (
    <article
      className="card"
      style={{
        padding: "20px",
        border: domain.demo ? "1px dashed #d97706" : "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "18px" }}>{domain.title}</h3>
        {domain.demo && (
          <span
            className="badge warning"
            style={{ fontSize: "11px", padding: "3px 8px" }}
          >
            Demonstração · dados fictícios
          </span>
        )}
      </div>

      <p style={{ color: "var(--muted)", fontSize: "13px", margin: "8px 0 16px" }}>
        {domain.tagline}
      </p>

      <div className="list">
        {domain.services.map((service) => {
          const dimmed =
            selectedActor !== null &&
            !isRelevantForActor(service, selectedActor);
          const highlighted =
            selectedActor !== null && isRelevantForActor(service, selectedActor);
          return (
            <div
              key={service.href}
              className="list-row"
              style={{
                padding: "10px 4px",
                opacity: dimmed ? 0.45 : 1,
                transition: "opacity 0.2s ease",
                borderLeft: highlighted
                  ? "3px solid #2563eb"
                  : "3px solid transparent",
                paddingLeft: highlighted ? "10px" : "7px",
              }}
            >
              <div>
                <div className="list-title">
                  <strong>{service.label}</strong>
                  {service.badges.map((b) => (
                    <span
                      key={b}
                      className="tag-badge"
                      style={{ marginLeft: "8px" }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <div className="list-subtitle">{service.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}