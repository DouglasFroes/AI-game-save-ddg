export const COURT_LEFT = 45;
export const COURT_RIGHT = 675;
export const NET_X = 360;
export const NET_TOP_Y = 755;
export const SAND_Y = 960;
export const SET_TARGET = 5;

export type VoleiEvent =
  | { type: 'hit'; who: 'player' | 'ai'; spike: boolean; x: number; y: number }
  | { type: 'point'; winner: 'player' | 'ai'; myPts: number; aiPts: number }
  | { type: 'setWon'; setsWon: number; bonus: number }
  | { type: 'matchLost' };

export class VoleiSim {
  px = 180;
  py = SAND_Y;
  pvy = 0;
  targetPx = 180;

  ax = 540;
  ay = SAND_Y;
  avy = 0;

  bx = 180;
  by = 520;
  bvx = 210;
  bvy = -180;

  myPts = 0;
  aiPts = 0;
  setsWon = 0;
  totalPoints = 0;
  score = 0;
  private hitCooldown = 0;

  constructor() {
    this.serve('player');
  }

  serve(server: 'player' | 'ai'): void {
    this.px = 180;
    this.py = SAND_Y;
    this.pvy = 0;
    this.ax = 540;
    this.ay = SAND_Y;
    this.avy = 0;
    if (server === 'player') {
      this.bx = 190;
      this.by = 540;
      this.bvx = 230;
      this.bvy = -220;
    } else {
      this.bx = 530;
      this.by = 540;
      this.bvx = -230;
      this.bvy = -220;
    }
    this.hitCooldown = 0.15;
  }

  jump(): boolean {
    if (this.py < SAND_Y - 4) return false;
    this.pvy = -690;
    return true;
  }

  step(dt: number): VoleiEvent[] {
    const events: VoleiEvent[] = [];
    if (this.hitCooldown > 0) this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // Move player horizontally
    const diffP = this.targetPx - this.px;
    const maxP = 520 * dt;
    if (Math.abs(diffP) <= maxP) this.px = this.targetPx;
    else this.px += Math.sign(diffP) * maxP;
    this.px = Math.max(COURT_LEFT + 38, Math.min(NET_X - 46, this.px));

    // Player vertical physics
    this.pvy += 1550 * dt;
    this.py += this.pvy * dt;
    if (this.py >= SAND_Y) {
      this.py = SAND_Y;
      this.pvy = 0;
    }

    // AI movement & jump
    const aiSpeed = (310 + this.setsWon * 38) * dt;
    const desiredAx =
      this.bx > NET_X - 40 ? Math.max(NET_X + 52, Math.min(COURT_RIGHT - 38, this.bx + 18)) : 540;
    const diffA = desiredAx - this.ax;
    if (Math.abs(diffA) <= aiSpeed) this.ax = desiredAx;
    else this.ax += Math.sign(diffA) * aiSpeed;
    this.ax = Math.max(NET_X + 46, Math.min(COURT_RIGHT - 38, this.ax));

    if (
      this.ay >= SAND_Y - 2 &&
      this.bx > NET_X &&
      Math.abs(this.bx - this.ax) < 75 &&
      this.by > 640 &&
      this.by < 850 &&
      this.bvy > 0
    ) {
      this.avy = -650;
    }
    this.avy += 1550 * dt;
    this.ay += this.avy * dt;
    if (this.ay >= SAND_Y) {
      this.ay = SAND_Y;
      this.avy = 0;
    }

    // Ball physics
    this.bvy += 980 * dt;
    this.bx += this.bvx * dt;
    this.by += this.bvy * dt;

    // Wall bounces
    if (this.bx < COURT_LEFT + 24) {
      this.bx = COURT_LEFT + 24;
      this.bvx = Math.abs(this.bvx) * 0.85;
    } else if (this.bx > COURT_RIGHT - 24) {
      this.bx = COURT_RIGHT - 24;
      this.bvx = -Math.abs(this.bvx) * 0.85;
    }

    // Net collision
    if (this.by + 24 >= NET_TOP_Y && Math.abs(this.bx - NET_X) < 26) {
      if (this.by < NET_TOP_Y + 22 && this.bvy > 0) {
        this.by = NET_TOP_Y - 24;
        this.bvy = -Math.abs(this.bvy) * 0.72;
      } else {
        this.bvx = this.bx < NET_X ? -Math.abs(this.bvx) * 0.8 : Math.abs(this.bvx) * 0.8;
        this.bx = this.bx < NET_X ? NET_X - 28 : NET_X + 28;
      }
    }

    // Player hit check
    const pHeadY = this.py - 46;
    if (this.hitCooldown <= 0 && Math.hypot(this.bx - this.px, this.by - pHeadY) < 66) {
      this.hitCooldown = 0.22;
      const spike = this.py < SAND_Y - 45 && this.px > 200;
      if (spike) {
        this.bvx = 480;
        this.bvy = -310;
        this.score += 30;
      } else {
        this.bvx = Math.max(210, Math.min(420, 290 + (this.bx - this.px) * 3.2));
        this.bvy = -690;
        this.score += 10;
      }
      events.push({ type: 'hit', who: 'player', spike, x: this.bx, y: this.by });
    }

    // AI hit check
    const aHeadY = this.ay - 46;
    if (this.hitCooldown <= 0 && Math.hypot(this.bx - this.ax, this.by - aHeadY) < 66) {
      this.hitCooldown = 0.22;
      const spike = this.ay < SAND_Y - 45 && this.ax < 510;
      this.bvx = spike ? -430 : -(250 + Math.random() * 130);
      this.bvy = spike ? -340 : -680;
      events.push({ type: 'hit', who: 'ai', spike, x: this.bx, y: this.by });
    }

    // Sand touch (point scored)
    if (this.by >= SAND_Y - 20) {
      const playerWonPoint = this.bx >= NET_X;
      if (playerWonPoint) {
        this.myPts++;
        this.totalPoints++;
        this.score += 150;
        events.push({ type: 'point', winner: 'player', myPts: this.myPts, aiPts: this.aiPts });
        if (this.myPts >= SET_TARGET) {
          this.setsWon++;
          const bonus = 500 * this.setsWon;
          this.score += bonus;
          this.myPts = 0;
          this.aiPts = 0;
          events.push({ type: 'setWon', setsWon: this.setsWon, bonus });
        }
        this.serve('player');
      } else {
        this.aiPts++;
        events.push({ type: 'point', winner: 'ai', myPts: this.myPts, aiPts: this.aiPts });
        if (this.aiPts >= SET_TARGET) {
          events.push({ type: 'matchLost' });
        } else {
          this.serve('ai');
        }
      }
    }

    return events;
  }
}
