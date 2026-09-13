/**
 * RPG-OS — Fiscal inbox transitions (lógica pura do writer server-side).
 *
 * Prova: só transições válidas são aceites; estados terminais não têm
 * saída; ações desconhecidas/inválidas devolvem null (writer rejeita).
 * Sem I/O, sem dados reais.
 */
import { describe, it, expect } from "vitest";
import {
  resolveFiscalInboxTransition,
  type FiscalInboxStatus,
  type FiscalInboxUserAction,
} from "../fiscalInbox";

describe("resolveFiscalInboxTransition", () => {
  it("UNREAD aceita as 4 ações", () => {
    expect(resolveFiscalInboxTransition("UNREAD", "mark_read")).toBe("READ");
    expect(resolveFiscalInboxTransition("UNREAD", "start_progress")).toBe("IN_PROGRESS");
    expect(resolveFiscalInboxTransition("UNREAD", "resolve")).toBe("RESOLVED");
    expect(resolveFiscalInboxTransition("UNREAD", "dismiss")).toBe("DISMISSED");
  });

  it("READ e ACTION_REQUIRED não voltam a UNREAD", () => {
    const from: FiscalInboxStatus[] = ["READ", "ACTION_REQUIRED"];
    for (const s of from) {
      expect(resolveFiscalInboxTransition(s, "resolve")).toBe("RESOLVED");
      expect(resolveFiscalInboxTransition(s, "dismiss")).toBe("DISMISSED");
    }
    expect(resolveFiscalInboxTransition("READ", "start_progress")).toBe("IN_PROGRESS");
  });

  it("IN_PROGRESS só resolve ou dispensa", () => {
    expect(resolveFiscalInboxTransition("IN_PROGRESS", "resolve")).toBe("RESOLVED");
    expect(resolveFiscalInboxTransition("IN_PROGRESS", "dismiss")).toBe("DISMISSED");
    expect(resolveFiscalInboxTransition("IN_PROGRESS", "mark_read")).toBeNull();
    expect(resolveFiscalInboxTransition("IN_PROGRESS", "start_progress")).toBeNull();
  });

  it("estados terminais não têm saída (RESOLVED/DISMISSED)", () => {
    const actions: FiscalInboxUserAction[] = ["mark_read", "start_progress", "resolve", "dismiss"];
    for (const s of ["RESOLVED", "DISMISSED"] as FiscalInboxStatus[]) {
      for (const a of actions) {
        expect(resolveFiscalInboxTransition(s, a)).toBeNull();
      }
    }
  });

  it("ação inválida devolve null (writer deve rejeitar)", () => {
    expect(
      resolveFiscalInboxTransition("UNREAD", "pay" as unknown as FiscalInboxUserAction),
    ).toBeNull();
    expect(
      resolveFiscalInboxTransition("UNREAD", "submit" as unknown as FiscalInboxUserAction),
    ).toBeNull();
  });
});
