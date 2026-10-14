import type Phaser from 'phaser';
import { ProgressRepository } from '@/games/doguinho/core/progress';
import { Sfx } from '@/platform/audio/Sfx';
import { BestScores } from '@/platform/bestScores';
import { FirebaseLeaderboard, readFirebaseSettings } from '@/platform/firebaseLeaderboard';
import { LocalLeaderboard, ResilientLeaderboard } from '@/platform/leaderboard';
import { ProfileRepository } from '@/platform/profile';
import { BrowserStore } from '@/platform/storage';

/** Everything scenes need from the outside world, injected once through the game registry. */
export interface Services {
  readonly profile: ProfileRepository;
  readonly best: BestScores;
  readonly leaderboard: ResilientLeaderboard;
  readonly sfx: Sfx;
  readonly dogProgress: ProgressRepository;
}

export function createServices(env: Record<string, unknown> = import.meta.env): Services {
  const store = new BrowserStore();
  const profile = new ProfileRepository(store);
  const firebase = readFirebaseSettings(env);
  const leaderboard = new ResilientLeaderboard(
    new LocalLeaderboard(store),
    firebase ? new FirebaseLeaderboard(firebase) : null,
    profile.get().playerId,
  );
  const sfx = new Sfx();
  sfx.muted = profile.get().muted;
  return {
    profile,
    best: new BestScores(store),
    leaderboard,
    sfx,
    dogProgress: new ProgressRepository(store),
  };
}

const REGISTRY_KEY = 'services';

export function provideServices(game: Phaser.Game, services: Services): void {
  game.registry.set(REGISTRY_KEY, services);
}

export function getServices(scene: Phaser.Scene): Services {
  return scene.registry.get(REGISTRY_KEY) as Services;
}
