import { getSessionContext } from "@/lib/session";
import { getBuiltinRole } from "@rpg/core";
import { MemoryEditor } from "./MemoryEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await getSessionContext();

  if (!ctx) {
    return <main><div className="card">Inicie sessão para ver o seu perfil.</div></main>;
  }

  const roleLabel = ctx.membership
    ? getBuiltinRole(ctx.membership.roleKey)?.label ?? ctx.membership.roleKey
    : "Utilizador individual";

  return (
    <main>
      <span className="topbar-eyebrow">Identidade RPG-OS</span>
      <h1>O Meu Perfil</h1>

      <div className="grid-2" style={{ marginTop: "16px" }}>
        <div className="card">
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            <div className="avatar" style={{ width: "56px", height: "56px", fontSize: "20px" }}>
              {ctx.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{ctx.user.name}</h2>
              <p style={{ color: "var(--muted)", margin: 0, fontSize: "13px" }}>{ctx.user.email}</p>
            </div>
          </div>

          <dl style={{ marginTop: "16px", fontSize: "13px", display: "grid", gap: "6px" }}>
            <div>
              <dt style={{ fontWeight: 700, display: "inline" }}>Cargo atual: </dt>
              <dd style={{ display: "inline", margin: 0 }}>{roleLabel}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 700, display: "inline" }}>Organização ativa: </dt>
              <dd style={{ display: "inline", margin: 0 }}>
                {ctx.organization?.name ?? "Espaço pessoal (sem organização)"}
              </dd>
            </div>
            {ctx.membership?.title && (
              <div>
                <dt style={{ fontWeight: 700, display: "inline" }}>Função: </dt>
                <dd style={{ display: "inline", margin: 0 }}>{ctx.membership.title}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>As minhas organizações</h3>
          {ctx.availableOrganizations.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>
              Ainda não pertence a nenhuma organização. Está a usar o RPG-OS em modo pessoal.
            </p>
          ) : (
            <div className="list">
              {ctx.availableOrganizations.map((org) => (
                <div key={org.id} className="list-row">
                  <div>
                    <div className="list-title"><strong>{org.name}</strong></div>
                    <div className="list-subtitle">{getBuiltinRole(org.roleKey)?.label ?? org.roleKey}</div>
                  </div>
                  {ctx.organization?.id === org.id && <span className="badge success">Ativa</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <h3 style={{ marginTop: 0 }}>As minhas permissões</h3>
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>
          Princípio do menor privilégio — só vê e executa aquilo de que precisa.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(ctx.permissions.includes("*") ? ["* (acesso total)"] : ctx.permissions).map((p) => (
            <span key={p} className="tag-badge" style={{ fontSize: "11px" }}>{p}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <MemoryEditor />
      </div>
    </main>
  );
}
