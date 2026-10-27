import { readJson, writeJson, type KeyValueStore } from '@/platform/storage';
import { parseProgress, type MemoProgress } from './core';

const KEY = 'arcade.memofases.v1';

/** Saved stars of "Memória: Aventura". */
export class MemoProgressRepository {
  private current: MemoProgress;

  constructor(private readonly store: KeyValueStore) {
    this.current = parseProgress(readJson(store, KEY));
  }

  get(): MemoProgress {
    return this.current;
  }

  update(fn: (p: MemoProgress) => MemoProgress): MemoProgress {
    this.current = fn(this.current);
    writeJson(this.store, KEY, this.current);
    return this.current;
  }
}
