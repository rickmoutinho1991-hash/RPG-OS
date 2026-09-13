import { describe, it, expect } from "vitest";
import {
  createPendingLedgerLine,
  applyLedgerCollect,
  applyLedgerFail,
  applyLedgerRefund,
  applyLedgerReversal,
  canTransitionLedger,
  isTerminalLedgerStatus,
  totalCollectedFee,
  type LedgerLine,
} from "../../revenue";

function baseLine(): LedgerLine {
  return createPendingLedgerLine({
    id: "t1",
    organizationId: "orgA",
    companyId: "compA",
    grossCents: 100000,
    feeCents: 2500,
    netCents: 97500,
    basisPoints: 250,
  });
}

describe("Revenue Ledger state machine (7E)", () => {
  it("transições válidas segundopágina", () => {
    expect(canTransitionLedger("PENDING", "COLLECTED")).toBe(true);
    expect(canTransitionLedger("PENDING", "FAILED")).toBe(true);
    expect(canTransitionLedger("PENDING", "REVERSED")).toBe(true);
    expect(canTransitionLedger("COLLECTED", "REFUNDED")).toBe(true);
    expect(canTransitionLedger("COLLECTED", "PARTIALLY_REFUNDED")).toBe(true);
    expect(canTransitionLedger("PARTIALLY_REFUNDED", "REFUNDED")).toBe(true);
  });

  it("estados terminais não aceitam transições", () => {
    expect(canTransitionLedger("FAILED", "COLLECTED")).toBe(false);
    expect(canTransitionLedger("REFUNDED", "COLLECTED")).toBe(false);
    expect(canTransitionLedger("REVERSED", "COLLECTED")).toBe(false);
    expect(isTerminalLedgerStatus("FAILED")).toBe(true);
    expect(isTerminalLedgerStatus("REFUNDED")).toBe(true);
    expect(isTerminalLedgerStatus("REVERSED")).toBe(true);
    expect(isTerminalLedgerStatus("COLLECTED")).toBe(false);
  });

  it("collect transforma PENDING em COLLECTED com snapshots intactos", () => {
    const r = applyLedgerCollect(baseLine());
    expect(r.ok).toBe(true);
    if (r.ok && r.line) expect(r.line.status).toBe("COLLECTED");
  });

  it("fail zera fee/líquido (nenhuma receita recolhida)", () => {
    const r = applyLedgerFail(baseLine());
    expect(r.ok).toBe(true);
    if (r.ok && r.line) {
      expect(r.line.status).toBe("FAILED");
      expect(r.line.feeCents).toBe(0);
      expect(r.line.netCents).toBe(0);
    }
  });

  it("não recolhe a partir de estado não-PENDING", () => {
    const collected = applyLedgerCollect(baseLine());
    if (collected.ok && collected.line) {
      const r = applyLedgerCollect(collected.line);
      expect(r.ok).toBe(false);
    }
  });
});

describe("Revenue Ledger refunds (7F)", () => {
  it("refund total devolve toda a fee e marca REFUNDED", () => {
    const collected = applyLedgerCollect(baseLine());
    const line = collected.ok && collected.line ? collected.line : baseLine();
    const r = applyLedgerRefund(line, 100000, "devolução total");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line?.status).toBe("REFUNDED");
      expect(r.line?.feeRefundedCents).toBe(2500);
      expect(r.feeToRefundCents).toBe(2500);
    }
  });

  it("refund parcial marca PARTIALLY_REFUNDED", () => {
    const collected = applyLedgerCollect(baseLine());
    const line = collected.ok && collected.line ? collected.line : baseLine();
    const r = applyLedgerRefund(line, 50000); // metade do bruto
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line?.status).toBe("PARTIALLY_REFUNDED");
      expect(r.feeToRefundCents).toBe(1250);
    }
  });

  it("refund de PENDING (não recolhido) é rejeitado", () => {
    const r = applyLedgerRefund(baseLine(), 100000);
    expect(r.ok).toBe(false);
  });

  it("reversão administrativa zera a receita", () => {
    const collected = applyLedgerCollect(baseLine());
    const line = collected.ok && collected.line ? collected.line : baseLine();
    const r = applyLedgerReversal(line, "duplicado");
    expect(r.ok).toBe(true);
    if (r.ok && r.line) {
      expect(r.line.status).toBe("REVERSED");
      expect(r.line.netCents).toBe(0);
      expect(r.line.feeRefundedCents).toBe(2500);
    }
  });

  it("totalCollectedFee soma apenas receita retida", () => {
    const a = applyLedgerCollect(baseLine());
    const aLine = a.ok && a.line ? a.line : baseLine();
    const b = applyLedgerCollect(
      createPendingLedgerLine({
        id: "t2",
        organizationId: "orgA",
        grossCents: 50000,
        feeCents: 1000,
        netCents: 49000,
        basisPoints: 200,
      }),
    );
    const bLine = b.ok && b.line ? b.line : baseLine();
    const c = applyLedgerFail(
      createPendingLedgerLine({
        id: "t3",
        organizationId: "orgA",
        grossCents: 100,
        feeCents: 0,
        netCents: 100,
        basisPoints: 0,
      }),
    );
    const cLine = c.ok && c.line ? c.line : baseLine();
    expect(totalCollectedFee([aLine, bLine, cLine])).toBe(3500);
  });
});
