import { SceneKeys } from '@/config';
import { AttemptScene } from '@/games/olimpiadas/AttemptScene';
import { weightlifting } from './core';

/** "Levantamento de Peso". */
export class PesosScene extends AttemptScene<number> {
  constructor() {
    super(
      {
        key: SceneKeys.Pesos,
        gameId: 'pesos',
        colors: [0x1e1b4b, 0x7c3aed],
        actor: '🏋️',
        flight: '🏅',
        ground: 0x5b21b6,
        intro: 'Encha a barra de força e segure o peso',
        accent: '#ddd6fe',
      },
      weightlifting,
    );
  }
}
