"use client";

/**
 * RPG-OS — Topbar: título da página, pesquisa universal (Ctrl+K),
 * utilizador autenticado real e sino de notificações.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { signOutAction } from "@/app/login/actions";
import { switchOrganizationAction } from "@/app/organizacao/actions";

const titles: Record<string, string> = {
  "/": "Command Center",
  "/dashboard": "Dashboard Geral",
  "/tarefas": "Tarefas",
  "/comunicacao": "RPG-OS Comms",
  "/conhecimento": "Centro de Conhecimento",
  "/notificacoes": "Notificações",
  "/perfil": "O Meu Perfil",
  "/banco": "Homebanking & Carteira Digital",
  "/fiscal": "Portal das Finanças & Segurança Social",
  "/contabilidade": "Contabilista Virtual & Fecho de Contas",
  "/diario": "Diário Universal & Produtividade",
  "/agenda": "Agenda Universal & Rotinas",
  "/aprovacoes": "Centro de Aprovações",
  "/dispositivos": "Dispositivos & Sincronização",
  "/clientes": "Gestão de Clientes",
  "/empresas": "Gestão de Empresas",
  "/obras": "Obras & Projetos",
  "/orcamentos": "Orçamentos",
  "/faturacao": "Faturação & Financeiro (SAF-T)",
  "/guias": "Guias de Transporte (AT)",
  "/planos": "Planos de Subscrição",
  "/documentos": "Gestão Documental",
  "/ia": "Assistente Inteligente RPG-OS",
  "/integracoes": "Integrações Oficiais Portuguesas",
  "/rgpd": "Privacidade & Conformidade RGPD",
  "/auditoria": "Registo de Auditoria",
  "/registo": "Novo Registo",
};

export interface TopbarUser {
  name: string;
  email: string;
  organizationName?: string;
  organizations?: Array<{ id: string; name: string }>;
}

export default function Topbar({ user }: { user: TopbarUser | null }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /* Drawer mobile — toggle da classe "body-nav-open" no <body> (o CSS
   * globals.css l.498-526 reage a essa classe). Close também em
   * pathname-change (useEffect abaixo). */
  const toggleMobileNav = useCallback(() => {
    setMobileNavOpen((open) => {
      document.body.classList.toggle("body-nav-open");
      return !open;
    });
  }, []);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    document.body.classList.remove("body-nav-open");
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.notifications) {
          setUnreadCount(
            json.notifications.filter(
              (n: { read_at: string | null }) => !n.read_at,
            ).length,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  if (pathname === "/login" || pathname === "/recuperar-senha") {
    return null;
  }

  const initials = user
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <>
      <CommandPalette />
      <header className="topbar">
        <button
          type="button"
          className="topbar-menu-btn"
          onClick={toggleMobileNav}
          aria-label={mobileNavOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileNavOpen}
        >
          ☰
        </button>

        <div>
          <span className="topbar-eyebrow">
            RPG-OS{user?.organizationName ? ` • ${user.organizationName}` : ""}
          </span>
          <h1>{titles[pathname] ?? "RPG-OS"}</h1>
          {user?.organizations && user.organizations.length > 0 && <form action={async (formData) => { await switchOrganizationAction(formData); window.location.reload(); }} style={{ marginTop: 6 }}><select name="organization_id" defaultValue={user.organizations.find((org) => org.name === user.organizationName)?.id} onChange={(event) => event.currentTarget.form?.requestSubmit()} aria-label="Organização ativa">{user.organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></form>}
        </div>

        <div className="topbar-user">
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
              )
            }
            className="button secondary"
            aria-label="Abrir pesquisa universal"
            style={{ fontSize: "12px", padding: "6px 12px" }}
            title="Pesquisa universal (Ctrl+K)"
          >
            🔍 Pesquisar{" "}
            <kbd style={{ fontSize: "10px", opacity: 0.7 }}>Ctrl+K</kbd>
          </button>

          {user && (
            <>
              <Link
                href="/notificacoes"
                aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
                style={{
                  position: "relative",
                  fontSize: "18px",
                  textDecoration: "none",
                }}
              >
                🔔
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-8px",
                      background: "#dc2626",
                      color: "white",
                      borderRadius: "999px",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 5px",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>

              <div className="avatar">{initials}</div>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <form action={signOutAction} style={{ marginLeft: "12px" }}>
                <button
                  type="submit"
                  className="button secondary"
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                >
                  Sair
                </button>
              </form>
            </>
          )}
          {!user && (
            <Link
              href="/login"
              className="button"
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >
              Iniciar sessão
            </Link>
          )}
        </div>
      </header>

      <div
        className="nav-backdrop"
        onClick={closeMobileNav}
        aria-hidden="true"
      />
    </>
  );
}
