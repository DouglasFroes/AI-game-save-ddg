import type { LeaderboardEntry, RemoteLeaderboard } from './leaderboard';
import { boardId } from './boards';
import {
  sessionFor,
  withTimeout,
  type FirebaseSession,
  type FirebaseSettings,
} from './firebaseSession';
import { parseEntry, rankEntries, TIEBREAK } from './leaderboard';

export { withTimeout, type FirebaseSettings } from './firebaseSession';

/** Extra rows fetched on tiebreak boards so a tied entry just past the cut-off is not lost. */
const TIE_MARGIN = 20;

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

/**
 * Firestore-backed ranking: leaderboards/{gameId}/entries/{entryId}, one document per run (a
 * player can hold several places). Each document stores its owner's uid in `player`.
 * The SDK is loaded lazily so it never slows down the first screen.
 */
export class FirebaseLeaderboard implements RemoteLeaderboard {
  readonly session: FirebaseSession;

  constructor(
    settings: FirebaseSettings,
    private readonly timeoutMs = 8000,
  ) {
    this.session = sessionFor(settings);
  }

  private connect() {
    return this.session.connect();
  }

  playerId(): Promise<string> {
    return withTimeout(this.session.uid(), this.timeoutMs);
  }

  canSubmit(): Promise<boolean> {
    return withTimeout(this.session.canSubmit(), this.timeoutMs);
  }

  async list(gameId: string, max: number): Promise<LeaderboardEntry[]> {
    const { fs, db } = await this.connect();
    const q = fs.query(
      fs.collection(db, 'leaderboards', boardId(gameId), 'entries'),
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
    const { fs, db } = await this.connect();
    const uid = await this.session.uid();
    const data = {
      player: uid,
      name: entry.name,
      score: Math.round(entry.score),
      details: entry.details,
      date: fs.serverTimestamp(),
    };
    const entries = fs.collection(db, 'leaderboards', boardId(gameId), 'entries');
    // Campaign games keep one document per player, named after their uid.
    await withTimeout(
      replace
        ? fs.setDoc(fs.doc(entries, uid), data)
        : fs.addDoc(entries, data).then(() => undefined),
      this.timeoutMs,
    );
  }
}
