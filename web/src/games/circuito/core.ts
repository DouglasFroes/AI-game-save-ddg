/**
 * "Circuito" — pure rules. A small logic circuit made of gates (AND, OR, XOR, NAND, NOR, NOT) ends
 * in a lamp. Flip the input switches until the lamp lights up. Circuits come from a random wiring.
 */
export type Op = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NOT';
export interface Gate {
  op: Op;
  /** Node indexes (inputs first, then gates in order). NOT only uses `a`. */
  a: number;
  b: number;
}
export interface Puzzle {
  inputs: number;
  gates: Gate[];
  /** One input setting that lights the lamp. */
  solution: boolean[];
}

const OPS: readonly Op[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT'];

export function apply(op: Op, a: boolean, b: boolean): boolean {
  switch (op) {
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'XOR':
      return a !== b;
    case 'NAND':
      return !(a && b);
    case 'NOR':
      return !(a || b);
    case 'NOT':
      return !a;
  }
}

/** Value of every node (inputs, then gates). The last one is the lamp. */
export function evaluate(p: Puzzle, inputs: readonly boolean[]): boolean[] {
  const v = [...inputs];
  for (const g of p.gates) v.push(apply(g.op, v[g.a]!, v[g.b]!));
  return v;
}

export const lamp = (p: Puzzle, inputs: readonly boolean[]): boolean => evaluate(p, inputs).at(-1)!;

const bits = (n: number, m: number) => Array.from({ length: n }, (_, i) => ((m >> i) & 1) === 1);

export function generate(level: number, rng: () => number = Math.random): Puzzle {
  const inputs = Math.min(7, 3 + Math.floor(level / 2));
  const count = Math.min(10, 2 + level);
  for (let attempt = 0; attempt < 500; attempt++) {
    const gates: Gate[] = [];
    for (let g = 0; g < count; g++) {
      const nodes = inputs + g;
      const op = OPS[Math.floor(rng() * OPS.length)]!;
      // Chain to the previous gate so the whole circuit feeds the lamp.
      const a = g === 0 ? Math.floor(rng() * inputs) : nodes - 1;
      let b = Math.floor(rng() * nodes);
      if (b === a) b = (b + 1) % nodes;
      gates.push({ op, a, b });
    }
    const p: Puzzle = { inputs, gates, solution: [] };
    // Every input must matter to the lamp (be reachable from it).
    const used = new Set<number>([inputs + count - 1]);
    for (let i = inputs + count - 1; i >= inputs; i--) {
      if (!used.has(i)) continue;
      const gate = gates[i - inputs]!;
      used.add(gate.a);
      if (gate.op !== 'NOT') used.add(gate.b);
    }
    if (Array.from({ length: inputs }, (_, i) => i).some((i) => !used.has(i))) continue;
    const on: number[] = [];
    for (let m = 0; m < 1 << inputs; m++) if (lamp(p, bits(inputs, m))) on.push(m);
    if (on.length === 0 || on.length > (1 << inputs) / 2 || lamp(p, bits(inputs, 0))) continue;
    p.solution = bits(inputs, on[Math.floor(rng() * on.length)]!);
    return p;
  }
  // Fallback: lamp = AND of three switches.
  return {
    inputs: 3,
    gates: [
      { op: 'AND', a: 0, b: 1 },
      { op: 'AND', a: 3, b: 2 },
    ],
    solution: [true, true, true],
  };
}
