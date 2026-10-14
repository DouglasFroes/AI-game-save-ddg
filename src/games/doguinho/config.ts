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

/** Matter body labels used to identify collisions. */
export const BodyLabel = {
  dog: 'dog',
  bee: 'bee',
  ink: 'ink',
  terrain: 'terrain',
  spike: 'spike',
} as const;
