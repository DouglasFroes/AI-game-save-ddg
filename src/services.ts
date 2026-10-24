import type Phaser from 'phaser';
import { ProgressRepository } from '@/games/doguinho/core/progress';
import { MemoProgressRepository } from '@/games/memofases/progress';
import { GAMES, type GameId } from '@/games/registry';
import { Sfx } from '@/platform/audio/Sfx';
import { BestScores } from '@/platform/bestScores';
import { Favorites } from '@/platform/favorites';
import { FirebaseLeaderboard, readFirebaseSettings } from '@/platform/firebaseLeaderboard';
import { FirebaseTelemetry } from '@/platform/firebaseTelemetry';
import { LocalLeaderboard, ResilientLeaderboard, type PendingScore } from '@/platform/leaderboard';
import { Outbox } from '@/platform/outbox';
import { LocalTop } from '@/platform/localTop';
import { ProfileRepository } from '@/platform/profile';
import { RankWatch } from '@/platform/rankWatch';
import { Recents } from '@/platform/recents';
import { PlaySessionTracker } from '@/platform/sessionTracker';
import { BrowserStore } from '@/platform/storage';
import { LocalTelemetry, ResilientTelemetry, type PlaySession } from '@/platform/telemetry';

const KNOWN_GAMES = new Set<string>(GAMES.map((g) => g.id));
export const isKnownGameId = (id: string): id is GameId => KNOWN_GAMES.has(id);

/** Everything scenes need from the outside world, injected once through the game registry. */
export interface Services {
  readonly profile: ProfileRepository;
  readonly best: BestScores;
  /** The player's 10 best runs of each game. */
  readonly localTop: LocalTop;
  readonly leaderboard: ResilientLeaderboard;
  /** Play time and session analytics (local + optional Firebase). */
  readonly telemetry: ResilientTelemetry;
  readonly sessionTracker: PlaySessionTracker;
  /** Games starred in the hub. */
  readonly favorites: Favorites;
  /** Games opened last, for "continue playing" in the hub. */
  readonly recents: Recents;
  /** The player's places on the global boards, to tell them when someone passes them. */
  readonly rankWatch: RankWatch;
  readonly sfx: Sfx;
  readonly dogProgress: ProgressRepository;
  /** Stars of "Memória: Aventura". */
  readonly memoProgress: MemoProgressRepository;
}

export function createServices(env: Record<string, unknown> = import.meta.env): Services {
  const store = new BrowserStore();
  const profile = new ProfileRepository(store);
  const firebase = readFirebaseSettings(env);
  const leaderboard = new ResilientLeaderboard(
    new LocalLeaderboard(store),
    firebase ? new FirebaseLeaderboard(firebase) : null,
    profile.get().playerId,
    undefined,
    new Outbox<PendingScore>(store, 'arcade.outbox.scores'),
  );
  const telemetry = new ResilientTelemetry(
    new LocalTelemetry(store, isKnownGameId),
    firebase ? new FirebaseTelemetry(firebase, isKnownGameId) : null,
    () => profile.get(),
    undefined,
    new Outbox<PlaySession>(store, 'arcade.outbox.sessions'),
  );
  const sessionTracker = new PlaySessionTracker(telemetry);
  const sfx = new Sfx();
  sfx.configure(profile.get());
  return {
    profile,
    best: new BestScores(store),
    localTop: new LocalTop(store),
    leaderboard,
    telemetry,
    sessionTracker,
    favorites: new Favorites(store),
    recents: new Recents(store),
    rankWatch: new RankWatch(store),
    sfx,
    dogProgress: new ProgressRepository(store),
    memoProgress: new MemoProgressRepository(store),
  };
}

const REGISTRY_KEY = 'services';

export function provideServices(game: Phaser.Game, services: Services): void {
  game.registry.set(REGISTRY_KEY, services);
}

export function getServices(scene: Phaser.Scene): Services {
  return scene.registry.get(REGISTRY_KEY) as Services;
}
