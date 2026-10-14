import type Phaser from 'phaser';
import { LocalLeaderboard, RemoteLeaderboard, ResilientLeaderboard } from '@/core/leaderboard';
import { ProgressRepository } from '@/core/progress';
import { BrowserStore } from '@/core/storage';
import { SEED_LEADERBOARD } from '@/data/seedLeaderboard';
import { Sfx } from '@/game/audio/Sfx';

/** Everything scenes need from the outside world, injected once through the game registry. */
export interface Services {
  readonly progress: ProgressRepository;
  readonly leaderboard: ResilientLeaderboard;
  readonly sfx: Sfx;
}

export function createServices(): Services {
  const store = new BrowserStore();
  const progress = new ProgressRepository(store);
  const remoteUrl = (import.meta.env.VITE_LEADERBOARD_URL as string | undefined)?.trim();
  const leaderboard = new ResilientLeaderboard(
    new LocalLeaderboard(store, SEED_LEADERBOARD),
    remoteUrl ? new RemoteLeaderboard(remoteUrl) : null,
  );
  const sfx = new Sfx();
  sfx.muted = progress.get().muted;
  return { progress, leaderboard, sfx };
}

const REGISTRY_KEY = 'services';

export function provideServices(game: Phaser.Game, services: Services): void {
  game.registry.set(REGISTRY_KEY, services);
}

export function getServices(scene: Phaser.Scene): Services {
  return scene.registry.get(REGISTRY_KEY) as Services;
}
