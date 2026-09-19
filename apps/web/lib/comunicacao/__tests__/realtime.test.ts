import { describe, it, expect } from "vitest";
import {
  isMemberOfChannel,
  realtimeChannelKey,
  realtimeInsertFilter,
  shouldSubscribeRealtime,
} from "../realtime";

describe("comms realtime helpers (vaga realtime)", () => {
  it("chave realtime estável e distinta por canal", () => {
    expect(realtimeChannelKey("abc")).toBe("comms:abc");
    expect(realtimeChannelKey("abc")).toBe(realtimeChannelKey("abc"));
    expect(realtimeChannelKey("abc")).not.toBe(realtimeChannelKey("abd"));
  });

  it("filtro de inserção direcionado ao canal ativo", () => {
    expect(realtimeInsertFilter("chan-1")).toBe("channel_id=eq.chan-1");
    expect(realtimeInsertFilter("x")).toMatch(/^channel_id=eq\./);
  });

  it("subscreve apenas quando membro do canal", () => {
    expect(shouldSubscribeRealtime("c1", ["c1", "c2"])).toBe(true);
    expect(shouldSubscribeRealtime("c3", ["c1", "c2"])).toBe(false);
    expect(shouldSubscribeRealtime("c1", new Set(["c1"]))).toBe(true);
    expect(shouldSubscribeRealtime("", ["c1"])).toBe(false);
  });

  it("ids nulos não contam como pertença", () => {
    expect(isMemberOfChannel(null, ["a"])).toBe(false);
    expect(isMemberOfChannel(undefined, ["a"])).toBe(false);
    expect(isMemberOfChannel("a", [null, "a"])).toBe(true);
    expect(isMemberOfChannel("a", new Set(["a"]))).toBe(true);
    expect(isMemberOfChannel("b", new Set(["a"]))).toBe(false);
  });

  it("compara pertença por referência, sem mutar entrada", () => {
    const ids = ["c1", "c2"];
    const snapshot = [...ids];
    shouldSubscribeRealtime("c1", ids);
    expect(ids).toEqual(snapshot);
  });
});