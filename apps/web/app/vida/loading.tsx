/**
 * Loading state da página /vida: skeleton coerente.
 * Nunca mostra "0 assuntos" durante o carregamento.
 */
export default function VidaLoading() {
  return (
    <main style={{ maxWidth: "760px" }} aria-busy="true" aria-label="A carregar A Minha Vida">
      <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
        A MINHA VIDA
      </p>
      <div
        style={{ height: "32px", width: "60%", background: "var(--border)", borderRadius: "6px", marginBottom: "20px" }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card"
          style={{ marginBottom: "12px" }}
          aria-hidden="true"
        >
          <div style={{ height: "14px", width: "70%", background: "var(--border)", borderRadius: "4px", marginBottom: "8px" }} />
          <div style={{ height: "12px", width: "40%", background: "var(--border)", borderRadius: "4px" }} />
        </div>
      ))}
    </main>
  );
}
