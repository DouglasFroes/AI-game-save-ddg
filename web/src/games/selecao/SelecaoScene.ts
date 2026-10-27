import { SceneKeys } from '@/config';
import { DreamScene } from './DreamScene';
import { NATIONS } from './data';

/** "Seleção dos Sonhos": national teams from World Cups. */
export class SelecaoScene extends DreamScene {
  constructor() {
    super({
      key: SceneKeys.Selecao,
      gameId: 'selecao',
      colors: [0x052e16, 0x14532d],
      teams: NATIONS,
      edition: 'Copa',
      title: 'Seleção dos Sonhos',
      champion: 'CAMPEÃO DO MUNDO! 🏆',
      tagline: 'Escolha a formação, o estilo e o modo',
    });
  }
}
