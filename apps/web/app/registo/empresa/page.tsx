export default function EmpresaRegistoPage() {
  return (
    <main>
      <h1>Registo — Empresa</h1>

      <form>
        <label>
          Denominação social
          <input name="denominacaoSocial" required />
        </label>

        <label>
          Nome comercial
          <input name="nomeComercial" />
        </label>

        <label>
          NIF
          <input name="nif" inputMode="numeric" required />
        </label>

        <label>
          Forma jurídica
          <select name="formaJuridica" required>
            <option value="">Selecionar</option>
            <option value="ENI">Empresário em Nome Individual</option>
            <option value="SOCIEDADE_UNIPESSOAL">
              Sociedade Unipessoal
            </option>
            <option value="LDA">Lda.</option>
            <option value="SA">S.A.</option>
            <option value="OUTRA">Outra</option>
          </select>
        </label>

        <label>
          Número de registo comercial
          <input name="numeroRegistoComercial" />
        </label>

        <label>
          CAE / atividade
          <input name="atividade" required />
        </label>

        <label>
          Morada da sede
          <input name="morada" required />
        </label>

        <label>
          Código postal
          <input name="codigoPostal" required />
        </label>

        <label>
          Cidade
          <input name="cidade" required />
        </label>

        <h2>Representante legal</h2>

        <label>
          Nome do representante
          <input name="representanteNome" required />
        </label>

        <label>
          NIF do representante
          <input name="representanteNif" inputMode="numeric" required />
        </label>

        <label>
          Cargo / qualidade
          <input name="representanteCargo" required />
        </label>

        <h2>Documentação</h2>

        <p>
          Após o preenchimento, serão solicitados os documentos necessários
          para validação da entidade.
        </p>

        <button type="submit">
          Continuar para documentação
        </button>
      </form>
    </main>
  );
}
