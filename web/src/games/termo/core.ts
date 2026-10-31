/**
 * "Palavra Secreta" — pure rules of an endless five-letter word guessing game (Wordle-like).
 * Six tries per word; green = right letter in the right place, yellow = in the word elsewhere.
 * A word guessed in fewer tries is worth more, and a streak of words multiplies the points.
 */
export const WORD_LEN = 5;
export const MAX_TRIES = 6;
export const LIVES = 3;

/** Answers: common pt-BR words, accents dropped (as in the popular word games). */
export const WORDS: readonly string[] = `
AMIGO BARCO CARTA DENTE FESTA FLORA GENTE HORTA IDEIA LIVRO MUNDO NOITE OUTRO PRAIA QUEDA RISCO
SONHO TERRA UNIAO VENTO ZEBRA ABRIR ACHAR ANDAR BAIXO BANCO BEIJO BOLSA BRACO CAMPO CANTO CARRO
CASAL CERTO CHAVE CHUVA CINCO CLARO CORPO COURO CRAVO CULPA DADOS DIABO DISCO DOIDO DUPLA ETAPA
FACIL FAIXA FALSO FERRO FILHO FINAL FOLHA FORCA FORMA FORNO FRACO FRUTA FUMAR FUNDO GALHO GARFO
GOLPE GORDO GRAMA GRAVE GRITO GRUPO HONRA HOTEL IGUAL JEITO JOVEM JUSTO LAPIS LARGO LEITE LENTO
LIMAO LINDO LINHA LOUCO LUGAR MACIO MAGRO MANGA MARCA MASSA MEDIO MENTE METAL MOEDA MORTE MOTOR
MUITO MUSGO NADAR NAVIO NINHO NIVEL NOBRE NORTE NUVEM OLHAR ONTEM ORDEM OUVIR PADRE PALCO PAPEL
PARDO PARTE PASSO PASTA PATIO PEDRA PEITO PEIXE PERTO PIANO PILHA PISTA PLANO PODER POLVO PONTE
PORCO PORTA POUCO PRATO PRAZO PRETO PRIMO PULSO QUASE RAIVA RAMPA RAPAZ REINO RESTO RITMO RODAR
ROUPA SABAO SABER SAIDA SALTO SAMBA SANTO SAUDE SELVA SENHA SERRA SINAL SOBRA SOGRA SOLTO SORTE
SUAVE SUJAR SUSTO TARDE TECLA TELHA TEMPO TENIS TERMO TESTE TIGRE TINTA TORRE TOSSE TRAPO TREVO
TRIGO TROCA TURMA URUBU VAGAO VALOR VAZIO VELHO VERDE VIDRO VIRAR VISTA VIVER VOLTA ZINCO MOLHO
MILHO BOLHA FOLGA BICHO BURRO CAIXA CALMA CALDO CANJA CARNE CERCA CHEIO CHUTE COBRA COFRE COLAR
COMER CONTA CORDA CORVO COUVE CREME CRISE CURVA DANCA DUQUE ELITE ENTRE ESTAR EXAME FARDO FAROL
FEIRA FIBRA FICHA FIRME FLUXO FRASE FREIO FUGIR GAITA GANSO GARRA GENIO GIRAR GLOBO GRAXA GRUTA
HAVER HUMOR IDOSO JAULA LAGOA LANCE LAVAR LEGAL LEQUE LIGAR LIMPO LISTA LOMBO LONGE LUTAR MAGIA
MALHA MANSO MEDIR MELAO MESMO METRO MIOLO MISTO MOLDE MONTE MORAR MORRO MUDAR MULTA NARIZ NERVO
NINJA NUNCA OPERA OUTRA PAGAR PALHA PANDA PARAR PEDAL PENTE PERNA PIADA PILAR PINGO PISAR PLUMA
POEMA POMAR PONTO POSTE PRADO PRESO PUDIM PULAR PUNHO QUILO RALAR REGRA RELVA REMAR RENDA ROCHA
ROLHA RONCO SALSA SECAR SEIVA SIGLA SOLAR SOPRO SURDO TALCO TAMPA TANGO TEMOR TENDA TIARA TOCAR
TOMAR TORTA TOURO TRAMA TRENO TROCO TROPA VAPOR VARAL VERBO VIOLA VULTO
`
  .trim()
  .split(/\s+/);

export type Mark = 'hit' | 'near' | 'miss';

/** Wordle marks, counting repeated letters correctly (greens first, then yellows). */
export function evaluate(guess: string, answer: string): Mark[] {
  const marks: Mark[] = new Array<Mark>(WORD_LEN).fill('miss');
  const left = new Map<string, number>();
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit';
    else left.set(answer[i]!, (left.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (marks[i] === 'hit') continue;
    const n = left.get(guess[i]!) ?? 0;
    if (n > 0) {
      marks[i] = 'near';
      left.set(guess[i]!, n - 1);
    }
  }
  return marks;
}

/** Points for guessing on try `n` (1-based), before the streak bonus. */
export const triesPoints = (n: number): number => Math.max(0, (MAX_TRIES + 1 - n) * 100);

const RANK: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };

export type SubmitResult =
  | { kind: 'short' }
  | { kind: 'guess'; marks: Mark[] }
  | { kind: 'solved'; marks: Mark[]; points: number }
  | { kind: 'failed'; marks: Mark[]; answer: string; livesLeft: number };

export class TermoRun {
  answer = '';
  guesses: string[] = [];
  marks: Mark[][] = [];
  current = '';
  score = 0;
  words = 0;
  streak = 0;
  bestStreak = 0;
  lives = LIVES;
  /** Best mark seen for each letter (keyboard colours). */
  keys = new Map<string, Mark>();
  private used = new Set<string>();

  constructor(private readonly rng: () => number = Math.random) {
    this.nextWord();
  }

  get over(): boolean {
    return this.lives <= 0;
  }

  nextWord(): void {
    let pick = WORDS[Math.floor(this.rng() * WORDS.length)]!;
    for (let i = 0; i < 20 && this.used.has(pick); i++)
      pick = WORDS[Math.floor(this.rng() * WORDS.length)]!;
    this.used.add(pick);
    this.answer = pick;
    this.guesses = [];
    this.marks = [];
    this.current = '';
    this.keys = new Map();
  }

  type(letter: string): void {
    if (this.over || this.current.length >= WORD_LEN) return;
    if (/^[A-Z]$/.test(letter)) this.current += letter;
  }

  erase(): void {
    this.current = this.current.slice(0, -1);
  }

  submit(): SubmitResult {
    if (this.over || this.current.length < WORD_LEN) return { kind: 'short' };
    const guess = this.current;
    const marks = evaluate(guess, this.answer);
    this.guesses.push(guess);
    this.marks.push(marks);
    this.current = '';
    marks.forEach((m, i) => {
      const k = guess[i]!;
      const prev = this.keys.get(k);
      if (!prev || RANK[m] > RANK[prev]) this.keys.set(k, m);
    });
    if (guess === this.answer) {
      this.words++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      const points = Math.round(triesPoints(this.guesses.length) * (1 + 0.25 * (this.streak - 1)));
      this.score += points;
      return { kind: 'solved', marks, points };
    }
    if (this.guesses.length >= MAX_TRIES) {
      this.lives--;
      this.streak = 0;
      return { kind: 'failed', marks, answer: this.answer, livesLeft: this.lives };
    }
    return { kind: 'guess', marks };
  }
}
