import type * as FirestoreLite from 'firebase/firestore/lite';
import type { GameId } from '@/games/registry';
import { withTimeout, type FirebaseSettings } from './firebaseLeaderboard';
import { parseSession, type PlaySession, type RemoteTelemetry } from './telemetry';

interface Connection {
  readonly fs: typeof FirestoreLite;
  readonly db: FirestoreLite.Firestore;
  readonly uid: string;
}

function toIsoDate(d: unknown): string {
  if (typeof d === 'string' && d) return d;
  if (d && typeof d === 'object') {
    const obj = d as { toDate?: () => Date; seconds?: number };
    if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
    if (typeof obj.seconds === 'number') return new Date(obj.seconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

export function sessionFromFirestore(
  id: string,
  data: Record<string, unknown>,
  isGameId?: (id: string) => id is GameId,
): PlaySession | null {
  const endedAt = toIsoDate(data.date ?? data.endedAt);
  const startedAt = typeof data.startedAt === 'string' && data.startedAt ? data.startedAt : endedAt;
  return parseSession(
    {
      id,
      playerId: data.player ?? data.playerId,
      playerName: data.name ?? data.playerName,
      gameId: data.gameId,
      durationSec: data.durationSec,
      score: data.score,
      startedAt,
      endedAt,
    },
    isGameId,
  );
}

/**
 * Firestore-backed telemetry: `telemetry_sessions/{sessionId}`.
 * Reuses the existing Firebase app instance when already initialized.
 */
export class FirebaseTelemetry implements RemoteTelemetry {
  private connection: Promise<Connection> | null = null;

  constructor(
    private readonly settings: FirebaseSettings,
    private readonly isGameId?: (id: string) => id is GameId,
    private readonly timeoutMs = 8000,
  ) {}

  private connect(): Promise<Connection> {
    this.connection ??= (async () => {
      const [{ getApps, initializeApp }, auth, fs] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore/lite'),
      ]);
      const existing = getApps()[0];
      const app = existing ?? initializeApp(this.settings);
      const a = auth.getAuth(app);
      await a.authStateReady();
      const user = a.currentUser ?? (await auth.signInAnonymously(a)).user;
      return { fs, db: fs.getFirestore(app), uid: user.uid };
    })().catch((err: unknown) => {
      this.connection = null;
      throw err;
    });
    return withTimeout(this.connection, this.timeoutMs);
  }

  async playerId(): Promise<string> {
    return (await this.connect()).uid;
  }

  async record(session: PlaySession): Promise<void> {
    const { fs, db, uid } = await this.connect();
    const col = fs.collection(db, 'telemetry_sessions');
    const data = {
      player: uid,
      name: session.playerName,
      gameId: session.gameId,
      durationSec: Math.round(session.durationSec),
      score: Math.max(0, Math.round(session.score)),
      startedAt: session.startedAt,
      date: fs.serverTimestamp(),
    };
    await withTimeout(fs.setDoc(fs.doc(col, session.id), data), this.timeoutMs);
  }

  async listAll(max = 2000): Promise<PlaySession[]> {
    const { fs, db } = await this.connect();
    const q = fs.query(
      fs.collection(db, 'telemetry_sessions'),
      fs.orderBy('date', 'desc'),
      fs.limit(max),
    );
    const snap = await withTimeout(fs.getDocs(q), this.timeoutMs);
    return snap.docs
      .map((doc) => sessionFromFirestore(doc.id, doc.data(), this.isGameId))
      .filter((s): s is PlaySession => s !== null);
  }
}
