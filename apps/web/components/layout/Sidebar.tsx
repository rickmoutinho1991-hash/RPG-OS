"use client";

/**
 * RPG-OS — Navegação agrupada, adaptada às permissões do utilizador.
 * Fonte única (§159): NAV_GROUPS, PAGE_PERMISSIONS e filterNavGroups
 * vivem em lib/navigation.ts — este ficheiro re-exporta tudo e renderiza a sidebar.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import {
  NAV_GROUPS,
  PAGE_PERMISSIONS,
  filterNavGroups,
  type NavItem,
  type NavGroup,
} from "@/lib/navigation";
import { filterNavGroupsByArea } from "@/lib/areas";
import {
  DEFAULT_MODE,
  MODE_PERSONAL,
  MODE_WORK,
  orderGroupsForMode,
  type SpaceMode,
} from "@/lib/mode";
import { setSpaceModeAction } from "@/lib/mode-actions";

export type { NavItem, NavGroup };
export { NAV_GROUPS, PAGE_PERMISSIONS, filterNavGroups, filterNavGroupsByArea };

export default function Sidebar({
  permissions,
  areaId,
  mode = DEFAULT_MODE,
}: {
  permissions: string[];
  areaId?: string | null;
  mode?: SpaceMode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<SpaceMode>(mode);
  const groups = orderGroupsForMode(filterNavGroupsByArea(permissions, areaId), activeMode);

  const changeMode = async (next: SpaceMode) => {
    if (next === activeMode) return;
    setActiveMode(next);
    const result = await setSpaceModeAction(next);
    if (result.ok) router.refresh();
  };

  const modeButtonStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: "5px 8px",
    fontSize: "11px",
    fontWeight: 700,
    borderRadius: "6px",
    border: "1px solid var(--border, #e2e8f0)",
    background: active ? "var(--brand, #2563eb)" : "transparent",
    color: active ? "#fff" : "var(--muted, #64748b)",
    cursor: "pointer",
  });

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
        <div
          style={{
            display: "flex",
            gap: "6px",
            marginBottom: "10px",
            padding: "10px 12px 0",
          }}
          role="group"
          aria-label="Modo de espaço: Pessoal ou Trabalho"
        >
          <button
            type="button"
            style={modeButtonStyle(activeMode === MODE_PERSONAL)}
            onClick={() => changeMode(MODE_PERSONAL)}
            aria-pressed={activeMode === MODE_PERSONAL}
          >
            Pessoal
          </button>
          <button
            type="button"
            style={modeButtonStyle(activeMode === MODE_WORK)}
            onClick={() => changeMode(MODE_WORK)}
            aria-pressed={activeMode === MODE_WORK}
          >
            Trabalho
          </button>
        </div>
        <div>
          <strong>RPG-OS</strong>
        </div>
        <small>v2.0</small>
      </div>
    </aside>
  );
}
