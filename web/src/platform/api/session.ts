import type { ApiClient } from './client';
import { ApiError, withTimeout } from './client';

/** The Google account the player signed in with (null while anonymous). */
export interface AccountInfo {
  readonly email: string;
  readonly name: string;
}

export type SignInOutcome =
  | { readonly type: 'signed-in'; readonly moved: number }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly message: string };

/** What the server returns when a player signs in or renews the session. */
interface SessionResponse {
  readonly token: string;
  readonly playerId: string;
  readonly google: boolean;
  readonly account: AccountInfo | null;
  readonly moved: number;
}

const STORAGE_KEY = 'arcade.api.session.v1';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** The few parts of Google Identity Services this uses (no typings are published for it). */
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string }) => void;
    error_callback: (error: { type?: string }) => void;
  }): TokenClient;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth } };
  }
}

/** A friendly message for the errors a player can actually run into. */
export function signInErrorMessage(code: string): string {
  switch (code) {
    case 'popup_failed_to_open':
      return 'O navegador bloqueou a janela. Permita pop-ups e tente de novo.';
    case 'offline':
      return 'Sem conexão. Tente de novo quando estiver online.';
    case 'unavailable':
      return 'Login com Google ainda não está ativado neste site.';
    default:
      return 'Não foi possível entrar agora. Tente de novo.';
  }
}

interface Stored {
  token: string;
  playerId: string;
  google: boolean;
  account: AccountInfo | null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('script'));
    document.head.append(el);
  });
}

/**
 * The player's identity with the API. Everybody starts anonymous (an id and a token, enough to
 * play and be measured); signing in with Google upgrades that same player, bringing along every
 * run the device made. The token is kept on the device, so there is nothing to sign in again.
 */
export class ApiSession {
  private stored: Stored | null = null;
  private connection: Promise<void> | null = null;
  private tokenClient: TokenClient | null = null;
  private signing: { resolve: (o: SignInOutcome) => void } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly api: ApiClient,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
    private readonly timeoutMs = 8000,
  ) {
    this.stored = this.read();
  }

  /** Ready to use: a token on the device, or a fresh anonymous one from the server. */
  connect(): Promise<void> {
    this.connection ??= (async () => {
      if (this.stored) {
        // Works offline; renewing (and noticing a revoked session) happens in the background.
        void this.renew();
      } else {
        await this.startAnonymous();
      }
      this.prepareGoogle();
    })().catch((err: unknown) => {
      this.connection = null; // allow a retry later
      throw err;
    });
    return withTimeout(this.connection, this.timeoutMs);
  }

  /** The current token (anonymous or Google), connecting first. */
  async token(): Promise<string> {
    await this.connect();
    return this.stored!.token;
  }

  async uid(): Promise<string> {
    await this.connect();
    return this.stored!.playerId;
  }

  /** Only Google accounts send runs to the global ranking and use the chat. */
  async canSubmit(): Promise<boolean> {
    await this.connect();
    return this.stored!.google;
  }

  /** True once a tap can open the Google popup right away. */
  get isReady(): boolean {
    return this.tokenClient !== null;
  }

  account(): AccountInfo | null {
    return this.stored?.google ? this.stored.account : null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * An authenticated request. A token the server no longer accepts (revoked, or a deleted
   * player) is replaced by a fresh anonymous one and the request is tried once more.
   */
  async call<T>(
    path: string,
    opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
  ): Promise<T> {
    const attempt = async () => this.api.request<T>(path, { ...opts, token: await this.token() });
    try {
      return await attempt();
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      await this.startAnonymous();
      return attempt();
    }
  }

  /**
   * Must be called straight from a tap: browsers only open popups for a user gesture, so the
   * Google script is loaded ahead of time (`connect`) and the popup opens before anything is awaited.
   */
  signInWithGoogle(): Promise<SignInOutcome> {
    if (!this.tokenClient || !this.stored)
      return Promise.resolve({ type: 'error', message: 'Conectando… tente de novo.' });
    this.signing?.resolve({ type: 'cancelled' });
    const outcome = new Promise<SignInOutcome>((resolve) => (this.signing = { resolve }));
    this.tokenClient.requestAccessToken({ prompt: 'select_account' });
    return outcome;
  }

  /** Back to a fresh anonymous player (runs stay with the Google account). */
  async signOut(): Promise<void> {
    this.save(null);
    this.connection = null;
    await this.connect();
  }

  private prepareGoogle(): void {
    if (this.tokenClient || typeof window === 'undefined') return;
    const init = () => {
      const oauth = window.google?.accounts.oauth2;
      if (!oauth || this.tokenClient) return;
      this.tokenClient = oauth.initTokenClient({
        client_id: this.api.settings.googleClientId,
        scope: 'openid email profile',
        callback: (r) => void this.finishGoogle(r.access_token, r.error),
        error_callback: (e) =>
          this.settle(
            e.type === 'popup_closed'
              ? { type: 'cancelled' }
              : { type: 'error', message: signInErrorMessage(e.type ?? '') },
          ),
      });
      this.emit();
    };
    if (window.google?.accounts) init();
    else void loadScript(GSI_SRC).then(init, () => undefined);
  }

  private async finishGoogle(
    accessToken: string | undefined,
    error: string | undefined,
  ): Promise<void> {
    if (!accessToken)
      return this.settle({ type: 'error', message: signInErrorMessage(error ?? '') });
    try {
      // The device's anonymous token tells the server whose runs to bring along.
      const res = await this.api.request<SessionResponse>('/api/auth/google', {
        method: 'POST',
        body: { accessToken },
        token: this.stored?.google ? null : this.stored?.token,
        timeoutMs: 15000,
      });
      this.save(res);
      this.settle({ type: 'signed-in', moved: res.moved });
    } catch (err) {
      const code = err instanceof ApiError && err.status === 0 ? 'offline' : '';
      this.settle({ type: 'error', message: signInErrorMessage(code) });
    }
  }

  private settle(outcome: SignInOutcome): void {
    this.signing?.resolve(outcome);
    this.signing = null;
  }

  private async startAnonymous(): Promise<void> {
    this.save(await this.api.request<SessionResponse>('/api/auth/anonymous', { method: 'POST' }));
  }

  /** Swaps the stored token for a fresh one; drops it when the server no longer knows it. */
  private async renew(): Promise<void> {
    try {
      this.save(await this.api.request<SessionResponse>('/api/me', { token: this.stored?.token }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.save(null);
        await this.startAnonymous().catch(() => undefined);
      }
    }
  }

  private save(res: SessionResponse | null): void {
    this.stored = res
      ? { token: res.token, playerId: res.playerId, google: res.google, account: res.account }
      : null;
    try {
      if (this.stored) this.storage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
      else this.storage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode: the session lasts until the tab closes */
    }
    this.emit();
  }

  private read(): Stored | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const v = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
      return v && typeof v.token === 'string' && typeof v.playerId === 'string'
        ? {
            token: v.token,
            playerId: v.playerId,
            google: v.google === true,
            account: v.account ?? null,
          }
        : null;
    } catch {
      return null;
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
