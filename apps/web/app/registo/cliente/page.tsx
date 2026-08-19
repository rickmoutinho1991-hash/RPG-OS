export default function ClienteRegistoPage() {
  return (
    <main>
      <h1>Registo — Cliente particular</h1>

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
          Morada
          <input name="morada" required />
        </label>

        <button type="submit">
          Continuar
        </button>
      </form>
    </main>
  );
}
