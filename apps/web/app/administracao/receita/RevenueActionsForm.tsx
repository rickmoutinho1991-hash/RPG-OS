"use client";

import { useState } from "react";
import { REVENUE_PLAN_IDS } from "@rpg/core";
import {
  recordPaymentAction,
  recordRefundAction,
  upsertSubscriptionAction,
  cancelSubscriptionAction,
} from "./actions";

export default function RevenueActionsForm() {
  const [plan, setPlan] = useState("PRO");
  const [euros, setEuros] = useState("100");
  const [ledgerId, setLedgerId] = useState("");
  const [refundEuros, setRefundEuros] = useState("");
  const [state, setState] = useState<{ loading: boolean; msg?: string; err?: string }>(
    { loading: false },
  );

  async function onSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true, msg: undefined, err: undefined });
    const cents = Math.round((Number(euros) || 0) * 100);
    const r = await recordPaymentAction({
      grossCents: cents,
      planId: plan as never,
      origin: "USER",
    });
    setState({
      loading: false,
      msg: r.ok ? `Pagamento registado (ledger ${r.ledgerEntryId})` : undefined,
      err: r.ok ? undefined : r.error,
    });
  }

  async function onSubmitRefund(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true, msg: undefined, err: undefined });
    const cents = Math.round((Number(refundEuros) || 0) * 100);
    const r = await recordRefundAction({
      ledgerEntryId: ledgerId,
      refundCents: cents,
      type: "REFUND",
      origin: "ADMIN",
      reason: "Teste de reembolso (sandbox QA).",
    });
    setState({
      loading: false,
      msg: r.ok ? "Reembolso registado." : undefined,
      err: r.ok ? undefined : r.error,
    });
  }

  async function onSubmitSubscription(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true, msg: undefined, err: undefined });
    const r = await upsertSubscriptionAction({ planId: plan as never, origin: "USER" });
    setState({
      loading: false,
      msg: r.ok ? `Subscrição guardada (${r.subscriptionId})` : undefined,
      err: r.ok ? undefined : r.error,
    });
  }

  async function onCancelSubscription() {
    setState({ loading: true, msg: undefined, err: undefined });
    const r = await cancelSubscriptionAction({ origin: "ADMIN", reason: "QA cleanup" });
    setState({
      loading: false,
      msg: r.ok ? "Subscrição cancelada." : undefined,
      err: r.ok ? undefined : r.error,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="block text-sm font-medium">Plano</label>
        <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {REVENUE_PLAN_IDS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={onSubmitPayment} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium">Valor (€)</label>
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={euros}
            onChange={(e) => setEuros(e.target.value)}
          />
        </div>
        <button type="submit" className="button" disabled={state.loading}>
          Registrar pagamento
        </button>
      </form>

      <form onSubmit={onSubmitRefund} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium">Ledger ID</label>
          <input
            className="input"
            value={ledgerId}
            onChange={(e) => setLedgerId(e.target.value)}
            placeholder="uuid da entrada"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Refund (€)</label>
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={refundEuros}
            onChange={(e) => setRefundEuros(e.target.value)}
          />
        </div>
        <button type="submit" className="button secondary" disabled={state.loading}>
          Registrar reembolso
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="button" onClick={onSubmitSubscription} disabled={state.loading}>
          Guardar subscrição ({plan})
        </button>
        <button type="button" className="button secondary" onClick={onCancelSubscription} disabled={state.loading}>
          Cancelar subscrição
        </button>
      </div>

      {state.err && <p className="text-sm text-destructive">{state.err}</p>}
      {state.msg && <p className="text-sm text-emerald-700">{state.msg}</p>}
    </div>
  );
}
