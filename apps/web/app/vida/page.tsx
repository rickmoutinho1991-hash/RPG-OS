import Link from "next/link";
import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { getVidaModel } from "@/lib/vida/lifeAggregation";
import { LifeAttention } from "@/components/vida/LifeAttention";
import { VidaTodaySection, LifeTimeline } from "@/components/vida/VidaTodayTimeline";
import { LifeDomains } from "@/components/vida/LifeDomains";

export const dynamic = "force-dynamic";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 20) return "Boa tarde";
  return "Boa noite";
}

/**
 * A MINHA VIDA — Personal Operating System, action-first.
 * Fluxo: contexto → atenção → ações → timeline → domínios.
 * Sem dashboard, sem KPI wall, sem dados fake.
 */
export default async function VidaPage() {
  // Mesmo padrão das restantes páginas (tarefas, conhecimento, operações):
  // sessão → permissão → só depois aggregation (que revalida server-side).
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
          A MINHA VIDA
        </p>
        <h1 style={{ margin: "0 0 8px" }}>A Minha Vida</h1>
        <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 12px" }}>Inicia sessão para veres a tua vida aqui.</p>
          <Link href="/login" className="button">
            Entrar
          </Link>
        </div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "vida.view")) {
    return (
      <main>
        <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
          A MINHA VIDA
        </p>
        <h1 style={{ margin: "0 0 8px" }}>A Minha Vida</h1>
        <div className="card">
          Não tem permissão para aceder a A Minha Vida. Contacte a administração
          da organização.
        </div>
      </main>
    );
  }

  const model = await getVidaModel();

  if (!model) {
    return (
      <main>
        <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
          A MINHA VIDA
        </p>
        <h1 style={{ margin: "0 0 8px" }}>A Minha Vida</h1>
        <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 12px" }}>Inicia sessão para veres a tua vida aqui.</p>
          <Link href="/login" className="button">
            Entrar
          </Link>
        </div>
      </main>
    );
  }

  const { name, result, today, todayError } = model;
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const attentionCount = Math.min(result.items.length, 999);
  const contextual =
    result.items.length === 0
      ? null
      : attentionCount === 1
        ? "Tens 1 assunto que merece atenção."
        : `Tens ${attentionCount} assuntos que merecem atenção.`;
  const partial = result.errors.length > 0 || todayError;

  return (
    <main style={{ maxWidth: "760px" }}>
      {/* CONTEXTO */}
      <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
        A MINHA VIDA
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: "clamp(24px, 4vw, 32px)" }}>
        {greeting}{name ? `, ${name}` : ""}.
      </h1>
      {contextual && (
        <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>{contextual}</p>
      )}
      {!contextual && <div style={{ height: "20px" }} aria-hidden="true" />}

      {partial && (
        <div
          className="card"
          role="status"
          style={{ borderLeft: "4px solid #d97706", marginBottom: "20px" }}
        >
          <p style={{ margin: "0 0 8px", fontSize: "14px" }}>
            Alguns serviços não estão disponíveis neste momento.
          </p>
          <Link href="/vida" className="button secondary" style={{ fontSize: "12px" }}>
            Tentar novamente
          </Link>
        </div>
      )}

      {/* ATENÇÃO → AÇÕES */}
      <div style={{ marginBottom: "28px" }}>
        <LifeAttention items={result.items} />
      </div>

      {/* HOJE */}
      <div style={{ marginBottom: "28px" }}>
        <VidaTodaySection today={today} todayError={todayError} lifeEvents={result.events} />
      </div>

      {/* TIMELINE */}
      <div style={{ marginBottom: "28px" }}>
        <LifeTimeline events={result.events} />
      </div>

      {/* DOMÍNIOS */}
      <LifeDomains statuses={result.domainStatuses} />
    </main>
  );
}
