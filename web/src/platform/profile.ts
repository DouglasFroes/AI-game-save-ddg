import { createId, readJson, writeJson, type KeyValueStore } from './storage';

/** What the player wants to hear and feel; one switch per kind of feedback. */
export interface SoundPrefs {
  /** Master switch: when true nothing plays, whatever the switches below say. */
  readonly muted: boolean;
  /** Button taps, in the menu and inside the games. */
  readonly uiSounds: boolean;
  /** Everything else: hits, wins, pops, stars... */
  readonly gameSounds: boolean;
  /** Haptic feedback on phones that support it; independent from the sounds. */
  readonly vibration: boolean;
  /** Loudness from MIN_VOLUME to 1. */
  readonly volume: number;
}

export const MIN_VOLUME = 0.1;
export const DEFAULT_SOUND: SoundPrefs = {
  muted: false,
  uiSounds: true,
  gameSounds: true,
  vibration: true,
  volume: 1,
};

/** Player identity and settings shared by every game. */
export interface Profile extends SoundPrefs {
  readonly version: 1;
  readonly playerId: string;
  readonly name: string;
}

const PROFILE_KEY = 'arcade.profile.v1';
/** Save format of the single-game version; read once to keep the old name/settings. */
const LEGACY_KEY = 'sod.progress.v2';

export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.playerId !== 'string' || !r.playerId) return null;
  return {
    version: 1,
    playerId: r.playerId,
    name:
      typeof r.name === 'string' ? r.name : typeof r.playerName === 'string' ? r.playerName : '',
    muted: r.muted === true,
    uiSounds: r.uiSounds !== false,
    gameSounds: r.gameSounds !== false,
    vibration: r.vibration !== false,
    volume:
      typeof r.volume === 'number' && Number.isFinite(r.volume)
        ? Math.min(1, Math.max(MIN_VOLUME, r.volume))
        : 1,
  };
}

export class ProfileRepository {
  private current: Profile;

  constructor(private readonly store: KeyValueStore) {
    this.current = parseProfile(readJson(store, PROFILE_KEY)) ??
      parseProfile(readJson(store, LEGACY_KEY)) ?? {
        version: 1,
        playerId: createId(),
        name: '',
        ...DEFAULT_SOUND,
      };
    writeJson(store, PROFILE_KEY, this.current);
  }

  get(): Profile {
    return this.current;
  }

  update(patch: Partial<Pick<Profile, 'name'> & SoundPrefs>): Profile {
    this.current = { ...this.current, ...patch };
    writeJson(this.store, PROFILE_KEY, this.current);
    return this.current;
  }
}
