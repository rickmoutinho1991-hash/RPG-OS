"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SaasPlanDefinition } from "@rpg/core";

export function PaymentCheckoutModal({
  plan,
  interval,
  onClose,
}: {
  plan: SaasPlanDefinition;
  interval: "MONTHLY" | "ANNUAL" | "DAILY" | "WEEKLY";
  onClose: () => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"MBWAY" | "MULTIBANCO" | "QR_CODE" | "CARD">("MBWAY");

  const [phone, setPhone] = useState("912345678");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const price =
    interval === "DAILY"
      ? (plan.dailyPrice || 1.5)
      : interval === "WEEKLY"
        ? (plan.weeklyPrice || 4.9)
        : interval === "ANNUAL"
          ? plan.annualPrice
          : plan.monthlyPrice;


  async function handleConfirmPayment(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessing(true);

    // Simulação do processamento SIBS / MBWay seguro
    setTimeout(() => {
      setIsProcessing(false);
      setPaymentSuccess(true);
    }, 1200);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "520px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "white",
          borderRadius: "16px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          position: "relative",
          padding: "24px",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "#64748b",
          }}
        >
          ✕
        </button>

        <div style={{ marginBottom: "16px" }}>
          <span className="tag-badge" style={{ background: "#dbeafe", color: "#1e40af" }}>
            {plan.badge || "Subscrição RPG-OS"}
          </span>
          <h2 style={{ margin: "8px 0 4px", fontSize: "20px" }}>Ativar {plan.name}</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Total a liquidar: <strong style={{ fontSize: "18px", color: "#0f172a" }}>€{price.toFixed(2)}</strong> ({interval === "DAILY" ? "Passe 24h" : interval === "WEEKLY" ? "Passe 7 Dias" : interval === "ANNUAL" ? "Faturação Anual" : "Faturação Mensal"})
          </p>
        </div>

        {paymentSuccess ? (
          <div style={{ textAlign: "center", padding: "24px 8px" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎉</div>
            <h3 style={{ margin: "0 0 8px", color: "#15803d" }}>Pagamento Confirmado!</h3>
            <p style={{ fontSize: "13px", color: "#475569", marginBottom: "20px" }}>
              A sua subscrição do <strong>{plan.name}</strong> foi ativada com sucesso. Fatura com NIF e comprovativo emitidos automaticamente.
            </p>
            <button
              type="button"
              className="button"
              style={{ width: "100%" }}
              onClick={() => {
                onClose();
                router.push("/dashboard");
              }}
            >
              Aceder ao Painel de Controlo →
            </button>
          </div>
        ) : (
          <div>
            {/* Seletor de Métodos Portugueses */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                className={`button secondary ${method === "MBWAY" ? "active" : ""}`}
                onClick={() => setMethod("MBWAY")}
                style={{ fontSize: "11px", padding: "8px 4px", textAlign: "center", fontWeight: 700 }}
              >
                📱 MBWay
              </button>
              <button
                type="button"
                className={`button secondary ${method === "MULTIBANCO" ? "active" : ""}`}
                onClick={() => setMethod("MULTIBANCO")}
                style={{ fontSize: "11px", padding: "8px 4px", textAlign: "center", fontWeight: 700 }}
              >
                🏧 Multibanco
              </button>
              <button
                type="button"
                className={`button secondary ${method === "QR_CODE" ? "active" : ""}`}
                onClick={() => setMethod("QR_CODE")}
                style={{ fontSize: "11px", padding: "8px 4px", textAlign: "center", fontWeight: 700 }}
              >
                📷 QR Code
              </button>
              <button
                type="button"
                className={`button secondary ${method === "CARD" ? "active" : ""}`}
                onClick={() => setMethod("CARD")}
                style={{ fontSize: "11px", padding: "8px 4px", textAlign: "center", fontWeight: 700 }}
              >
                💳 Cartão
              </button>
            </div>

            {/* Método MBWay */}
            {method === "MBWAY" && (
              <form onSubmit={handleConfirmPayment}>
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", marginBottom: "14px", border: "1px solid var(--border)", fontSize: "12px", color: "#334155" }}>
                  <strong>Gateway Seguro SIBS / MBWay:</strong><br />
                  O pedido de autorização de <strong>€{price.toFixed(2)}</strong> será enviado diretamente para a aplicação MBWay associada ao seu telemóvel.
                  <div style={{ marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                    • Entidade recetora: RPG-OS Merchant Services (Canal Oficial Seguro)
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="mbway_phone">Número de Telemóvel MBWay (+351) *</label>
                  <input
                    id="mbway_phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="912 345 678"
                  />
                </div>

                <button type="submit" className="button" style={{ width: "100%", marginTop: "12px" }} disabled={isProcessing}>
                  {isProcessing ? "A enviar notificação MBWay..." : `Pagar €${price.toFixed(2)} por MBWay`}
                </button>
              </form>
            )}

            {/* Método Multibanco */}
            {method === "MULTIBANCO" && (
              <div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid var(--border)", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>Entidade:</span>
                    <strong style={{ fontSize: "15px", fontFamily: "monospace" }}>21550</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>Referência:</span>
                    <strong style={{ fontSize: "15px", fontFamily: "monospace", letterSpacing: "1px" }}>923 084 411</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>Montante:</span>
                    <strong style={{ fontSize: "16px", color: "#15803d" }}>€{price.toFixed(2)}</strong>
                  </div>
                </div>
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 16px" }}>
                  Pode pagar através do Homebanking (Pagamento de Serviços / Compras) ou em qualquer caixa da rede Multibanco.
                </p>
                <button
                  type="button"
                  className="button"
                  style={{ width: "100%" }}
                  onClick={() => setPaymentSuccess(true)}
                >
                  Já Efetuei o Pagamento Multibanco
                </button>
              </div>
            )}

            {/* Método QR Code */}
            {method === "QR_CODE" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px dashed #cbd5e1", display: "inline-block", margin: "8px 0 14px" }}>
                  {/* SVG Ilustrativo de QR Code Instantâneo SIBS / MBWay */}
                  <svg width="150" height="150" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100" height="100" fill="white" />
                    <rect x="10" y="10" width="25" height="25" fill="#0f172a" />
                    <rect x="15" y="15" width="15" height="15" fill="white" />
                    <rect x="18" y="18" width="9" height="9" fill="#0f172a" />
                    <rect x="65" y="10" width="25" height="25" fill="#0f172a" />
                    <rect x="70" y="15" width="15" height="15" fill="white" />
                    <rect x="73" y="18" width="9" height="9" fill="#0f172a" />
                    <rect x="10" y="65" width="25" height="25" fill="#0f172a" />
                    <rect x="15" y="70" width="15" height="15" fill="white" />
                    <rect x="18" y="73" width="9" height="9" fill="#0f172a" />
                    <rect x="42" y="15" width="8" height="8" fill="#0f172a" />
                    <rect x="45" y="30" width="12" height="12" fill="#2563eb" />
                    <rect x="65" y="45" width="10" height="10" fill="#0f172a" />
                    <rect x="42" y="65" width="14" height="14" fill="#0f172a" />
                    <rect x="65" y="65" width="20" height="20" fill="#0f172a" />
                  </svg>
                </div>
                <p style={{ fontSize: "12px", color: "#334155", margin: "0 0 14px" }}>
                  Abra a app do seu banco ou MBWay, selecione <strong>&quot;Ler QR Code&quot;</strong> e aponte para o código acima para autorizar o valor de <strong>€{price.toFixed(2)}</strong>.
                </p>
                <button
                  type="button"
                  className="button"
                  style={{ width: "100%" }}
                  onClick={() => setPaymentSuccess(true)}
                >
                  Confirmar Leitura do QR Code
                </button>
              </div>
            )}

            {/* Método Cartão / Débito Direto */}
            {method === "CARD" && (
              <form onSubmit={handleConfirmPayment}>
                <div className="form-field">
                  <label>Número do Cartão de Débito / Crédito</label>
                  <input placeholder="4532 •••• •••• 8901" required maxLength={19} />
                </div>
                <div className="grid-2">
                  <div className="form-field">
                    <label>Validade (MM/AA)</label>
                    <input placeholder="12/28" required maxLength={5} />
                  </div>
                  <div className="form-field">
                    <label>CVC / CVV</label>
                    <input placeholder="123" required maxLength={4} />
                  </div>
                </div>
                <button type="submit" className="button" style={{ width: "100%", marginTop: "10px" }} disabled={isProcessing}>
                  {isProcessing ? "A validar cartão..." : `Pagar €${price.toFixed(2)} com Cartão`}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
