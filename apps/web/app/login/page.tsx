"use client";

import { useState } from "react";
import Link from "next/link";
import {
  loginWithPassword,
  loginWithMagicLink,
  loginWithChaveMovelDirectAction,
  initiateChaveMovelLogin,
  AuthActionResult,
} from "./actions";

export default function LoginPage() {
  const [tab, setTab] = useState<"password" | "magic-link" | "gov">("gov");
  const [state, setState] = useState<AuthActionResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [phoneInput, setPhoneInput] = useState("+351 923 084 411");
  const [pinInput, setPinInput] = useState("••••");

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await loginWithPassword(null, formData);
    if (res) setState(res);
    setIsPending(false);
  }

  async function handleMagicLinkSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await loginWithMagicLink(null, formData);
    setState(res);
    setIsPending(false);
  }

  async function handleCmdSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const res = await loginWithChaveMovelDirectAction(null, formData);
    if (res) setState(res);
    setIsPending(false);
  }


  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand">
            <span className="brand-badge">RPG</span>
            <h2>RPG-OS</h2>
          </div>
          <p className="login-subtitle">
            Sistema Operativo de Gestão Empresarial
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

        <div className="login-tabs">
          <button
            type="button"
            className={`tab-btn ${tab === "password" ? "active" : ""}`}
            onClick={() => setTab("password")}
          >
            Palavra-passe
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "magic-link" ? "active" : ""}`}
            onClick={() => setTab("magic-link")}
          >
            Link Seguro
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "gov" ? "active" : ""}`}
            onClick={() => setTab("gov")}
          >
            Chave Móvel
          </button>
        </div>

        {tab === "password" && (
          <form onSubmit={handlePasswordSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="email">Email profissional ou de acesso</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="exemplo@empresa.pt"
              />
            </div>

            <div className="form-field">
              <div className="field-label-row">
                <label htmlFor="password">Palavra-passe</label>
                <Link href="/recuperar-senha" className="forgot-link">
                  Esqueceu-se?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="button full-width"
              disabled={isPending}
            >
              {isPending ? "A verificar..." : "Entrar no Sistema"}
            </button>
          </form>
        )}

        {tab === "magic-link" && (
          <form onSubmit={handleMagicLinkSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="magic-email">Email registado</label>
              <input
                id="magic-email"
                name="email"
                type="email"
                required
                placeholder="seu.email@empresa.pt"
              />
            </div>

            <p className="help-text">
              Enviaremos um link de autenticação temporário direto para a sua
              caixa de entrada.
            </p>

            <button
              type="submit"
              className="button full-width"
              disabled={isPending}
            >
              {isPending ? "A enviar link..." : "Enviar Hiperligação Segura"}
            </button>
          </form>
        )}

        {tab === "gov" && (
          <form onSubmit={handleCmdSubmit} className="login-form">
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "14px", fontSize: "12px", color: "#334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "16px" }}>🏛️</span>
                <strong>Autenticação.gov • Chave Móvel Digital</strong>
              </div>
              Acesso oficial seguro com o seu número de telemóvel e PIN de 4 dígitos.
            </div>

            <div className="form-field">
              <label htmlFor="phone">Número de Telemóvel (+351)</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+351 923 084 411"
              />
            </div>

            <div className="form-field">
              <label htmlFor="pin">PIN da Chave Móvel Digital (4 dígitos)</label>
              <input
                id="pin"
                name="pin"
                type="password"
                maxLength={6}
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
              />
            </div>

            <button
              type="submit"
              className="button full-width"
              disabled={isPending}
            >
              {isPending ? "A autenticar Chave Móvel..." : "Entrar com Chave Móvel Digital"}
            </button>

            <div style={{ marginTop: "12px", textAlign: "center" }}>
              <Link
                href="/dashboard"
                className="button secondary full-width"
                style={{ fontSize: "12px", padding: "8px" }}
              >
                ⚡ Acesso Imediato ao Painel RPG-OS (Modo Demonstração)
              </Link>
            </div>
          </form>
        )}

        <div className="login-footer">
          <span>Ainda não tem conta no RPG-OS?</span>
          <Link href="/registo" className="signup-link">
            Criar novo registo
          </Link>
        </div>
      </div>
    </div>
  );
}
