import Link from "next/link";

export default function HomePage() {
  return (
    <section className="welcome-panel">
      <p className="eyebrow">Bem-vindo ao RPG-OS</p>

      <h2>O controlo do seu negócio, num só lugar.</h2>

      <p>
        Centralize clientes, obras, orçamentos e tarefas para tomar decisões
        com confiança.
      </p>

      <Link className="button button-primary" href="/dashboard">
        Entrar no dashboard →
      </Link>
    </section>
  );
}