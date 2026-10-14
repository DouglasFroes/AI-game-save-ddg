/** Logical resolution (9:16). Phaser scales it to fit any screen. */
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/** Area reserved for the HUD; the player cannot draw there. */
export const HUD_HEIGHT = 150;

/** Fixed physics step so the game behaves the same on 60 Hz and 120 Hz phones. */
export const PHYSICS_STEP_MS = 1000 / 60;

export const LINE_THICKNESS = 16;
export const DRAW_MIN_SPACING = 12;
export const DOG_BODY = { width: 88, height: 80 } as const;
export const BEE_RADIUS = 13;
/** Radius around a hive where drawing is not allowed. */
export const HIVE_RADIUS = 60;

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const COLORS = {
  ink: 0x2b2d42,
  inkPreview: 0x3d405b,
  dirt: 0x9b6a43,
  dirtDark: 0x7a4f2e,
  grass: 0x6cc551,
  grassDark: 0x4e9f3a,
  spike: 0xc5ccd8,
  spikeDark: 0x7d8597,
  primary: 0xffb703,
  primaryDark: 0xd98c00,
  secondary: 0x4da3ff,
  secondaryDark: 0x2a7ad1,
  success: 0x5bd46f,
  successDark: 0x35a249,
  danger: 0xff5d5d,
  dangerDark: 0xc93c3c,
  panel: 0xffffff,
  locked: 0xb8c0cc,
  text: '#1d2b53',
  textLight: '#ffffff',
} as const;

export const SceneKeys = {
  Boot: 'Boot',
  Menu: 'Menu',
  LevelSelect: 'LevelSelect',
  Game: 'Game',
  Result: 'Result',
  Ranking: 'Ranking',
} as const;

/** Matter body labels used to identify collisions. */
export const BodyLabel = {
  dog: 'dog',
  bee: 'bee',
  ink: 'ink',
  terrain: 'terrain',
  spike: 'spike',
} as const;
