import type { GameId } from '@/games/registry';
import {
  sessionFor,
  withTimeout,
  type FirebaseSession,
  type FirebaseSettings,
} from './firebaseSession';
import { parseSession, type PlaySession, type RemoteTelemetry } from './telemetry';

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
  private readonly session: FirebaseSession;

  constructor(
    settings: FirebaseSettings,
    private readonly isGameId?: (id: string) => id is GameId,
    private readonly timeoutMs = 8000,
  ) {
    this.session = sessionFor(settings);
  }

  private connect() {
    return withTimeout(this.session.connect(), this.timeoutMs);
  }

  playerId(): Promise<string> {
    return withTimeout(this.session.uid(), this.timeoutMs);
  }

  async record(session: PlaySession): Promise<void> {
    const { fs, db } = await this.connect();
    const uid = await this.playerId();
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
