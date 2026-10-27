import { isStandalone } from '@/platform/fullscreen';
import { InstallPrompt } from './install';

/** Created at startup (see main.ts) so the browser's one-time install event is never missed. */
export const installPrompt = new InstallPrompt({
  addEventListener: (type, listener) => window.addEventListener(type, listener),
  isStandalone,
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
});
