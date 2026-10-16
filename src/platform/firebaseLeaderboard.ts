import type * as FirestoreLite from 'firebase/firestore/lite';
import type { LeaderboardEntry, RemoteLeaderboard } from './leaderboard';
import { parseEntry, rankEntries, TIEBREAK } from './leaderboard';

/** Extra rows fetched on tiebreak boards so a tied entry just past the cut-off is not lost. */
const TIE_MARGIN = 20;

/** Public web config from the Firebase console (safe to ship: security lives in firestore.rules). */
export interface FirebaseSettings {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
}

export function readFirebaseSettings(env: Record<string, unknown>): FirebaseSettings | null {
  const get = (k: string) => {
    const v = env[`VITE_FIREBASE_${k}`];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const apiKey = get('API_KEY');
  const authDomain = get('AUTH_DOMAIN');
  const projectId = get('PROJECT_ID');
  const appId = get('APP_ID');
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: get('STORAGE_BUCKET'),
    messagingSenderId: get('MESSAGING_SENDER_ID'),
  };
}

/** Converts a Firestore document into an entry; tolerant to Timestamp or ISO dates. */
export function fromFirestore(id: string, data: Record<string, unknown>): LeaderboardEntry | null {
  const d = data.date as { toDate?: () => Date; seconds?: number } | string | undefined;
  let date = new Date(0).toISOString();
  if (typeof d === 'string') date = d;
  else if (d && typeof d.toDate === 'function') date = d.toDate().toISOString();
  else if (d && typeof d.seconds === 'number') date = new Date(d.seconds * 1000).toISOString();
  return parseEntry({ ...data, id, date });
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

interface Connection {
  readonly fs: typeof FirestoreLite;
  readonly db: FirestoreLite.Firestore;
  readonly uid: string;
}

/**
 * Firestore-backed ranking: leaderboards/{gameId}/entries/{entryId}, one document per run (a
 * player can hold several places). Each document stores its owner's uid in `player`.
 * The SDK is loaded lazily so it never slows down the first screen.
 */
export class FirebaseLeaderboard implements RemoteLeaderboard {
  private connection: Promise<Connection> | null = null;

  constructor(
    private readonly settings: FirebaseSettings,
    private readonly timeoutMs = 8000,
  ) {}

  private connect(): Promise<Connection> {
    this.connection ??= (async () => {
      const [{ initializeApp }, auth, fs] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore/lite'),
      ]);
      const app = initializeApp(this.settings);
      const a = auth.getAuth(app);
      await a.authStateReady();
      const user = a.currentUser ?? (await auth.signInAnonymously(a)).user;
      return { fs, db: fs.getFirestore(app), uid: user.uid };
    })().catch((err: unknown) => {
      this.connection = null; // allow a retry later
      throw err;
    });
    return withTimeout(this.connection, this.timeoutMs);
  }

  async playerId(): Promise<string> {
    return (await this.connect()).uid;
  }

  async list(gameId: string, max: number): Promise<LeaderboardEntry[]> {
    const { fs, db } = await this.connect();
    const q = fs.query(
      fs.collection(db, 'leaderboards', gameId, 'entries'),
      fs.orderBy('score', 'desc'),
      fs.limit(TIEBREAK[gameId] ? max + TIE_MARGIN : max),
    );
    const snap = await withTimeout(fs.getDocs(q), this.timeoutMs);
    const entries = snap.docs
      .map((doc) => fromFirestore(doc.id, doc.data()))
      .filter((e): e is LeaderboardEntry => e !== null);
    // Equal scores are settled here (the game's tiebreak, then the older run).
    return rankEntries(entries, gameId).slice(0, max);
  }

  async submit(gameId: string, entry: LeaderboardEntry, replace = false): Promise<void> {
    const { fs, db, uid } = await this.connect();
    const data = {
      player: uid,
      name: entry.name,
      score: Math.round(entry.score),
      details: entry.details,
      date: fs.serverTimestamp(),
    };
    const entries = fs.collection(db, 'leaderboards', gameId, 'entries');
    // Campaign games keep one document per player, named after their uid.
    await withTimeout(
      replace
        ? fs.setDoc(fs.doc(entries, uid), data)
        : fs.addDoc(entries, data).then(() => undefined),
      this.timeoutMs,
    );
  }
}
