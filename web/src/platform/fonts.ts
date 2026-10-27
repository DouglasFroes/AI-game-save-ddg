/** Display font for the hub. System fonts take over if it can't be fetched (offline, slow link). */
export const HUB_FONT = '"Sora", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Waits (briefly) for the hub font so canvas art and text are drawn with it the first time.
 * Never rejects: after `timeoutMs` the hub simply opens with the fallback font.
 */
export async function loadHubFont(timeoutMs = 1200): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const ready = Promise.all([
    document.fonts.load('400 24px Sora'),
    document.fonts.load('700 24px Sora'),
    document.fonts.load('800 24px Sora'),
  ]).then(
    () => undefined,
    () => undefined,
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([ready, timeout]);
}
