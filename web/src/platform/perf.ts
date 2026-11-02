/**
 * "Lite" mode for slow phones: the hub drops its decorative effects (add-blended glows, looping
 * tweens, canvas MSAA) so scrolling stays smooth. Decided from device hints, a frame-rate check
 * done once on the hub, and a `?lite=0|1` override for testing.
 */

export interface DeviceHints {
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
}

const STORAGE_KEY = 'fliper.lite.v1';

/** Phones with 4 cores or fewer, or 2 GB of memory or less, start in lite mode. */
export function isLowEndDevice(hints: DeviceHints): boolean {
  const { hardwareConcurrency: cores, deviceMemory: memory } = hints;
  if (typeof memory === 'number' && memory > 0 && memory <= 2) return true;
  return typeof cores === 'number' && cores > 0 && cores <= 4;
}

/** The query override wins, then a past measurement, then the device hints. */
export function resolveLite(search: string, stored: string | null, hints: DeviceHints): boolean {
  const asked = new URLSearchParams(search).get('lite');
  if (asked === '1') return true;
  if (asked === '0') return false;
  if (stored === '1') return true;
  return isLowEndDevice(hints);
}

let cached: boolean | null = null;

/** True when the heavy decorations should be skipped. */
export function isLite(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return (cached = false);
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); the hints are enough.
  }
  cached = resolveLite(window.location.search, stored, navigator as DeviceHints);
  return cached;
}

/** Remembers that this device is slow, so the next visit starts in lite mode. */
export function rememberSlowDevice(): void {
  cached = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Not persisted; this visit is still lite.
  }
}

/**
 * Decides from frame timestamps whether the device is too slow. Frames over `gapMs` (tab hidden,
 * a loading hiccup) don't count, and nothing is judged until `warmupMs` of intro animation passed.
 */
export class FrameMeter {
  private last = -1;
  private warmed = 0;
  private time = 0;
  private frames = 0;
  private done = false;

  constructor(
    private readonly minFps = 40,
    private readonly warmupMs = 2000,
    private readonly sampleMs = 3000,
    private readonly gapMs = 250,
  ) {}

  /** Feed the frame timestamp (ms); returns 'slow' once, when the sample says so. */
  push(now: number): 'slow' | null {
    if (this.done) return null;
    const dt = this.last < 0 ? 0 : now - this.last;
    this.last = now;
    if (dt <= 0 || dt > this.gapMs) return null;
    if (this.warmed < this.warmupMs) {
      this.warmed += dt;
      return null;
    }
    this.time += dt;
    this.frames++;
    if (this.time < this.sampleMs) return null;
    this.done = true;
    return (this.frames * 1000) / this.time < this.minFps ? 'slow' : null;
  }

  get finished(): boolean {
    return this.done;
  }
}
