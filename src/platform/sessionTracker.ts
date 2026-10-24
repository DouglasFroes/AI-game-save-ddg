import type Phaser from 'phaser';
import { SceneKeys } from '@/config';
import type { GameId } from '@/games/registry';
import { clampDuration, MIN_SESSION_SECONDS, type ResilientTelemetry } from './telemetry';

/**
 * Maps every gameplay scene key to its corresponding `GameId`.
 * Non-gameplay scenes (Boot, Hub, Leaderboard, GameOver, level select menus) are excluded
 * so only actual play time inside a game is counted.
 */
export const SCENE_TO_GAME: Readonly<Record<string, GameId>> = {
  [SceneKeys.DogGame]: 'doguinho',
  [SceneKeys.BlockBlast]: 'blockblast',
  [SceneKeys.Sudoku]: 'sudoku',
  [SceneKeys.RoadFighter]: 'roadfighter',
  [SceneKeys.Game2048]: 'game2048',
  [SceneKeys.FlappyBee]: 'flappybee',
  [SceneKeys.Snake]: 'snake',
  [SceneKeys.Stack]: 'stack',
  [SceneKeys.FruitMerge]: 'fruitmerge',
  [SceneKeys.Grau]: 'grau',
  [SceneKeys.Luta]: 'luta',
  [SceneKeys.Bomba]: 'bomba',
  [SceneKeys.Turma]: 'turma',
  [SceneKeys.Corre]: 'corre',
  [SceneKeys.Crush]: 'crush',
  [SceneKeys.Lenha]: 'lenha',
  [SceneKeys.Piano]: 'piano',
  [SceneKeys.Alvo]: 'alvo',
  [SceneKeys.Pula]: 'pula',
  [SceneKeys.Atravessa]: 'atravessa',
  [SceneKeys.Hexa]: 'hexa',
  [SceneKeys.Tijolos]: 'tijolos',
  [SceneKeys.Memoria]: 'memoria',
  [SceneKeys.Cores]: 'cores',
  [SceneKeys.Milhao]: 'milhao',
  [SceneKeys.MemoGame]: 'memofases',
  [SceneKeys.Bolha]: 'bolha',
  [SceneKeys.Paciencia]: 'paciencia',
  [SceneKeys.Ultima]: 'ultima',
  [SceneKeys.Territorio]: 'territorio',
  [SceneKeys.Helix]: 'helix',
  [SceneKeys.Zigue]: 'zigue',
  [SceneKeys.Ponte]: 'ponte',
  [SceneKeys.CorCerta]: 'corcerta',
  [SceneKeys.Conta]: 'conta',
  [SceneKeys.Cesto]: 'cesto',
  [SceneKeys.Sequencia]: 'sequencia',
  [SceneKeys.Relampago]: 'relampago',
  [SceneKeys.Trio]: 'trio',
  [SceneKeys.Inverte]: 'inverte',
  [SceneKeys.Balao]: 'balao',
  [SceneKeys.Toupeira]: 'toupeira',
  [SceneKeys.Corta]: 'corta',
  [SceneKeys.Gelo]: 'gelo',
  [SceneKeys.Velha]: 'velha',
  [SceneKeys.Ligue4]: 'ligue4',
  [SceneKeys.Minas]: 'minas',
  [SceneKeys.Bolhas]: 'bolhas',
  [SceneKeys.Blocos]: 'blocos',
  [SceneKeys.ComeCome]: 'comecome',
  [SceneKeys.Nave]: 'nave',
  [SceneKeys.Liquidos]: 'liquidos',
  [SceneKeys.Ricochete]: 'ricochete',
  [SceneKeys.Horda]: 'horda',
  [SceneKeys.Gancho]: 'gancho',
  [SceneKeys.Orbita]: 'orbita',
  [SceneKeys.Cadeia]: 'cadeia',
  [SceneKeys.Escorrega]: 'escorrega',
  [SceneKeys.Plinko]: 'plinko',
  [SceneKeys.Tinta]: 'tinta',
  [SceneKeys.Espelhos]: 'espelhos',
  [SceneKeys.Masmorra]: 'masmorra',
  [SceneKeys.Pinball]: 'pinball',
  [SceneKeys.Dados]: 'dados',
  [SceneKeys.Selecao]: 'selecao',
  [SceneKeys.TimesBr]: 'timesbr',
};

interface ActiveRun {
  gameId: GameId;
  sceneKey: string;
  startedAt: Date;
  activeSinceMs: number | null;
  accumulatedMs: number;
  score: number;
  flushed: boolean;
}

/**
 * Pure session timer state machine (unit-testable without Phaser or DOM).
 * Pauses accumulation when the tab is hidden and flushes once per run.
 */
export class PlaySessionTracker {
  private current: ActiveRun | null = null;

  constructor(
    private readonly telemetry: ResilientTelemetry,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  get activeGameId(): GameId | null {
    return this.current && !this.current.flushed ? this.current.gameId : null;
  }

  /** Starts tracking a new gameplay run. Flushes any previous unfinished run first. */
  startScene(sceneKey: string, visible = true): void {
    const gameId = SCENE_TO_GAME[sceneKey];
    if (!gameId) return;
    if (this.current && !this.current.flushed) {
      this.flushCurrent();
    }
    const now = this.nowMs();
    this.current = {
      gameId,
      sceneKey,
      startedAt: new Date(now),
      activeSinceMs: visible ? now : null,
      accumulatedMs: 0,
      score: 0,
      flushed: false,
    };
  }

  /** Marks the current run's score and flushes the session immediately (e.g. when GameOver opens). */
  completeRun(gameId: string, score = 0): void {
    if (!this.current || this.current.flushed) return;
    if (this.current.gameId !== gameId) return;
    if (score > this.current.score) this.current.score = score;
    this.flushCurrent();
  }

  /** Called when a scene shuts down (e.g. player tapped back to Hub or restarted). */
  stopScene(sceneKey: string): void {
    if (!this.current || this.current.flushed) return;
    if (this.current.sceneKey !== sceneKey) return;
    this.flushCurrent();
  }

  /** Pauses or resumes play time accumulation when browser tab visibility changes. */
  setVisible(visible: boolean): void {
    if (!this.current || this.current.flushed) return;
    const now = this.nowMs();
    if (!visible && this.current.activeSinceMs !== null) {
      this.current.accumulatedMs += Math.max(0, now - this.current.activeSinceMs);
      this.current.activeSinceMs = null;
    } else if (visible && this.current.activeSinceMs === null) {
      this.current.activeSinceMs = now;
    }
  }

  /** Flushes the active run (if any) and returns the recorded duration in seconds. */
  flushCurrent(): number {
    const run = this.current;
    if (!run || run.flushed) return 0;
    const now = this.nowMs();
    if (run.activeSinceMs !== null) {
      run.accumulatedMs += Math.max(0, now - run.activeSinceMs);
      run.activeSinceMs = null;
    }
    run.flushed = true;
    const durationSec = clampDuration(run.accumulatedMs / 1000);
    if (durationSec >= MIN_SESSION_SECONDS) {
      void this.telemetry.recordSession({
        gameId: run.gameId,
        durationSec,
        score: run.score,
        startedAt: run.startedAt,
        endedAt: new Date(now),
      });
    }
    return durationSec;
  }
}

/**
 * Hooks a Phaser scene instance so its start/restart/shutdown lifecycle automatically feeds
 * the `PlaySessionTracker`. Safe to call multiple times on the same scene.
 */
const hookedScenes = new WeakSet<Phaser.Scene>();

export function attachSceneTelemetry(scene: Phaser.Scene, tracker: PlaySessionTracker): void {
  const key = scene.sys.settings.key;
  if (!SCENE_TO_GAME[key] || hookedScenes.has(scene)) return;
  hookedScenes.add(scene);

  const onStart = () => {
    const visible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
    tracker.startScene(key, visible);
  };
  const onShutdown = () => {
    tracker.stopScene(key);
  };

  scene.events.on('create', onStart);
  scene.events.on('shutdown', onShutdown);
  scene.events.on('destroy', onShutdown);
}

/** Installs global page visibility & unload listeners so leaving the browser saves the session. */
export function bindBrowserLifecycle(tracker: PlaySessionTracker): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    tracker.setVisible(document.visibilityState !== 'hidden');
  });
  window.addEventListener('pagehide', () => {
    tracker.flushCurrent();
  });
}
