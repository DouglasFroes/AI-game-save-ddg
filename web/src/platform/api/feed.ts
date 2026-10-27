import type { ChatMessage } from '../chat/core';

/**
 * The messages of a room as the player sees them: oldest first, at most `max`. A message that
 * is already there (same id) is replaced, which is how reactions and removals arrive.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
  max: number,
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(-max);
}
