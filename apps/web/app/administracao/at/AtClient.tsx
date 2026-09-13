"use client";

import { useEffect, useState } from "react";
import {
  createAtConnection,
  listAtConnections,
  revokeAtConnection,
  type AtConnectionView,
  type AtEnvironment,
} from "./actions";
import { provisionAtConnectionCredentials } from "./credentialActions";

const PROVISION_LABELS = [
  ["wfaUsername", "WFA username"],
  ["wfaPassword", "WFA password"],
  ["certificate", "Certificado (PEM)"],
  ["privateKey", "Private key (PEM)"],
  ["chain", "Cadeia CA (PEM, opcional)"],
] as const;

type ProvisionKind = (typeof PROVISION_LABELS)[number][0];

export default function AtClient() {
  const [items, setItems] = useState<AtConnectionView[]>([]);
  const [env, setEnv] = useState<AtEnvironment>("TEST");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [provFields, setProvFields] = useState<Record<string, string>>({});
  const [provBusy, setProvBusy] = useState(false);

  function setProvField(id: string, kind: ProvisionKind, value: string) {
    setProvFields((p) => ({ ...p, [`${id}:${kind}`]: value }));
  }

  function clearProvFields(id: string) {
    setProvFields((p) => {
      const next = { ...p };
      for (const [kind] of PROVISION_LABELS) delete next[`${id}:${kind}`];
      return next;
    });
  }

  async function handleProvision(id: string) {
    setProvBusy(true);
    setMessage(null);
    try {
      const res = await provisionAtConnectionCredentials(id, {
        wfaUsername: provFields[`${id}:wfaUsername`] ?? "",
        wfaPassword: provFields[`${id}:wfaPassword`] ?? "",
        certificatePem: provFields[`${id}:certificate`] ?? "",
        privateKeyPem: provFields[`${id}:privateKey`] ?? "",
        chainPem: (provFields[`${id}:chain`] ?? "").trim() === "" ? null : (provFields[`${id}:chain`] ?? null),
      });
      // Limpar sempre os campos: valores nunca permanecem em state.
      clearProvFields(id);
      if (res.ok) {
        setProvisioningId(null);
        setMessage(
          `Credenciais guardadas no Vault (${(res.provisioned ?? []).length} tipos). Valores nunca apresentados.`,
        );
        setItems(await listAtConnections());
      } else {
        setMessage(`Não foi possível provisionar: ${res.error}`);
      }
    } catch {
      clearProvFields(id);
      setMessage("Não foi possível provisionar (erro inesperado).");
    } finally {
      setProvBusy(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/administracao/at/connections/${id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      setTestResult(
        data.status === "CONNECTED"
          ? "Ligação de teste bem-sucedida (resposta oficial validada)."
          : `Não foi possível validar a ligação (${data.status ?? "erro"}${data.detail ? `: ${data.detail}` : ""}).`,
      );
    } catch {
      setTestResult("Não foi possível validar a ligação (erro de rede).");
    } finally {
      setTestingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listAtConnections()
      .then((data) => {
        if (!cancelled) setItems(data || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm() {
    const res = await createAtConnection(env);
    if (res.ok) {
      setConfirming(false);
      setMessage("Registo de ligação criado. Ligação à AT ainda não estabelecida.");
      setItems(await listAtConnections());
    } else if (res.error === "NO_COMPANY") {
      setMessage(
        "Esta ligação AT é empresarial. O seu perfil não tem uma empresa associada.",
      );
    } else {
      setMessage(`Não foi possível criar: ${res.error}`);
    }
  }

  async function handleRevoke(id: string) {
    const res = await revokeAtConnection(id);
    if (res.ok) {
      setMessage("Ligação revogada.");
      setItems(await listAtConnections());
    } else {
      setMessage(`Não foi possível revogar: ${res.error}`);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <strong>AT TEST — handshake não certificado.</strong>{" "}
        <span style={{ color: "var(--muted)", fontSize: "13px" }}>
          Integração AT em preparação (PREPARED_ONLY). Nenhuma submissão real
          é executada; produção continua desativada.
        </span>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Registo administrativo de ligações fiscais por empresa. Credenciais
        preparadas aqui <strong>não</strong> significam ligação à AT —
        nenhuma comunicação oficial existe nesta fase.
      </p>

      {message && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>Registar ligação AT</h3>
        {!confirming ? (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value as AtEnvironment)}
              className="input"
              aria-label="Ambiente"
            >
              <option value="TEST">Testes</option>
              <option value="PRODUCTION">Produção</option>
            </select>
            <button type="button" className="button" onClick={() => setConfirming(true)}>
              Rever
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
            <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
              Registar ligação AT em ambiente <strong>{env === "TEST" ? "Testes" : "Produção"}</strong>{" "}
              para a empresa do seu perfil. Isto <strong>não</strong> liga à AT.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
              <button type="button" className="button" onClick={handleConfirm}>
                Confirmar registo
              </button>
            </div>
          </div>
        )}
      </div>

      {testResult && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          {testResult}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>Ligações</h3>
        {items.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Sem ligações registadas.</p>
        ) : (
          <div className="list">
            {items.map((c) => (
              <div key={c.id}>
                <div className="list-row">
                  <div>
                    <div className="list-title">
                      AT • {c.environment} • {c.status}
                    </div>
                    <div className="list-subtitle">
                      NIF da empresa • expira: {c.cert_expires_at ?? "—"}
                      {c.refsConfigured.length > 0 &&
                        ` • Vault: ${c.refsConfigured.length}/5 refs`}
                    </div>
                  </div>
                  {c.status !== "REVOKED" && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ fontSize: "12px", padding: "6px 10px" }}
                      onClick={() => handleRevoke(c.id)}
                    >
                      Revogar
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "12px", padding: "6px 10px" }}
                    disabled={testingId === c.id}
                    onClick={() => handleTest(c.id)}
                  >
                    {testingId === c.id ? "A testar…" : "Testar ligação"}
                  </button>
                  {c.status !== "REVOKED" && c.environment === "TEST" && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ fontSize: "12px", padding: "6px 10px" }}
                      onClick={() => setProvisioningId(provisioningId === c.id ? null : c.id)}
                    >
                      Credenciais
                    </button>
                  )}
                </div>
                {provisioningId === c.id && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    <h4 style={{ margin: "0 0 8px" }}>Credenciais AT TEST (guardadas no Vault)</h4>
                    <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 8px" }}>
                      Valores enviados por HTTPS para o servidor e guardados só no Vault.
                      Nunca apresentados, registados ou devolvidos.
                    </p>
                    <div style={{ display: "grid", gap: 8 }}>
                      {PROVISION_LABELS.map(([kind, label]) => (
                        <label key={kind} style={{ fontSize: "12px" }}>
                          {label}
                          {c.refsConfigured.includes(kind) && " ✓ provisionado"}
                          {kind === "wfaUsername" ? (
                            <input
                              type="text"
                              className="input"
                              autoComplete="off"
                              value={provFields[`${c.id}:${kind}`] ?? ""}
                              onChange={(e) => setProvField(c.id, kind, e.target.value)}
                            />
                          ) : kind === "wfaPassword" ? (
                            <input
                              type="password"
                              className="input"
                              autoComplete="new-password"
                              value={provFields[`${c.id}:${kind}`] ?? ""}
                              onChange={(e) => setProvField(c.id, kind, e.target.value)}
                            />
                          ) : (
                            <textarea
                              className="input"
                              rows={3}
                              autoComplete="off"
                              spellCheck={false}
                              value={provFields[`${c.id}:${kind}`] ?? ""}
                              onChange={(e) => setProvField(c.id, kind, e.target.value)}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          clearProvFields(c.id);
                          setProvisioningId(null);
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={provBusy}
                        onClick={() => handleProvision(c.id)}
                      >
                        {provBusy ? "A guardar…" : "Guardar credenciais no Vault"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
