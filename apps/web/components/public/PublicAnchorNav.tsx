"use client";

/**
 * RPG-OS — Navegação por âncoras da página pública (sticky).
 * scroll suave com fallback prefers-reduced-motion.
 */
export function PublicAnchorNav() {
  return (
    <nav
      aria-label="Navegação da página"
      className="public-anchor-nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        gap: "20px",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        padding: "12px 16px",
        background: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {[
        { href: "#capacidades", label: "Capacidades" },
        { href: "#mercado", label: "Mercado" },
        { href: "#por-dentro", label: "Por dentro" },
        { href: "#memoria", label: "Memória" },
        { href: "#entrar", label: "Entrar" },
      ].map((item) => (
        <a
          key={item.href}
          href={item.href}
          style={{
            color: "#e2e8f0",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            padding: "6px 10px",
            borderRadius: "6px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {item.label}
        </a>
      ))}
      <style>{`
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
        }
      `}</style>
    </nav>
  );
}