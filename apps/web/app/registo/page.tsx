import Link from "next/link";

export default function RegistoPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h2>Novo Registo no RPG-OS</h2>
          <p>Selecione a categoria de entidade que pretende criar na plataforma.</p>
        </div>
      </div>

      <div className="registo-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Link href="/registo/cliente" className="registo-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0 }}>Cliente Particular</h3>
            <span className="tag-badge">B2C</span>
          </div>
          <p>Registo de pessoas singulares com NIF individual, contactos diretos, morada de faturação e consentimentos RGPD.</p>
        </Link>

        <Link href="/registo/empresa" className="registo-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0 }}>Empresa / Sociedade</h3>
            <span className="tag-badge">B2B</span>
          </div>
          <p>Registo de sociedades comerciais (Lda., S.A., Unipessoal) com NIPC, CAE, sede social, dados comerciais e representantes legais.</p>
        </Link>

        <Link href="/registo/eni" className="registo-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0 }}>Empresário Individual (ENI)</h3>
            <span className="tag-badge">ENI / TI</span>
          </div>
          <p>Registo de Empresários em Nome Individual e Trabalhadores Independentes com atividade fiscal aberta nas Finanças.</p>
        </Link>

        <Link href="/registo/individual" className="registo-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0 }}>Profissional / Técnico</h3>
            <span className="tag-badge">Equipa</span>
          </div>
          <p>Registo de encarregados, engenheiros, operacionais ou colaboradores para atribuição e gestão em obras.</p>
        </Link>
      </div>
    </>
  );
}
