import { SceneKeys } from '@/config';
import { AttemptScene } from '@/games/olimpiadas/AttemptScene';
import { highJump } from './core';

/** "Salto em Altura". */
export class SaltoAltScene extends AttemptScene<number> {
  constructor() {
    super(
      {
        key: SceneKeys.SaltoAlt,
        gameId: 'saltoalt',
        colors: [0x0c4a6e, 0x38bdf8],
        actor: '🏃',
        flight: '🤸',
        ground: 0x0369a1,
        intro: 'A barra sobe 5 cm a cada salto vencido',
        accent: '#bae6fd',
      },
      highJump,
    );
  }
}
