import Link from "next/link";
import { getClientesList } from "@/app/clientes/actions";
import { NovaObraForm } from "./NovaObraForm";

export const dynamic = "force-dynamic";

export default async function NovaObraPage({
  searchParams,
}: {
  searchParams?: Promise<{ client_id?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedClientId = resolvedParams.client_id || "";
  const clientes = await getClientesList();

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Nova Obra / Projeto de Construção</h2>
          <p>
            Registo inicial da empreitada, prazos, orçamentação e cliente
            responsável.
          </p>
        </div>
        <Link href="/obras" className="button secondary">
          ← Voltar às Obras
        </Link>
      </div>

      <div className="card form-card">
        {clientes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <div
              className="alert alert-danger"
              role="alert"
              style={{ marginBottom: "20px" }}
            >
              Ainda não existem clientes registados na base de dados. É necessário
              registar um cliente antes de criar uma obra.
            </div>
            <Link href="/registo/cliente" className="button">
              + Registar Primeiro Cliente
            </Link>
          </div>
        ) : (
          <NovaObraForm
            clientes={clientes}
            selectedClientId={selectedClientId}
          />
        )}
      </div>
    </>
  );
}
