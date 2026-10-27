import { SceneKeys } from '@/config';
import { DreamScene } from '@/games/selecao/DreamScene';
import { CLUBS } from './data';

/** "Time dos Sonhos BR": Brazilian clubs from different seasons. */
export class TimesBrScene extends DreamScene {
  constructor() {
    super({
      key: SceneKeys.TimesBr,
      gameId: 'timesbr',
      colors: [0x053d2b, 0x0f766e],
      teams: CLUBS,
      edition: 'Temporada',
      title: 'Time dos Sonhos BR',
      champion: 'CAMPEÃO DE TUDO! 🏆',
      tagline: 'Monte o time com craques dos clubes do Brasil',
    });
  }
}
