import Link from "next/link";

export default function RegistoPage() {
  return (
    <main>
      <h1>Criar conta RPG-OS</h1>

      <p>Escolha o tipo de conta que pretende criar.</p>

      <nav>
        <ul>
          <li>
            <Link href="/registo/cliente">
              Cliente particular
            </Link>
          </li>

          <li>
            <Link href="/registo/individual">
              Trabalhador independente / Nome individual
            </Link>
          </li>

          <li>
            <Link href="/registo/empresa">
              Empresa
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
