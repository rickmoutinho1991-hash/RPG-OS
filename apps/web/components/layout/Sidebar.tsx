"use client";

/**
 * RPG-OS — Navegação agrupada, adaptada às permissões do utilizador.
 * Fonte única (§159): NAV_GROUPS, PAGE_PERMISSIONS e filterNavGroups
 * vivem em lib/navigation.ts — este ficheiro re-exporta tudo e renderiza a sidebar.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_GROUPS,
  PAGE_PERMISSIONS,
  filterNavGroups,
  type NavItem,
  type NavGroup,
} from "@/lib/navigation";

export type { NavItem, NavGroup };
export { NAV_GROUPS, PAGE_PERMISSIONS, filterNavGroups };

export default function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">R</div>
        <div>
          <strong>RPG-OS</strong>
          <span>Life & Business OS</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#64748b",
                padding: "10px 12px 4px",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "sidebar-link active" : "sidebar-link"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "#2563eb",
                        color: "white",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div>
          <strong>RPG-OS</strong>
        </div>
        <small>v2.0</small>
      </div>
    </aside>
  );
}
