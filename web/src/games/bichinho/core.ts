/**
 * "Bichinho" — pure rules of a virtual pet. Hunger, fun, cleanliness and energy drain away; feed,
 * play, wash and put it to sleep. The longer and happier it lives, the more points you get.
 */
export type Need = 'fome' | 'diversao' | 'limpeza' | 'energia';
export const NEEDS: readonly Need[] = ['fome', 'diversao', 'limpeza', 'energia'];
export const LABELS: Readonly<Record<Need, string>> = {
  fome: 'Fome',
  diversao: 'Diversão',
  limpeza: 'Limpeza',
  energia: 'Energia',
};
const DECAY: Readonly<Record<Need, number>> = {
  fome: 1.4,
  diversao: 1.8,
  limpeza: 1.0,
  energia: 0.9,
};
/** Seconds a need can sit at zero (in total) before the pet gets sick for good. */
const PATIENCE = 6;
const COOLDOWN = 0.8;

export class PetSim {
  needs: Record<Need, number> = { fome: 80, diversao: 80, limpeza: 80, energia: 80 };
  age = 0;
  happy = 0;
  starving = 0;
  sleeping = false;
  cd = 0;
  alive = true;
  /** Last overfeeding or a failed action, for the scene to react to. */
  note = '';

  get mood(): number {
    return Math.min(...NEEDS.map((n) => this.needs[n]));
  }

  get score(): number {
    return Math.floor(this.happy * 2);
  }

  private bump(n: Need, by: number): void {
    this.needs[n] = Math.max(0, Math.min(100, this.needs[n] + by));
  }

  feed(): boolean {
    if (!this.alive || this.sleeping || this.cd > 0) return false;
    this.cd = COOLDOWN;
    if (this.needs.fome > 90) {
      this.bump('limpeza', -15);
      this.note = 'Empanzinado!';
    }
    this.bump('fome', 40);
    return true;
  }

  play(): boolean {
    if (!this.alive || this.sleeping || this.cd > 0 || this.needs.energia < 15) return false;
    this.cd = COOLDOWN;
    this.bump('diversao', 35);
    this.bump('energia', -10);
    return true;
  }

  wash(): boolean {
    if (!this.alive || this.sleeping || this.cd > 0) return false;
    this.cd = COOLDOWN;
    this.bump('limpeza', 60);
    this.bump('diversao', -5);
    return true;
  }

  toggleSleep(): boolean {
    if (!this.alive) return false;
    this.sleeping = !this.sleeping;
    return true;
  }

  step(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    this.cd = Math.max(0, this.cd - dt);
    const scale = 1 + this.age / 300;
    const k = this.sleeping ? 0.4 : 1;
    for (const n of NEEDS) {
      if (n === 'energia' && this.sleeping) this.bump(n, 6 * dt);
      else this.bump(n, -DECAY[n] * scale * k * dt);
    }
    if (NEEDS.some((n) => this.needs[n] <= 0)) this.starving += dt;
    if (this.starving > PATIENCE) this.alive = false;
    this.happy += (dt * this.mood) / 100;
  }
}

/** Looks after the lowest need, and sleeps when worn out. */
export function botAct(s: PetSim): void {
  if (s.sleeping) {
    if (s.needs.energia > 92) s.toggleSleep();
    return;
  }
  if (s.needs.energia < 25) {
    s.toggleSleep();
    return;
  }
  const order = [...NEEDS].filter((n) => n !== 'energia').sort((a, b) => s.needs[a] - s.needs[b]);
  const lowest = order[0]!;
  if (s.needs[lowest] > 55) return;
  if (lowest === 'fome') s.feed();
  else if (lowest === 'diversao') s.play();
  else s.wash();
}
