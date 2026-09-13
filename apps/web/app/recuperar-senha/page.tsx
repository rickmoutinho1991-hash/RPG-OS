"use client";

import { useState } from "react";
import Link from "next/link";
import { loginWithMagicLink, AuthActionResult } from "../login/actions";

export default function RecuperarSenhaPage() {
  const [state, setState] = useState<AuthActionResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await loginWithMagicLink(null, formData);
    setState(res);
    setIsPending(false);
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand">
            <span className="brand-badge">RPG</span>
            <h2>Recuperar Acesso</h2>
          </div>
          <p className="login-subtitle">
            Introduza o seu email para redefinir a palavra-passe.
          </p>
        </div>

        {state?.error && (
          <div className="alert alert-danger" role="alert">
            {state.error}
          </div>
        )}

        {state?.success && state?.message && (
          <div className="alert alert-success" role="alert">
            {state.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="recovery-email">Email da sua conta</label>
            <input
              id="recovery-email"
              name="email"
              type="email"
              required
              placeholder="exemplo@empresa.pt"
            />
          </div>

          <button
            type="submit"
            className="button full-width"
            disabled={isPending}
          >
            {isPending ? "A enviar..." : "Enviar Instruções"}
          </button>
        </form>

        <div className="login-footer">
          <Link href="/login" className="signup-link">
            ← Voltar ao início de sessão
          </Link>
        </div>
      </div>
    </div>
  );
}
