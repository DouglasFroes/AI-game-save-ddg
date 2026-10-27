import type * as FirebaseApp from 'firebase/app';
import type * as FirebaseAuth from 'firebase/auth';
import type * as FirestoreLite from 'firebase/firestore/lite';

/** Public web config from the Firebase console (safe to ship: security lives in firestore.rules). */
export interface FirebaseSettings {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tempo esgotado (${ms}ms)`)), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e: unknown) => (clearTimeout(t), reject(e)),
    );
  });
}

export interface FirebaseConnection {
  readonly appMod: typeof FirebaseApp;
  readonly authMod: typeof FirebaseAuth;
  readonly fs: typeof FirestoreLite;
  readonly app: FirebaseApp.FirebaseApp;
  readonly auth: FirebaseAuth.Auth;
  readonly db: FirestoreLite.Firestore;
}

/** The Google account the player signed in with (null while anonymous). */
export interface AccountInfo {
  readonly email: string;
  readonly name: string;
}

export type SignInOutcome =
  | { readonly type: 'signed-in'; readonly moved: number }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly message: string };

/** Boards the anonymous player's runs are moved from when joining an existing Google account. */
export interface MigrationPlan {
  /** Every board id (Firestore collection) a run may be on. */
  readonly boards: readonly string[];
  /** Boards that keep one document per player, named after their uid. */
  readonly campaigns: readonly string[];
}

const isGoogle = (u: FirebaseAuth.User | null): boolean =>
  !!u && u.providerData.some((p) => p.providerId === 'google.com');

/** A friendly message for the errors a player can actually run into. */
export function signInErrorMessage(code: string): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela. Permita pop-ups e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Tente de novo quando estiver online.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
      return 'Login com Google ainda não está ativado neste site.';
    default:
      return 'Não foi possível entrar agora. Tente de novo.';
  }
}

/**
 * The one Firebase sign-in shared by the ranking and the telemetry. Players start anonymous; signing
 * in with Google upgrades that same account (same uid, so every run they own stays theirs). When the
 * Google account already exists (played on another device), the runs of this device's anonymous
 * account are moved to it first, so no record is lost.
 */
export class FirebaseSession {
  private connection: Promise<FirebaseConnection> | null = null;
  /** Set once connected: a popup must open synchronously inside the tap that asked for it. */
  private ready: FirebaseConnection | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly settings: FirebaseSettings,
    private readonly timeoutMs = 8000,
  ) {}

  connect(): Promise<FirebaseConnection> {
    this.connection ??= (async () => {
      const [appMod, authMod, fs] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore/lite'),
      ]);
      const app =
        appMod.getApps().find((a) => a.name === '[DEFAULT]') ?? appMod.initializeApp(this.settings);
      const auth = authMod.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) await authMod.signInAnonymously(auth);
      const c: FirebaseConnection = { appMod, authMod, fs, app, auth, db: fs.getFirestore(app) };
      this.ready = c;
      authMod.onAuthStateChanged(auth, () => this.emit());
      this.emit();
      return c;
    })().catch((err: unknown) => {
      this.connection = null; // allow a retry later
      throw err;
    });
    return withTimeout(this.connection, this.timeoutMs);
  }

  /** The current player's uid (signs in anonymously when nobody is signed in). */
  async uid(): Promise<string> {
    const { auth, authMod } = await this.connect();
    const user = auth.currentUser ?? (await authMod.signInAnonymously(auth)).user;
    return user.uid;
  }

  /** Only Google accounts send runs to the global ranking. */
  async canSubmit(): Promise<boolean> {
    const { auth } = await this.connect();
    return isGoogle(auth.currentUser);
  }

  /** True once connected, so `signInWithGoogle` can open its popup right away. */
  get isReady(): boolean {
    return this.ready !== null;
  }

  account(): AccountInfo | null {
    const user = this.ready?.auth.currentUser ?? null;
    if (!isGoogle(user)) return null;
    const google = user!.providerData.find((p) => p.providerId === 'google.com');
    return {
      email: user!.email ?? google?.email ?? '',
      name: user!.displayName ?? google?.displayName ?? '',
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /**
   * Must be called straight from a tap (browsers only open popups for a user gesture), after
   * `connect()` has finished. The popup is opened before anything is awaited.
   */
  signInWithGoogle(plan: MigrationPlan): Promise<SignInOutcome> {
    const c = this.ready;
    if (!c) return Promise.resolve({ type: 'error', message: 'Conectando… tente de novo.' });
    const { auth, authMod } = c;
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const user = auth.currentUser;
    const popup =
      user && user.isAnonymous
        ? authMod.linkWithPopup(user, provider)
        : authMod.signInWithPopup(auth, provider);
    return popup.then(
      async (cred) => {
        await cred.user.getIdToken(true); // the ranking rules read the Google identity from it
        this.emit();
        return { type: 'signed-in', moved: 0 } as const;
      },
      async (err: unknown): Promise<SignInOutcome> => {
        const code = (err as { code?: string }).code ?? '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
          return { type: 'cancelled' };
        if (code !== 'auth/credential-already-in-use' || !user) {
          console.warn('Login com Google falhou.', err);
          return { type: 'error', message: signInErrorMessage(code) };
        }
        // That Google account already plays here (another device): join it, bringing this
        // device's runs along.
        const credential = authMod.GoogleAuthProvider.credentialFromError(err as never);
        if (!credential) return { type: 'error', message: signInErrorMessage('') };
        try {
          const moved = await this.joinExisting(c, user.uid, credential, plan);
          this.emit();
          return { type: 'signed-in', moved };
        } catch (e) {
          console.warn('Não foi possível vincular a conta.', e);
          return {
            type: 'error',
            message: signInErrorMessage((e as { code?: string }).code ?? ''),
          };
        }
      },
    );
  }

  /**
   * Moves the anonymous account's runs to an existing Google account, then signs into it.
   * Both sides prove who they are: the Google account writes a link naming the anonymous one
   * (from a second, temporary Firebase app), and the anonymous account moves its own runs.
   */
  private async joinExisting(
    c: FirebaseConnection,
    oldUid: string,
    credential: FirebaseAuth.OAuthCredential,
    plan: MigrationPlan,
  ): Promise<number> {
    const { appMod, authMod, fs, db, auth } = c;
    const temp = appMod.initializeApp(this.settings, `link-${Date.now()}`);
    let newUid: string;
    try {
      const tempAuth = authMod.getAuth(temp);
      await authMod.setPersistence(tempAuth, authMod.inMemoryPersistence);
      newUid = (await authMod.signInWithCredential(tempAuth, credential)).user.uid;
      const tempDb = fs.getFirestore(temp);
      await fs.setDoc(fs.doc(tempDb, 'accounts', newUid, 'links', oldUid), {
        at: fs.serverTimestamp(),
      });
    } finally {
      await appMod.deleteApp(temp).catch(() => undefined);
    }

    // Still the anonymous account here: hand each of its runs over.
    let moved = 0;
    const movedCampaign: Array<{ board: string; id: string }> = [];
    for (const board of plan.boards) {
      const entries = fs.collection(db, 'leaderboards', board, 'entries');
      const snap = await fs.getDocs(fs.query(entries, fs.where('player', '==', oldUid)));
      for (const d of snap.docs) {
        await fs.updateDoc(d.ref, { player: newUid });
        moved++;
        if (plan.campaigns.includes(board)) movedCampaign.push({ board, id: d.id });
      }
    }

    await authMod.signInWithCredential(auth, credential);
    await auth.currentUser?.getIdToken(true);

    // Campaign boards keep one document per player, named after the uid: merge the moved one in.
    for (const { board, id } of movedCampaign) {
      const entries = fs.collection(db, 'leaderboards', board, 'entries');
      const [old, mine] = await Promise.all([
        fs.getDoc(fs.doc(entries, id)),
        fs.getDoc(fs.doc(entries, newUid)),
      ]);
      const o = old.data();
      if (!o) continue;
      if (!mine.exists() || Number(mine.data().score) < Number(o.score)) {
        await fs.setDoc(fs.doc(entries, newUid), {
          player: newUid,
          name: o.name,
          score: o.score,
          details: o.details ?? {},
          date: fs.serverTimestamp(),
        });
      }
      await fs.deleteDoc(old.ref);
    }
    return moved;
  }

  /** Back to a fresh anonymous player (runs stay with the Google account). */
  async signOut(): Promise<void> {
    const { auth, authMod } = await this.connect();
    await authMod.signOut(auth);
    await authMod.signInAnonymously(auth);
    this.emit();
  }
}

const sessions = new Map<string, FirebaseSession>();

/** One session per Firebase project, shared by everything that talks to it. */
export function sessionFor(settings: FirebaseSettings): FirebaseSession {
  let s = sessions.get(settings.projectId);
  if (!s) {
    s = new FirebaseSession(settings);
    sessions.set(settings.projectId, s);
  }
  return s;
}
