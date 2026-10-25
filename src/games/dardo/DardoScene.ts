import { SceneKeys } from '@/config';
import { AttemptScene } from '@/games/olimpiadas/AttemptScene';
import { javelin } from './core';

/** "Dardo". */
export class DardoScene extends AttemptScene<number> {
  constructor() {
    super(
      {
        key: SceneKeys.Dardo,
        gameId: 'dardo',
        colors: [0x064e3b, 0x34d399],
        actor: '🤾',
        flight: '🗡️',
        ground: 0x2f8f4e,
        intro: 'Força, ângulo e atenção ao vento',
        accent: '#bbf7d0',
      },
      javelin,
    );
  }
}
