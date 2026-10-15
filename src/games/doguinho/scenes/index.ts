import { GameScene } from './GameScene';
import { LevelSelectScene } from './LevelSelectScene';
import { ResultScene } from './ResultScene';

/** Lazy-loaded by the registry; ResultScene comes after GameScene so it renders on top. */
export const scenes = [LevelSelectScene, GameScene, ResultScene];
