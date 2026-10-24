/** Query parameter of a shared link: `https://site/?jogo=zigue` opens that game directly. */
export const GAME_PARAM = 'jogo';

/** Link that opens the arcade straight into one game. */
export function gameLink(
  id: string,
  loc: Pick<Location, 'origin' | 'pathname'> = window.location,
): string {
  return `${loc.origin}${loc.pathname}?${GAME_PARAM}=${encodeURIComponent(id)}`;
}

/** The game id asked for by a shared link, or null when absent or unknown. */
export function gameIdFromSearch(search: string, isGame: (id: string) => boolean): string | null {
  const id = new URLSearchParams(search).get(GAME_PARAM);
  return id && isGame(id) ? id : null;
}

/**
 * Formats the text + URL into a single share message so WhatsApp / Android / iOS share targets
 * preserve both the score challenge text and the clickable link.
 */
export function formatShareMessage(text: string, url: string): string {
  const clean = text.trim();
  return clean ? `${clean}\n${url}` : url;
}
