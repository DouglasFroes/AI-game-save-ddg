/**
 * "Desarme a Bomba" — pure rules. Each bomb has 3–6 coloured wires, a serial number and a rule
 * card for its wire count; read the rules and cut the one right wire before the timer ends.
 * A wrong cut or a timeout blows up a life. Bombs get more wires and shorter fuses.
 */
export type Wire = 'vermelho' | 'azul' | 'amarelo' | 'branco' | 'preto';
export const WIRES: readonly Wire[] = ['vermelho', 'azul', 'amarelo', 'branco', 'preto'];
export const LIVES = 3;

/** The rule card for each wire count (shown to the player, in order: first match wins). */
export const RULES: Readonly<Record<number, readonly string[]>> = {
  3: [
    'Se não há fio vermelho, corte o 2º fio.',
    'Senão, se o último fio é branco, corte o último.',
    'Senão, se há mais de um fio azul, corte o último azul.',
    'Senão, corte o último fio.',
  ],
  4: [
    'Se há mais de um vermelho e o número de série é ímpar, corte o último vermelho.',
    'Senão, se o último é amarelo e não há vermelho, corte o 1º.',
    'Senão, se há exatamente um azul, corte o 1º.',
    'Senão, se há mais de um amarelo, corte o último.',
    'Senão, corte o 2º fio.',
  ],
  5: [
    'Se o último é preto e o número de série é ímpar, corte o 4º.',
    'Senão, se há um só vermelho e mais de um amarelo, corte o 1º.',
    'Senão, se não há preto, corte o 2º.',
    'Senão, corte o 1º fio.',
  ],
  6: [
    'Se não há amarelo e o número de série é ímpar, corte o 3º.',
    'Senão, se há um só amarelo e mais de um branco, corte o 4º.',
    'Senão, se não há vermelho, corte o último.',
    'Senão, corte o 4º fio.',
  ],
};

/** Index of the wire to cut. `odd`: the serial number's last digit is odd. */
export function correctWire(wires: readonly Wire[], odd: boolean): number {
  const count = (c: Wire) => wires.filter((w) => w === c).length;
  const last = wires.length - 1;
  const lastOf = (c: Wire) => wires.lastIndexOf(c);
  switch (wires.length) {
    case 3:
      if (count('vermelho') === 0) return 1;
      if (wires[last] === 'branco') return last;
      if (count('azul') > 1) return lastOf('azul');
      return last;
    case 4:
      if (count('vermelho') > 1 && odd) return lastOf('vermelho');
      if (wires[last] === 'amarelo' && count('vermelho') === 0) return 0;
      if (count('azul') === 1) return 0;
      if (count('amarelo') > 1) return last;
      return 1;
    case 5:
      if (wires[last] === 'preto' && odd) return 3;
      if (count('vermelho') === 1 && count('amarelo') > 1) return 0;
      if (count('preto') === 0) return 1;
      return 0;
    default:
      if (count('amarelo') === 0 && odd) return 2;
      if (count('amarelo') === 1 && count('branco') > 1) return 3;
      if (count('vermelho') === 0) return last;
      return 3;
  }
}

export interface Bomb {
  readonly wires: readonly Wire[];
  readonly serial: string;
  readonly odd: boolean;
  readonly fuse: number;
}

export function makeBomb(n: number, rng: () => number): Bomb {
  const count = n <= 3 ? 3 : n <= 6 ? 4 : n <= 9 ? 5 : 3 + Math.floor(rng() * 4);
  const wires = Array.from({ length: count }, () => WIRES[Math.floor(rng() * WIRES.length)]!);
  const letters = 'ABCDEFGHJKLMNPRSTUVXZ';
  const serial =
    Array.from({ length: 4 }, () => letters[Math.floor(rng() * letters.length)]).join('') +
    String(Math.floor(rng() * 10));
  return { wires, serial, odd: Number(serial.at(-1)) % 2 === 1, fuse: Math.max(9, 26 - n * 1.3) };
}

export type CutResult =
  { kind: 'defused'; points: number } | { kind: 'boom'; correct: number; livesLeft: number };

export class DefuseRun {
  bombNo = 1;
  bomb: Bomb;
  timeLeft: number;
  lives = LIVES;
  score = 0;
  defused = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.bomb = makeBomb(1, rng);
    this.timeLeft = this.bomb.fuse;
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  next(): void {
    this.bombNo++;
    this.bomb = makeBomb(this.bombNo, this.rng);
    this.timeLeft = this.bomb.fuse;
  }

  /** Counts the fuse down; returns a boom when it runs out. */
  tick(dt: number): CutResult | null {
    if (this.over || this.timeLeft <= 0) return null;
    this.timeLeft -= dt;
    if (this.timeLeft > 0) return null;
    this.timeLeft = 0;
    this.lives--;
    return {
      kind: 'boom',
      correct: correctWire(this.bomb.wires, this.bomb.odd),
      livesLeft: this.lives,
    };
  }

  cut(i: number): CutResult {
    const correct = correctWire(this.bomb.wires, this.bomb.odd);
    if (i === correct) {
      const points = Math.round((100 + this.timeLeft * 12) * (1 + this.bombNo * 0.15));
      this.score += points;
      this.defused++;
      this.timeLeft = 0;
      return { kind: 'defused', points };
    }
    this.lives--;
    this.timeLeft = 0;
    return { kind: 'boom', correct, livesLeft: this.lives };
  }
}
