import { SceneKeys } from '@/config';
import { AttemptScene } from '@/games/olimpiadas/AttemptScene';
import { freeThrows } from './core';

/** "Lance Livre". */
export class LanceScene extends AttemptScene<{ value: 1 | 2 | 3; streak: number }> {
  constructor() {
    super(
      {
        key: SceneKeys.Lance,
        gameId: 'lance',
        colors: [0x7c2d12, 0xfb923c],
        actor: '⛹️',
        flight: '🏀',
        ground: 0xc2410c,
        intro: 'Dez arremessos, cada vez mais longe',
        accent: '#fed7aa',
      },
      freeThrows,
    );
  }
}
