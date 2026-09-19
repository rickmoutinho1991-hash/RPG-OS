import { describe, it, expect } from "vitest";
import {
  buildDmSlug,
  channelDisplayName,
  extractMentionTokens,
  groupThreads,
  normalizeCommsName,
  resolveMentionIds,
  splitMentionedBody,
  unreadSinceCount,
} from "@/lib/comunicacao/helpers";

const MEMBERS = [
  { user_id: "aaa", name: "Maria Silva" },
  { user_id: "bbb", name: "João Pereira" },
  { user_id: "ccc", name: "Maria Silva" },
  { user_id: "ddd", name: null },
];

describe("comunicacao — mensagens diretas, menções, threads e não-lidos (M-E)", () => {
  it("buildDmSlug é determinístico e comutativo (a)", () => {
    expect(buildDmSlug("user-a", "user-b")).toBe(buildDmSlug("user-b", "user-a"));
    expect(buildDmSlug("user-a", "user-b")).toMatch(/^dm-[a-z0-9-]+-[a-z0-9-]+$/);
  });

  it("normaliza nomes/tokens ignorando maiúsculas e acentos (b)", () => {
    expect(normalizeCommsName("José Cunha")).toBe(normalizeCommsName("JOSE cunha"));
    expect(normalizeCommsName("ÃçãÉ")).toBe("acae");
  });

  it("resolve @menções para um único membro e ignora ambíguos/desconhecidos (c)", () => {
    const tokens = extractMentionTokens("Olá @Maria Silva e @João Pereira, e @inexistente");
    expect(tokens).toContain("maria silva e");
    expect(tokens).toContain("joao pereira");
    const ids = resolveMentionIds(tokens, MEMBERS);
    expect(ids).toEqual(["bbb"]);
    expect(ids).not.toContain("aaa");
    expect(ids).not.toContain("ccc");
    // Nome ambíguo (Maria Silva aaa e ccc) nunca gera menção
    expect(resolveMentionIds(["maria silva"], MEMBERS)).toEqual([]);
  });

  it("extrai no máximo 50 tokens de menção únicos (d)", () => {
    const body = Array.from({ length: 80 }, (_, i) => `@nome${i}`).join(" ");
    const tokens = extractMentionTokens(body, 50);
    expect(tokens.length).toBe(50);
  });

  it("channelDisplayName devolve o nome do outro ou fallback 'Conversa' (e)", () => {
    const names = new Map([["bbb", "João Pereira"]]);
    expect(channelDisplayName("aaa", "bbb", names)).toBe("João Pereira");
    expect(channelDisplayName("aaa", "zzz", names)).toBe("Conversa");
    expect(channelDisplayName("aaa", "aaa", names)).toBe("Comigo");
  });

  it("unreadSinceCount conta apenas depois do último read (f)", () => {
    const messages = [
      { id: "1", created_at: "2026-09-01T10:00:00Z" },
      { id: "2", created_at: "2026-09-02T10:00:00Z" },
      { id: "3", created_at: "2026-09-03T10:00:00Z" },
    ];
    expect(unreadSinceCount(messages, "2026-09-02T10:00:00Z")).toBe(1);
    expect(unreadSinceCount(messages, null)).toBe(3);
  });

  it("groupThreads separa raízes, respostas e órfãs (g)", () => {
    const messages = [
      { id: "r1", thread_root_id: null },
      { id: "r2", thread_root_id: null },
      { id: "t1", thread_root_id: "r1" },
      { id: "t2", thread_root_id: "r1" },
      { id: "t3", thread_root_id: "dead" },
    ];
    const { roots, repliesByParent, orphanCount } = groupThreads(messages);
    expect(roots.map((m) => (m as { id: string }).id)).toEqual(["r1", "r2"]);
    expect(repliesByParent.get("r1")?.map((m) => (m as { id: string }).id)).toEqual(["t1", "t2"]);
    expect(orphanCount).toBe(1);
  });

  it("splitMentionedBody destaca apenas as menções conhecidas (h)", () => {
    const parts = splitMentionedBody(
      "Olá @Maria Silva, revê @João Pereira e @inexistente",
      ["Maria Silva", "João Pereira"],
    );
    const mentioned = parts.filter((p) => p.mentioned).map((p) => p.text);
    expect(mentioned).toEqual(["@Maria Silva", "@João Pereira"]);
    expect(parts.filter((p) => !p.mentioned && p.text.includes("@inexistente")).length).toBe(1);
    expect(
      splitMentionedBody("sem menções", []),
    ).toEqual([{ text: "sem menções", mentioned: false }]);
  });
});