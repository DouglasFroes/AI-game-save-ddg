import { PARRY_WINDOW, NO_INPUT, type FightInput, type FightSim, type Rng } from './core';

type Mode = 'approach' | 'attack' | 'retreat';

/**
 * The CPU. `skill` (0–1) sets how often it reads the player's attacks (guard / parry), how fast it
 * chains hits and how smartly it uses its power.
 */
export class Brain {
  private clock = 0;
  private mode: Mode = 'approach';
  private nextThink = 0;
  private nextAttack = 0;
  private guardFrom = -1;
  private guardUntil = -1;
  private seenAttack = false;
  private seenShot = 0;
  private jumpUntil = 0;

  constructor(
    private readonly skill: number,
    private readonly rnd: Rng = Math.random,
  ) {}

  think(sim: FightSim, dt: number): FightInput {
    this.clock += dt;
    const me = sim.fighters[1];
    const foe = sim.fighters[0];
    const input: FightInput = { ...NO_INPUT };
    if (me.state === 'hit' || me.state === 'down' || me.state === 'ko') {
      this.seenAttack = false;
      return input;
    }
    const dx = foe.x - me.x;
    const dist = Math.abs(dx);
    const toward = dx >= 0 ? 'right' : 'left';
    const away = dx >= 0 ? 'left' : 'right';
    const foeAttacking = foe.state === 'attack' || foe.state === 'power';

    // Read the player's attack and raise the guard so it lands inside the parry window.
    if (foeAttacking && !this.seenAttack && dist < 190) {
      this.seenAttack = true;
      if (this.rnd() < 0.2 + 0.7 * this.skill) {
        const jitter = (1 - this.skill) * 0.12 * this.rnd();
        this.guardFrom = this.clock + Math.max(0, 0.05 - PARRY_WINDOW / 2 + jitter);
        this.guardUntil = this.guardFrom + 0.3;
      }
    }
    if (!foeAttacking) this.seenAttack = false;
    if (this.clock >= this.guardFrom && this.clock < this.guardUntil && me.guard > 0) {
      input.guard = true;
      return input;
    }

    // Incoming shots: hop over them or brace.
    const shot = sim.projectiles.find(
      (p) =>
        p.owner === 0 && Math.abs(p.x - me.x) < 280 && Math.sign(me.x - p.x) === Math.sign(p.vx),
    );
    if (shot && shot.id !== this.seenShot) {
      this.seenShot = shot.id;
      if (this.rnd() < 0.3 + 0.6 * this.skill) {
        if (this.rnd() < 0.5) this.jumpUntil = this.clock + 0.05;
        else {
          this.guardFrom =
            this.clock + Math.max(0, (Math.abs(shot.x - me.x) - 60) / Math.abs(shot.vx) - 0.04);
          this.guardUntil = this.guardFrom + 0.3;
        }
      }
    }
    if (this.clock < this.jumpUntil && me.state !== 'jump') {
      input.jump = true;
      this.jumpUntil = 0;
      return input;
    }
    // A lightning mark under our feet: step away.
    const strike = sim.strikes.find((s) => s.owner === 0 && Math.abs(s.x - me.x) < 110);
    if (strike) {
      input[strike.x > me.x ? 'left' : 'right'] = true;
      return input;
    }

    if (this.clock >= this.nextThink) {
      this.nextThink = this.clock + 0.35 - 0.2 * this.skill + this.rnd() * 0.15;
      if (dist > 150) this.mode = this.rnd() < 0.85 ? 'approach' : 'retreat';
      else this.mode = this.rnd() < 0.55 + 0.4 * this.skill ? 'attack' : 'retreat';
    }

    // Power: use it when it makes sense, as soon as it is ready.
    if (
      me.powerCd <= 0 &&
      (me.state === 'idle' || me.state === 'walk') &&
      this.rnd() < 0.05 + 0.1 * this.skill
    ) {
      const kind = me.setup.power;
      const fits =
        kind === 'heal'
          ? me.hp < me.setup.maxHp * 0.65
          : kind === 'quake'
            ? dist < 190
            : kind === 'dash' || kind === 'dive'
              ? dist > 150 && dist < 480
              : true;
      if (fits) {
        input.power = true;
        return input;
      }
    }

    if (this.mode === 'approach') input[toward] = dist > 110;
    else if (this.mode === 'retreat') input[away] = true;
    else if (dist > 120) input[toward] = true;
    else if (this.clock >= this.nextAttack && me.state !== 'jump') {
      input.attack = true;
      // Chains faster and with fewer pauses as skill grows.
      this.nextAttack = this.clock + 0.14 + (1 - this.skill) * 0.3 + this.rnd() * 0.12;
    }
    if (me.state === 'attack' && !input.attack && this.rnd() < 0.02 + 0.03 * this.skill)
      input.attack = true;
    if (this.mode === 'approach' && dist > 220 && this.rnd() < 0.004) input.jump = true;
    return input;
  }
}
