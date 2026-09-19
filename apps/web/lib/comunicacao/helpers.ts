/**
 * RPG-OS — Comunicação: helpers puros (vaga M-E).
 * Parsing de menções, slugs de mensagens diretas, nomes de conversa e
 * não-lidos. Sem estado e sem imports de servidor.
 */

export interface CommsMember {
  user_id: string;
  name: string | null;
}

export interface CommsMessageSummary {
  id: string;
  created_at: string;
}

/** Normaliza um nome/token para comparação (minúsculas, sem acentos). */
export function normalizeCommsName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Escapa um valor para uso literal em RegExp. */
export function escapeCommsRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface BodyPart {
  text: string;
  mentioned: boolean;
}

/**
 * Divide o corpo em segmentos destacáveis: `@Nome` que correspondem a uma
 * menção conhecida tornam-se segmentos "mentioned"; o resto é texto normal.
 */
export function splitMentionedBody(
  body: string,
  mentionedNames: string[],
): BodyPart[] {
  if (mentionedNames.length === 0) return [{ text: body, mentioned: false }];
  const patterns = mentionedNames
    .map((n) => escapeCommsRegExp(n.trim().toLowerCase()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (patterns.length === 0) return [{ text: body, mentioned: false }];

  const regex = new RegExp(`@(${patterns.join("|")})\\b`, "gi");
  const parts: BodyPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > cursor) {
      parts.push({ text: body.slice(cursor, match.index), mentioned: false });
    }
    parts.push({ text: match[0], mentioned: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    parts.push({ text: body.slice(cursor), mentioned: false });
  }
  return parts;
}

/** Extrai os tokens de menção únicos (`@nome`) do corpo. */
export function extractMentionTokens(body: string, max = 50): string[] {
  const tokens = new Set<string>();
  const re = /@([A-Za-z0-9_\u00C0-\u024F](?:[A-Za-z0-9_\u00C0-\u024F .'-]{0,39}))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null && tokens.size < max) {
    const token = normalizeCommsName(m[1]);
    if (token) tokens.add(token);
  }
  return Array.from(tokens);
}

/**
 * Resolve os tokens `@nome` do corpo para user_ids dos membros do canal.
 * Um token corresponde quando o nome de um único membro é prefixo do token
 * (tolera conectores como " e " ou pontuação a seguir ao nome). Tokens
 * ambíguos (nome partilhado) ou inexistentes são ignorados — nunca inventa.
 */
export function resolveMentionIds(
  tokens: string[],
  members: CommsMember[],
): string[] {
  const byName = new Map<string, string[]>();
  for (const member of members) {
    if (!member.name) continue;
    const key = normalizeCommsName(member.name);
    byName.set(key, [...(byName.get(key) ?? []), member.user_id]);
  }
  const ids: string[] = [];
  for (const token of tokens) {
    const matches = Array.from(byName.entries())
      .filter(([name]) => token.startsWith(name) || name.startsWith(token))
      .flatMap(([, userIds]) => userIds);
    if (matches.length === 1) ids.push(matches[0]);
  }
  return Array.from(new Set(ids));
}

/** Slug determinístico e comutativo para uma conversa direta a dois. */
export function buildDmSlug(userA: string, userB: string): string {
  const [first, second] = [userA, userB].sort();
  return `dm-${first.slice(0, 8)}-${second.slice(0, 8)}`;
}

/** Nome a exibir para uma conversa direta entre o utilizador e o outro. */
export function channelDisplayName(
  myId: string,
  otherId: string,
  names: Map<string, string>,
): string {
  return names.get(otherId) ?? (otherId === myId ? "Comigo" : "Conversa");
}

/** Quantidade de mensagens não lidas desde o último `lastReadAt`. */
export function unreadSinceCount(
  messages: CommsMessageSummary[],
  lastReadAt: string | null,
): number {
  if (!lastReadAt) return messages.length;
  const since = new Date(lastReadAt).getTime();
  return messages.filter(
    (m) => new Date(m.created_at).getTime() > since,
  ).length;
}

/**
 * Transforma uma lista de mensagens numa árvore de threads.
 * Devolve [raízes, respostasPorPai].
 */
export function groupThreads<T extends { id: string; thread_root_id?: string | null }>(
  messages: T[],
): { roots: T[]; repliesByParent: Map<string, T[]>; orphanCount: number } {
  const roots: T[] = [];
  const repliesByParent = new Map<string, T[]>();
  let orphanCount = 0;
  for (const message of messages) {
    const parentId = message.thread_root_id ?? "";
    if (!parentId) {
      roots.push(message);
      continue;
    }
    const parent = messages.find((m) => m.id === parentId);
    if (parent && !parent.thread_root_id) {
      repliesByParent.set(
        parentId,
        [...(repliesByParent.get(parentId) ?? []), message],
      );
    } else {
      orphanCount += 1;
    }
  }
  return { roots, repliesByParent, orphanCount };
}