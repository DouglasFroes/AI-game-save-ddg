import { SceneKeys } from '@/config';
import { DreamScene } from '@/games/selecao/DreamScene';
import { CLUBS } from '@/games/timesbr/data';

/** "Brasileirão dos Sonhos": draft a club side, then play a 38-round league. */
export class BrasileiraoScene extends DreamScene {
  constructor() {
    super({
      key: SceneKeys.Brasileirao,
      gameId: 'brasileirao',
      colors: [0x14532d, 0x1e3a8a],
      teams: CLUBS,
      edition: 'Temporada',
      title: 'Brasileirão dos Sonhos',
      champion: 'CAMPEÃO BRASILEIRO! 🏆',
      tagline: 'Monte o time e dispute 38 rodadas de pontos corridos',
      format: 'league',
    });
  }
}
