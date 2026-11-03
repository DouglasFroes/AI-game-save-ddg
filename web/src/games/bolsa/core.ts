/**
 * "Bolsa" — pure rules. Three stocks wander at random, but the news tells you (mostly right) which
 * one is about to jump or crash. Buy before the jump, sell before the crash; 60 seconds.
 */
export const DURATION = 60;
export const START_CASH = 1000;
export const NAMES = ['Doce S.A.', 'Foguete Cia.', 'Ovo Corp.'] as const;
export const EMOJIS = ['🍬', '🚀', '🥚'] as const;
/** Seconds between the headline and the move. */
export const NEWS_DELAY = 2.5;
const MOVE_TIME = 3;
const DRIFT = 0.075;

export interface News {
  stock: number;
  /** What the headline says: +1 up, -1 down. */
  dir: 1 | -1;
  /** Seconds until the move starts. */
  wait: number;
}

export class MarketSim {
  t = 0;
  cash = START_CASH;
  shares = [0, 0, 0];
  prices = [100, 100, 100];
  history: number[][] = [[100], [100], [100]];
  news: News | null = null;
  /** Active drift per stock (per second, log scale) and the seconds it lasts. */
  private drift = [0, 0, 0];
  private driftLeft = [0, 0, 0];
  private newsIn = 3;
  private sample = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get done(): boolean {
    return this.t >= DURATION;
  }

  netWorth(): number {
    return this.cash + this.shares.reduce((a, n, i) => a + n * this.prices[i]!, 0);
  }

  get score(): number {
    return Math.round(this.netWorth());
  }

  /** Spends `frac` of the cash on stock `i`. Returns the shares bought. */
  buy(i: number, frac = 1): number {
    const spend = this.cash * Math.min(1, Math.max(0, frac));
    if (this.done || spend < 1) return 0;
    const n = spend / this.prices[i]!;
    this.cash -= spend;
    this.shares[i]! += n;
    return n;
  }

  /** Sells `frac` of the shares of stock `i`. Returns the cash received. */
  sell(i: number, frac = 1): number {
    const n = this.shares[i]! * Math.min(1, Math.max(0, frac));
    if (this.done || n <= 0) return 0;
    const cash = n * this.prices[i]!;
    this.shares[i]! -= n;
    this.cash += cash;
    return cash;
  }

  private noise(): number {
    return (this.rng() + this.rng() + this.rng() - 1.5) * 2;
  }

  step(dt: number): void {
    if (this.done) return;
    this.t = Math.min(DURATION, this.t + dt);
    for (let i = 0; i < 3; i++) {
      let move = this.noise() * 0.16 * Math.sqrt(dt);
      if (this.driftLeft[i]! > 0) {
        move += this.drift[i]! * dt;
        this.driftLeft[i] = this.driftLeft[i]! - dt;
      }
      this.prices[i] = Math.max(5, this.prices[i]! * Math.exp(move));
    }
    this.sample += dt;
    if (this.sample >= 0.5) {
      this.sample = 0;
      for (let i = 0; i < 3; i++) this.history[i]!.push(this.prices[i]!);
    }
    if (this.news) {
      this.news.wait -= dt;
      if (this.news.wait <= 0) {
        // Headlines are right four times out of five.
        const real = this.rng() < 0.8 ? this.news.dir : -this.news.dir;
        this.drift[this.news.stock] = real * DRIFT;
        this.driftLeft[this.news.stock] = MOVE_TIME;
        this.news = null;
      }
    } else {
      this.newsIn -= dt;
      if (this.newsIn <= 0) {
        this.news = {
          stock: Math.floor(this.rng() * 3),
          dir: this.rng() < 0.5 ? 1 : -1,
          wait: NEWS_DELAY,
        };
        this.newsIn = 5 + this.rng() * 2;
      }
    }
  }
}

/** Follows the headlines: all-in on the stock that will jump, out of the ones that will crash. */
export function botAct(s: MarketSim): void {
  const n = s.news;
  if (n && n.wait > NEWS_DELAY - 0.4) {
    if (n.dir === 1) {
      for (let i = 0; i < 3; i++) if (i !== n.stock) s.sell(i);
      s.buy(n.stock);
    } else s.sell(n.stock);
  } else if (!n && s.t > 1) {
    // Move was a few seconds ago: cash out of anything that already ran.
    for (let i = 0; i < 3; i++) if (s.prices[i]! > 118) s.sell(i);
  }
}
