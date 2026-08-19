import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-800 p-6">

      <h1 className="text-2xl font-bold text-white mb-8">
        RPG-OS
      </h1>

      <nav className="space-y-3">

        <Link href="/" className="block text-slate-300 hover:text-white">
          Dashboard
        </Link>

        <Link href="/clientes" className="block text-slate-300 hover:text-white">
          Clientes
        </Link>

        <Link href="/obras" className="block text-slate-300 hover:text-white">
          Obras
        </Link>

        <Link href="/orcamentos" className="block text-slate-300 hover:text-white">
          Orçamentos
        </Link>

      </nav>

    </aside>
  );
}