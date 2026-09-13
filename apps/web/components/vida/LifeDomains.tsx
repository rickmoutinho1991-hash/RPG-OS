import Link from "next/link";
import { domainHome, domainLabel, type LifeDomainStatusEntry } from "@rpg/core";
import { StatusBadge } from "./StatusBadge";

/**
 * OS TEUS SERVIÇOS: representação compacta dos domínios com estados
 * honestos derivados das capacidades reais (nunca hardcoded como LIVE).
 */

const ORDER = [
  "finance",
  "mobility",
  "health",
  "fiscal",
  "government",
  "documents",
  "social_security",
] as const;

export function LifeDomains({ statuses }: { statuses: LifeDomainStatusEntry[] }) {
  const byDomain = new Map(statuses.map((s) => [s.domain, s]));
  const ordered = ORDER.map((d) => byDomain.get(d)).filter(
    (s): s is LifeDomainStatusEntry => Boolean(s),
  );

  return (
    <section aria-labelledby="vida-domains-heading">
      <h2 id="vida-domains-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
        Os teus serviços
      </h2>
      <div className="list">
        {ordered.map((s) => (
          <Link
            key={s.domain}
            href={domainHome(s.domain)}
            className="list-row"
            style={{ textDecoration: "none" }}
            aria-label={`${domainLabel(s.domain)}: ${s.label}`}
          >
            <div>
              <div className="list-title">
                <strong>{domainLabel(s.domain)}</strong>
              </div>
              <div className="list-subtitle">
                {s.label}
                {s.detail ? ` • ${s.detail}` : ""}
              </div>
            </div>
            <StatusBadge state={s.state} />
          </Link>
        ))}
      </div>
    </section>
  );
}
