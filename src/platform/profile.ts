import { createId, readJson, writeJson, type KeyValueStore } from './storage';

/** Player identity and settings shared by every game. */
export interface Profile {
  readonly version: 1;
  readonly playerId: string;
  readonly name: string;
  readonly muted: boolean;
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
        muted: false,
      };
    writeJson(store, PROFILE_KEY, this.current);
  }

  get(): Profile {
    return this.current;
  }

  update(patch: Partial<Pick<Profile, 'name' | 'muted'>>): Profile {
    this.current = { ...this.current, ...patch };
    writeJson(this.store, PROFILE_KEY, this.current);
    return this.current;
  }
}
