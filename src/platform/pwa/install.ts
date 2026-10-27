import { publishNotice } from '@/platform/notices';

/** The browser's install prompt (Chrome/Edge/Android); not in the standard typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - `prompt`: the browser can show its install dialog (Android, desktop Chrome/Edge).
 * - `ios`: iPhone/iPad Safari has no dialog; the player has to use "Adicionar à Tela de Início".
 * - `installed`: already running as an installed app.
 * - `unavailable`: nothing to offer (e.g. a browser without PWA install).
 */
export type InstallState = 'prompt' | 'ios' | 'installed' | 'unavailable';

export interface InstallEnv {
  addEventListener(type: string, listener: (event: Event) => void): void;
  isStandalone(): boolean;
  userAgent: string;
  /** `navigator.platform` and `navigator.maxTouchPoints`: iPads and "desktop site" mode hide iOS in the UA. */
  platform?: string;
  maxTouchPoints?: number;
}

const isIos = (env: InstallEnv): boolean =>
  /iphone|ipad|ipod/i.test(env.userAgent) ||
  // iPadOS and iPhone "desktop site" report a Mac, but a real Mac has no touch screen.
  (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1);

/** Where the Share button is and what to tap, since iOS cannot install a web app from code. */
export const iosInstallSteps = (ua: string): string =>
  /crios|fxios|edgios/i.test(ua)
    ? '1. Toque no ícone de Compartilhar, no canto direito da barra de endereço.\n2. Role e toque em "Adicionar à Tela de Início".\n3. Toque em "Adicionar".'
    : '1. Toque no ícone de Compartilhar, na barra de baixo do Safari.\n2. Role e toque em "Adicionar à Tela de Início".\n3. Toque em "Adicionar".';

export class InstallPrompt {
  private deferred: BeforeInstallPromptEvent | null = null;
  private installed = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly env: InstallEnv) {
    // The browser fires this once, early; it has to be caught before the hub exists.
    env.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.emit();
    });
    env.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this.emit();
      publishNotice({
        key: 'installed',
        kind: 'success',
        glyph: 'check',
        title: 'Fliper instalado!',
        body: 'Abra pelo ícone na tela inicial, em tela cheia e até sem internet.',
      });
    });
  }

  state(): InstallState {
    if (this.installed || this.env.isStandalone()) return 'installed';
    if (this.deferred) return 'prompt';
    return isIos(this.env) ? 'ios' : 'unavailable';
  }

  /** Shows the browser's install dialog. Call it straight from a tap. */
  async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = this.deferred;
    if (!event) return 'unavailable';
    // The event can be used once; a dismissed dialog is offered again by the browser later.
    this.deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    this.emit();
    return outcome;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
