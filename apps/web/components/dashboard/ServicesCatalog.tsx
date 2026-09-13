"use client";

import Link from "next/link";
import { buildPublicCatalog, type CatalogDomain } from "@/lib/publicCatalog";

interface ServicesCatalogProps {
  domains: CatalogDomain[];
  counts: {
    approvals?: number;
    overdueBills?: number;
    expiringDocs?: number;
    complaints?: number;
  };
}

export function ServicesCatalog({ domains, counts }: ServicesCatalogProps) {
  const relevantDomains = domains.filter(
    (d) => d.id !== "mercado" && d.services.length > 0
  );

  return (
    <section aria-label="Serviços RPG-OS" style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px" }}>Serviços RPG-OS</h2>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        {relevantDomains.map((domain) => (
          <DomainCard key={domain.id} domain={domain} counts={counts} />
        ))}
      </div>
    </section>
  );
}

function DomainCard({
  domain,
  counts,
}: {
  domain: CatalogDomain;
  counts: ServicesCatalogProps["counts"];
}) {
  const badgeMap: Record<string, number | undefined> = {
    "/aprovacoes": counts.approvals,
    "/financas": counts.overdueBills,
    "/documentos": counts.expiringDocs,
    "/reputacao/reclamacoes": counts.complaints,
  };

  return (
    <article className="card" style={{ padding: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
          {domain.title}
        </h3>
        <p style={{ color: "var(--muted)", fontSize: "12px", margin: 0 }}>
          {domain.tagline}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {domain.services.map((service) => {
          const badgeCount = badgeMap[service.href];
          const hasBadge = badgeCount !== undefined && badgeCount > 0;
          return (
            <Link
              key={service.href}
              href={service.href}
              className="service-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                textDecoration: "none",
                color: "var(--text)",
                fontSize: "13px",
                background: "var(--card)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(37,99,235,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <span style={{ fontWeight: 500 }}>{service.label}</span>
              {hasBadge && (
                <span
                  className="badge warning"
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    minWidth: "18px",
                    textAlign: "center",
                  }}
                >
                  {badgeCount}
                </span>
              )}
              {service.badges.length > 0 && !hasBadge && (
                <span
                  className="tag-badge"
                  style={{ fontSize: "10px", padding: "2px 6px" }}
                >
                  {service.badges[0]}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </article>
  );
}