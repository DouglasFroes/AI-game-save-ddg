import Phaser from 'phaser';

export type SwipeDir = 'up' | 'down' | 'left' | 'right';

const MIN_DISTANCE = 30;

/**
 * Calls `onSwipe` for finger swipes (fires as soon as the finger travels far enough, so it feels
 * instant) and for arrow keys / WASD on desktop.
 */
export function bindSwipe(scene: Phaser.Scene, onSwipe: (dir: SwipeDir) => void, minY = 0): void {
  let start: { x: number; y: number } | null = null;

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
    start = p.y >= minY ? { x: p.x, y: p.y } : null;
  });
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
    if (!start || !p.isDown) return;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DISTANCE) return;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    // Re-anchor so a single long drag can chain turns (useful in Snake).
    start = { x: p.x, y: p.y };
  });
  const end = () => (start = null);
  scene.input.on(Phaser.Input.Events.POINTER_UP, end);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, end);

  const keys: Record<string, SwipeDir> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };
  scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
    const dir = keys[e.key];
    if (dir) onSwipe(dir);
  });
}
