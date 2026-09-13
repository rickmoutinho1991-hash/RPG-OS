import Link from "next/link";

export function PublicCTA() {
  return (
    <section className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
      <h3 style={{ margin: "0 0 8px" }}>
        O mercado começa antes do anúncio
      </h3>
      <p
        style={{
          color: "var(--muted)",
          maxWidth: "560px",
          margin: "0 auto 20px",
          fontSize: "13px",
        }}
      >
        Crie a sua conta e veja como um pedido se transforma em propostas,
        contrato, evidência e pagamento — sempre com a sua informação sob
        controlo.
      </p>
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/login" className="button">
          Entrar no RPG-OS
        </Link>
        <Link href="/registo" className="button secondary">
          Criar conta gratuita
        </Link>
      </div>
    </section>
  );
}