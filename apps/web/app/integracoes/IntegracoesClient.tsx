"use client";

import { useState } from "react";

export function IntegracoesClient() {
  const [nifInput, setNifInput] = useState("501234567");
  const [nifResult, setNifResult] = useState<any>(null);
  const [isCheckingNif, setIsCheckingNif] = useState(false);

  const [mbwayPhone, setMbwayPhone] = useState("912345678");
  const [mbwayAmount, setMbwayAmount] = useState("49.00");
  const [mbwayResult, setMbwayResult] = useState<any>(null);
  const [isProcessingMbway, setIsProcessingMbway] = useState(false);

  async function handleValidateNif(e: React.FormEvent) {
    e.preventDefault();
    setIsCheckingNif(true);
    setNifResult(null);

    try {
      const res = await fetch("/api/at/validate-nif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nif: nifInput }),
      });
      const data = await res.json();
      setNifResult(data);
    } catch {
      setNifResult({
        valid: false,
        error: "Falha na comunicação com o serviço AT.",
      });
    } finally {
      setIsCheckingNif(false);
    }
  }

  async function handleTestMbway(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessingMbway(true);
    setMbwayResult(null);

    try {
      const res = await fetch("/api/sibs/mbway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: mbwayPhone,
          amount: parseFloat(mbwayAmount),
          invoiceId: "FT-TEST-001",
          description: "Subscrição RPG-OS",
        }),
      });
      const data = await res.json();
      setMbwayResult(data);
    } catch {
      setMbwayResult({ success: false, error: "Falha no gateway SIBS." });
    } finally {
      setIsProcessingMbway(false);
    }
  }

  return (
    <div>
      <div className="grid-2">
        {/* Autenticação.gov & Chave Móvel Digital */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>🏛️ AMA • Autenticação.gov</h3>
            <span className="badge success">Conectado (Sandbox)</span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Identificação digital oficial com{" "}
            <strong>Chave Móvel Digital</strong> e{" "}
            <strong>Cartão de Cidadão</strong> para login seguro e validação de
            representantes legais.
          </p>
          <div
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#334155",
              border: "1px solid var(--border)",
            }}
          >
            ✓ Endpoint OAuth: <code>https://autenticacao.gov.pt/oauth/ask</code>
            <br />
            ✓ Validação de NIF e Nome Civil do Cidadão
            <br />✓ Callback configurado em <code>/api/auth/callback/cmd</code>
          </div>
        </div>

        {/* Autoridade Tributária & Aduaneira */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>
              📑 AT • Autoridade Tributária & e-Fatura
            </h3>
            <span className="badge">Preparação</span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Comunicação de faturas e guias de transporte (Dec.-Lei 147/2003),
            geração de ATCUD e exportação SAF-T (PT).
          </p>
          <div
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#334155",
              border: "1px solid var(--border)",
            }}
          >
            ○ Webservice e-Fatura ainda sem integração oficial (preparado, sem comunicar com a AT)
            <br />
            ✓ Formato SAF-T (PT) XML Schema v1.04_01 certificado
            <br />✓ Código AT Doc Code para circulação de mercadorias
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        {/* Validador local de formato de NIF (sem consulta AT) */}
        <div className="card">
          <h3>🔍 Validação local de formato de NIF / NIPC</h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Verifica apenas o formato (dígito de controlo). Não consulta a
            Autoridade Tributária.
          </p>
          <form
            onSubmit={handleValidateNif}
            style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}
          >
            <div className="form-field" style={{ flex: 1, margin: 0 }}>
              <label>NIF ou NIPC</label>
              <input
                value={nifInput}
                onChange={(e) => setNifInput(e.target.value)}
                placeholder="Ex: 501234567"
                required
              />
            </div>
            <button type="submit" className="button" disabled={isCheckingNif}>
              {isCheckingNif ? "A verificar..." : "Validar NIF"}
            </button>
          </form>

          {nifResult && (
            <div
              className={`alert ${nifResult.valid ? "alert-success" : "alert-danger"}`}
              style={{ marginTop: "16px" }}
            >
              {nifResult.valid ? (
                <div>
                  <strong>✓ Formato de NIF válido (validação local).</strong>
                  <br />
                  <span style={{ fontSize: "12px" }}>
                    NIF: {nifResult.taxNumber} • Sem consulta à Autoridade
                    Tributária: a confirmação oficial faz-se no Portal das
                    Finanças.
                  </span>
                </div>
              ) : (
                <span>
                  O NIF introduzido tem formato inválido (validação local de
                  formato, sem consulta à AT).
                </span>
              )}
            </div>
          )}
        </div>

        {/* SIBS Multibanco & MBWay */}
        <div className="card">
          <h3>💳 SIBS Pagamentos (Multibanco & MBWay)</h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Geração de referências Multibanco com entidade/referência e emissão
            de notificações de pagamento instantâneo MBWay.
          </p>
          <form onSubmit={handleTestMbway}>
            <div className="form-grid">
              <div className="form-field">
                <label>Telemóvel MBWay (+351)</label>
                <input
                  value={mbwayPhone}
                  onChange={(e) => setMbwayPhone(e.target.value)}
                  placeholder="912345678"
                  required
                />
              </div>
              <div className="form-field">
                <label>Montante (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={mbwayAmount}
                  onChange={(e) => setMbwayAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="button secondary"
              disabled={isProcessingMbway}
              style={{ marginTop: "10px" }}
            >
              {isProcessingMbway
                ? "A enviar pedido..."
                : "Simular Pedido MBWay"}
            </button>
          </form>

          {mbwayResult && (
            <div
              className={`alert ${mbwayResult.success ? "alert-success" : "alert-danger"}`}
              style={{ marginTop: "16px" }}
            >
              {mbwayResult.success ? (
                <>
                  <strong>Pedido MBWay transmitido com sucesso!</strong>
                  <br />
                  <span style={{ fontSize: "12px" }}>
                    ID: {mbwayResult.paymentId} • Montante: €
                    {mbwayResult.amount?.toFixed(2)} • Expira em:{" "}
                    {mbwayResult.expiresInMinutes || 5} min
                  </span>
                </>
              ) : (
                <span>
                  Pagamento MB WAY indisponível: ainda sem integração oficial
                  SIBS. Nenhum pagamento foi executado.
                  {mbwayResult.message ? ` ${mbwayResult.message}` : ""}
                  {mbwayResult.error ? ` ${mbwayResult.error}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
