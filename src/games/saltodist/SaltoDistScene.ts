import { SceneKeys } from '@/config';
import { AttemptScene } from '@/games/olimpiadas/AttemptScene';
import { longJump } from './core';

/** "Salto em Distância". */
export class SaltoDistScene extends AttemptScene<null> {
  constructor() {
    super(
      {
        key: SceneKeys.SaltoDist,
        gameId: 'saltodist',
        colors: [0x7c2d12, 0xf59e0b],
        actor: '🏃',
        flight: '🤸',
        ground: 0xe9c46a,
        intro: 'Acelere, pise na tábua e escolha o ângulo',
        accent: '#fde68a',
      },
      longJump,
    );
  }
}
