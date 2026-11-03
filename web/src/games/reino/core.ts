/**
 * "Reino" — pure rules. You are the ruler: every card is a request with two answers, each one
 * moving four gauges (people, army, faith, treasury). If any gauge hits 0 or 100, the reign ends.
 */
export const STATS = ['Povo', 'Exército', 'Fé', 'Tesouro'] as const;
export const EMOJIS = ['👥', '⚔️', '⛪', '💰'] as const;
export type Effects = readonly [number, number, number, number];

export interface Answer {
  label: string;
  fx: Effects;
}
export interface Card {
  who: string;
  text: string;
  left: Answer;
  right: Answer;
}

const c = (who: string, text: string, l: [string, Effects], r: [string, Effects]): Card => ({
  who,
  text,
  left: { label: l[0], fx: l[1] },
  right: { label: r[0], fx: r[1] },
});

export const CARDS: readonly Card[] = [
  c(
    'Camponês',
    'Os impostos estão pesados, majestade.',
    ['Reduzir', [9, 0, 0, -10]],
    ['Manter', [-9, 0, 0, 9]],
  ),
  c(
    'General',
    'Precisamos de mais soldados nas fronteiras.',
    ['Recrutar', [-7, 11, 0, -7]],
    ['Recusar', [4, -10, 0, 4]],
  ),
  c(
    'Bispo',
    'Uma nova catedral honraria os céus.',
    ['Construir', [3, 0, 11, -12]],
    ['Negar', [-2, 0, -10, 8]],
  ),
  c(
    'Tesoureiro',
    'O cofre está baixo. Vender títulos?',
    ['Vender', [-5, 0, -5, 13]],
    ['Não', [4, 0, 4, -8]],
  ),
  c(
    'Mercador',
    'Posso trazer especiarias, com uma taxa.',
    ['Aceitar', [5, 0, 0, 9]],
    ['Recusar', [-4, 0, 0, -6]],
  ),
  c(
    'Capitão',
    'Bandidos nas estradas! Mandar a guarda?',
    ['Mandar', [8, -7, 0, -4]],
    ['Ignorar', [-9, 5, 0, 4]],
  ),
  c(
    'Padre',
    'Festa em honra ao santo da cidade?',
    ['Festejar', [8, 0, 8, -10]],
    ['Adiar', [-5, 0, -8, 6]],
  ),
  c(
    'Fazendeiro',
    'A colheita foi fraca. Abrir o celeiro real?',
    ['Abrir', [11, 0, 0, -8]],
    ['Fechar', [-11, 0, 0, 5]],
  ),
  c(
    'Espião',
    'O reino vizinho prepara algo. Atacar primeiro?',
    ['Atacar', [-6, 9, 0, -9]],
    ['Esperar', [3, -8, 0, 4]],
  ),
  c(
    'Sábio',
    'Uma biblioteca traria progresso.',
    ['Fundar', [7, 0, 4, -10]],
    ['Recusar', [-4, 0, -4, 6]],
  ),
  c(
    'Ferreiro',
    'Mais armaduras custam caro, mas protegem.',
    ['Encomendar', [0, 10, 0, -9]],
    ['Dispensar', [0, -9, 0, 7]],
  ),
  c(
    'Nobre',
    'Peço um título de terras em troca de lealdade.',
    ['Conceder', [-6, 6, 0, 6]],
    ['Negar', [5, -6, 0, -5]],
  ),
  c(
    'Curandeira',
    'Uma doença se espalha na vila.',
    ['Ajudar', [10, 0, -3, -9]],
    ['Isolar', [-8, 0, 4, 5]],
  ),
  c(
    'Pregador',
    'Um profeta prega contra o trono.',
    ['Prender', [-5, 6, -9, 0]],
    ['Ouvir', [4, -5, 9, 0]],
  ),
  c(
    'Embaixador',
    'Um casamento selaria a paz.',
    ['Casar', [4, 6, 0, -9]],
    ['Recusar', [-3, -7, 0, 6]],
  ),
  c(
    'Pescador',
    'O porto precisa de reforma.',
    ['Reformar', [9, 0, 0, -10]],
    ['Esperar', [-7, 0, 0, 7]],
  ),
  c(
    'Soldado',
    'O soldo atrasou há semanas...',
    ['Pagar', [0, 10, 0, -10]],
    ['Prometer', [0, -10, 0, 8]],
  ),
  c(
    'Monge',
    'Podemos dar esmolas aos pobres.',
    ['Dar', [8, 0, 7, -9]],
    ['Guardar', [-7, 0, -6, 8]],
  ),
  c(
    'Caçador',
    'Os lobos estão atacando os rebanhos.',
    ['Caçar', [7, -4, 0, -4]],
    ['Deixar', [-8, 4, 0, 4]],
  ),
  c(
    'Juiz',
    'Um nobre foi pego roubando. Punir?',
    ['Punir', [6, -6, 4, 0]],
    ['Perdoar', [-6, 6, -4, 0]],
  ),
  c(
    'Bardo',
    'Uma canção sobre seu reinado, majestade?',
    ['Pagar', [6, 0, 4, -8]],
    ['Calar', [-4, 0, -3, 5]],
  ),
  c(
    'Engenheiro',
    'Muralhas mais altas protegeriam a capital.',
    ['Erguer', [-4, 9, 0, -9]],
    ['Poupar', [4, -8, 0, 8]],
  ),
  c(
    'Viajante',
    'Há ouro nas montanhas, dizem.',
    ['Explorar', [-5, 0, 0, 12]],
    ['Ignorar', [4, 0, 0, -6]],
  ),
  c(
    'Rainha',
    'O povo quer ver o rei em um desfile.',
    ['Desfilar', [9, 4, 0, -9]],
    ['Recusar', [-7, -4, 0, 6]],
  ),
];

export class KingdomSim {
  stats: [number, number, number, number] = [50, 50, 50, 50];
  years = 0;
  card: Card;
  over: { stat: number; high: boolean } | null = null;
  private last = -1;

  constructor(private readonly rng: () => number = Math.random) {
    this.card = this.draw();
  }

  private draw(): Card {
    let i = Math.floor(this.rng() * CARDS.length);
    if (i === this.last) i = (i + 1) % CARDS.length;
    this.last = i;
    return CARDS[i]!;
  }

  get score(): number {
    return this.years;
  }

  /** Preview of the gauges after an answer. */
  after(side: 'left' | 'right'): number[] {
    return this.stats.map((v, i) => v + this.card[side].fx[i]!);
  }

  answer(side: 'left' | 'right'): void {
    if (this.over) return;
    const next = this.after(side);
    this.stats = next as [number, number, number, number];
    this.years++;
    const bad = next.findIndex((v) => v <= 0 || v >= 100);
    if (bad >= 0) {
      this.over = { stat: bad, high: next[bad]! >= 100 };
      return;
    }
    this.card = this.draw();
  }
}

/** Picks the answer that keeps the gauges closest to the middle. */
export function botChoose(s: KingdomSim): 'left' | 'right' {
  const cost = (side: 'left' | 'right') =>
    s.after(side).reduce((a, v) => a + (v - 50) * (v - 50) * (Math.abs(v - 50) > 35 ? 3 : 1), 0);
  return cost('left') <= cost('right') ? 'left' : 'right';
}
