import type Phaser from 'phaser';
import { ProgressRepository } from '@/games/doguinho/core/progress';
import { MemoProgressRepository } from '@/games/memofases/progress';
import { GAMES, type GameId } from '@/games/registry';
import { GoogleAccount, NO_ACCOUNT, type AccountService } from '@/platform/account';
import { ApiClient, readApiSettings } from '@/platform/api/client';
import { ApiChat } from '@/platform/api/chat';
import { ApiLeaderboard } from '@/platform/api/leaderboard';
import { ApiSession } from '@/platform/api/session';
import { ApiTelemetry } from '@/platform/api/telemetry';
import { Sfx } from '@/platform/audio/Sfx';
import { ChatService } from '@/platform/chat/service';
import { BestScores } from '@/platform/bestScores';
import { BoardSnapshots } from '@/platform/boardSnapshots';
import { Favorites } from '@/platform/favorites';
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
  /** Google sign-in, required for the global ranking. */
  readonly account: AccountService;
  /** Real-time chat (signed-in players only). */
  readonly chat: ChatService;
  /** Play time and session analytics (local + the API). */
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
  const api = readApiSettings(env);
  const apiSession = api ? new ApiSession(new ApiClient(api)) : null;
  const remoteBoard = apiSession ? new ApiLeaderboard(apiSession) : null;
  const leaderboard = new ResilientLeaderboard(
    new LocalLeaderboard(store),
    remoteBoard,
    profile.get().playerId,
    undefined,
    new Outbox<PendingScore>(store, 'arcade.outbox.scores'),
    new BoardSnapshots(store),
  );
  const telemetry = new ResilientTelemetry(
    new LocalTelemetry(store, isKnownGameId),
    apiSession ? new ApiTelemetry(apiSession, isKnownGameId) : null,
    () => profile.get(),
    undefined,
    new Outbox<PlaySession>(store, 'arcade.outbox.sessions'),
  );
  const account = remoteBoard
    ? new GoogleAccount(remoteBoard.session, leaderboard, profile)
    : NO_ACCOUNT;
  const sessionTracker = new PlaySessionTracker(telemetry);
  const chat = new ChatService(
    apiSession ? new ApiChat(apiSession) : null,
    account,
    profile,
    store,
    sessionTracker,
  );
  const sfx = new Sfx();
  sfx.configure(profile.get());
  return {
    profile,
    best: new BestScores(store),
    localTop: new LocalTop(store),
    leaderboard,
    account,
    chat,
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
