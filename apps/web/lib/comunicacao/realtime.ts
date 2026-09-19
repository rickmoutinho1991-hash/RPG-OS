/**
 * RPG-OS — Comms realtime (puro): chaves de canal/filtros de subscrição.
 */

/** Chave única do canal realtime por canal de conversa. */
export function realtimeChannelKey(channelId: string): string {
  return `comms:${channelId}`;
}

/** Filtro de inserção pósgres_changes para o canal ativo. */
export function realtimeInsertFilter(channelId: string): string {
  return `channel_id=eq.${channelId}`;
}

/**
 * Subscrever apenas quando o utilizador é membro do canal: evita quêries
 * realtime desnecessárias e possíveis erros de RLS para canais alheios.
 */
export function shouldSubscribeRealtime(
  channelId: string,
  membershipChannelIds: readonly string[] | Set<string>,
): boolean {
  const set =
    membershipChannelIds instanceof Set
      ? membershipChannelIds
      : new Set(membershipChannelIds);
  return Boolean(channelId) && set.has(channelId);
}

/** Normaliza ids possivelmente nulos na comparação de pertença. */
export function isMemberOfChannel(
  channelId: string | null | undefined,
  membershipChannelIds: readonly (string | null | undefined)[] | Set<string>,
): boolean {
  if (!channelId) return false;
  return membershipChannelIds instanceof Set
    ? membershipChannelIds.has(channelId)
    : membershipChannelIds.some((id) => id === channelId);
}