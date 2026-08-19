export default function IndividualRegistoPage() {
  return (
    <main>
      <h1>Registo — Trabalhador independente</h1>

      <form>
        <label>
          Nome completo
          <input name="nome" required />
        </label>

        <label>
          NIF
          <input name="nif" inputMode="numeric" required />
        </label>

        <label>
          Email
          <input name="email" type="email" required />
        </label>

        <label>
          Telefone
          <input name="telefone" required />
        </label>

        <label>
          Morada profissional
          <input name="morada" required />
        </label>

        <label>
          Atividade profissional
          <input name="atividade" required />
        </label>

        <button type="submit">
          Continuar
        </button>
      </form>
    </main>
  );
}
