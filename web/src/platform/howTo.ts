import type { RuleCard } from '@/platform/ui/howToCard';

/** "Como jogar" for every game, keyed by game id (opened from the 💡 button). */
export const HOW_TO: Readonly<Record<string, RuleCard>> = {
  doguinho: {
    goal: 'Proteger o doguinho das abelhas.',
    steps: [
      'Desenhe linhas com o dedo para criar barreiras ao redor do doguinho.',
      'Sua tinta é limitada: desenhe só o necessário.',
      'Aguente até o fim para ganhar estrelas.',
    ],
  },
  blockblast: {
    goal: 'Limpar linhas e colunas inteiras.',
    steps: [
      'Arraste as peças de baixo para o tabuleiro.',
      'Linha ou coluna completa some e dá pontos.',
      'O jogo acaba quando nenhuma peça couber.',
    ],
  },
  sudoku: {
    goal: 'Preencher a grade com números de 1 a 9.',
    steps: [
      'Toque numa casa vazia e depois no número.',
      'Não pode repetir número na linha, na coluna nem no quadrado 3×3.',
      'Erros e dicas diminuem a pontuação.',
    ],
  },
  roadfighter: {
    goal: 'Dirigir o máximo possível sem bater.',
    steps: [
      'Mova o carro para os lados para desviar dos outros carros.',
      'Quanto mais longe, mais rápido fica.',
    ],
  },
  game2048: {
    goal: 'Juntar números até formar o 2048.',
    steps: [
      'Deslize o dedo para mover todos os blocos.',
      'Dois blocos iguais se juntam e somam.',
      'Sem movimentos possíveis, acaba.',
    ],
  },
  flappybee: {
    goal: 'Voar o mais longe possível.',
    steps: [
      'Toque para a abelha bater as asas e subir.',
      'Passe pelas aberturas sem encostar nos canos.',
    ],
  },
  snake: {
    goal: 'Comer e crescer sem bater.',
    steps: [
      'Deslize o dedo para mudar a direção da cobra.',
      'Não bata nas paredes nem no próprio corpo.',
    ],
  },
  stack: {
    goal: 'Empilhar blocos o mais alto possível.',
    steps: [
      'Toque para soltar o bloco que desliza.',
      'A parte que sobra para fora é cortada: acerte em cima!',
    ],
  },
  fruitmerge: {
    goal: 'Juntar frutas iguais para criar frutas maiores.',
    steps: [
      'Mova e solte uma fruta na caixa.',
      'Duas frutas iguais se juntam numa maior.',
      'Se a pilha passar da linha de cima, acaba.',
    ],
  },
  grau: {
    goal: 'Empinar a moto sem cair.',
    steps: [
      'Equilibre a moto na roda de trás.',
      'Desvie dos carros e dos cruzamentos.',
      'Quanto mais longe no grau, mais pontos.',
    ],
  },
  luta: {
    goal: 'Vencer todos os rivais na luta.',
    steps: [
      'Use os botões para andar, pular, atacar e usar o poder do seu lutador.',
      'Zere a vida do rival antes que ele zere a sua.',
    ],
  },
  bomba: {
    goal: 'Explodir tijolos e achar a saída.',
    steps: [
      'Mova o personagem e solte bombas.',
      'A bomba explode em cruz: afaste-se a tempo!',
      'Bombas quebram tijolos e revelam itens.',
    ],
  },
  turma: {
    goal: 'Vencer as lutas usando o poder de cada personagem.',
    steps: [
      'Toque em ATAQUE em sequência para fazer combos de 3 golpes.',
      'Segure a GUARDA para se defender; defender no último instante atordoa o rival.',
      'Cada lutador tem um poder especial com recarga curta.',
    ],
  },
  corre: {
    goal: 'Correr o máximo desviando dos obstáculos.',
    steps: [
      'Deslize para os lados para mudar de faixa.',
      'Deslize para cima para pular e para baixo para deslizar.',
    ],
  },
  crush: {
    goal: 'Juntar 3 ou mais personagens iguais.',
    steps: [
      'Troque dois vizinhos de lugar para alinhar 3 iguais.',
      '4 ou mais criam peças especiais que limpam muito mais.',
      'Combos em sequência multiplicam os pontos.',
    ],
  },
  lenha: {
    goal: 'Cortar o tronco sem levar uma galhada.',
    steps: [
      'Toque à esquerda ou à direita para cortar daquele lado.',
      'Fique do lado sem galho e corte rápido: o tempo acaba!',
    ],
  },
  piano: {
    goal: 'Tocar só nas peças pretas.',
    steps: [
      'Toque na peça preta de cada linha, de baixo para cima.',
      'Tocar num espaço vazio, ou deixar uma peça passar, acaba o jogo.',
    ],
  },
  alvo: {
    goal: 'Lançar todos os lápis no alvo que gira.',
    steps: [
      'Toque para lançar um lápis.',
      'Não acerte os lápis que já estão no alvo!',
      'Maçãs na borda dão pontos extras.',
    ],
  },
  pula: {
    goal: 'Subir o mais alto que puder.',
    steps: [
      'O personagem pula sozinho nas plataformas.',
      'Incline ou arraste para os lados para guiá-lo.',
    ],
  },
  atravessa: {
    goal: 'Atravessar o mais longe possível.',
    steps: [
      'Toque para avançar e deslize para os lados.',
      'Desvie dos carros, pule nos troncos do rio e fuja da águia.',
    ],
  },
  hexa: {
    goal: 'Juntar 10 peças da mesma cor.',
    steps: [
      'Toque numa pilha para pegar as peças da cor de cima.',
      'Mova-as para uma pilha vizinha da mesma cor.',
      'Ao juntar 10 iguais, a pilha some.',
    ],
  },
  tijolos: {
    goal: 'Quebrar todos os tijolos.',
    steps: [
      'Arraste a barra para rebater a bola.',
      'Pegue os bônus que caem dos tijolos.',
      'Perder todas as bolas custa uma vida.',
    ],
  },
  memoria: {
    goal: 'Achar todos os pares de cartas.',
    steps: [
      'Toque em duas cartas para virá-las.',
      'Cartas iguais ficam abertas; diferentes viram de novo.',
      'Termine antes do tempo acabar.',
    ],
  },
  cores: {
    goal: 'Passar só pela parte da sua cor.',
    steps: [
      'Toque para a bolinha pular para cima.',
      'Só dá para atravessar o pedaço do obstáculo com a cor da bolinha.',
      'Pegue as estrelas e os trocadores de cor.',
    ],
  },
  milhao: {
    goal: 'Responder as perguntas e chegar a 1 milhão.',
    steps: [
      'Escolha a resposta certa antes do tempo acabar.',
      'Antes de responder você pode parar e guardar o prêmio.',
      'Errar leva só metade do prêmio; use as ajudas com sabedoria.',
    ],
  },
  memofases: {
    goal: 'Achar os pares de cartas em cada fase.',
    steps: [
      'Toque em duas cartas para virá-las.',
      'Cuidado com a carta-bomba: ela custa tempo.',
      'Ganhe até 3 estrelas por fase.',
    ],
  },
  bolha: {
    goal: 'Comer, crescer e sobreviver na arena.',
    steps: [
      'Arraste o dedo para guiar sua bolha.',
      'Coma pontinhos e bolhas menores; fuja das maiores.',
      'Use o turbo para ganhar velocidade (gasta um pouco de massa).',
    ],
  },
  paciencia: {
    goal: 'Levar todas as cartas para as 4 pilhas, do Ás ao Rei.',
    steps: [
      'Monte as colunas em ordem decrescente e cores alternadas.',
      'Toque numa carta para movê-la para o melhor lugar possível.',
      'Toque no monte para virar uma carta nova.',
    ],
  },
  ultima: {
    goal: 'Ser o primeiro a ficar sem cartas.',
    steps: [
      'Jogue uma carta da mesma cor ou do mesmo símbolo da carta de cima.',
      'Use +2, bloqueio, inverter e coringas para atrapalhar os outros.',
    ],
  },
  territorio: {
    goal: 'Conquistar o maior território.',
    steps: [
      'Arraste para guiar o seu jogador.',
      'Saia da sua área e volte para fechar uma volta e conquistar o que ficou dentro.',
      'Se alguém tocar no seu rastro, você perde — e vice-versa!',
    ],
  },
  helix: {
    goal: 'Descer a torre até o fim.',
    steps: [
      'Deslize para girar a torre.',
      'A bolinha cai pelos buracos; desvie das partes escuras.',
    ],
  },
  zigue: {
    goal: 'Seguir o caminho sem cair.',
    steps: ['Toque para a bolinha virar de direção.', 'Vire na hora certa em cada curva.'],
  },
  ponte: {
    goal: 'Atravessar os vãos com uma ponte do tamanho certo.',
    steps: [
      'Segure para a ponte crescer e solte para ela cair.',
      'Ela precisa alcançar a próxima plataforma, nem curta nem longa demais.',
    ],
  },
  corcerta: {
    goal: 'Dizer se a cor combina com a palavra.',
    steps: [
      'Leia a palavra e olhe a cor em que ela está escrita.',
      'Toque na resposta correta antes que o tempo acabe.',
    ],
  },
  conta: {
    goal: 'Resolver as contas antes do tempo.',
    steps: ['Veja a conta e toque na resposta certa.', 'Cada acerto dá um pouco mais de tempo.'],
  },
  cesto: {
    goal: 'Pegar as frutas e fugir das bombas.',
    steps: ['Arraste o cesto para os lados.', 'Bombas custam uma vida.'],
  },
  sequencia: {
    goal: 'Repetir a ordem das luzes.',
    steps: [
      'Veja quais botões acendem.',
      'Toque neles na mesma ordem. A cada rodada a sequência cresce.',
    ],
  },
  relampago: {
    goal: 'Tocar no verde o mais rápido possível.',
    steps: ['Espere a tela ficar verde e toque.', 'Tocar cedo demais é erro.'],
  },
  trio: {
    goal: 'Juntar 3 peças iguais.',
    steps: [
      'Toque numa peça livre para ela ir para a bandeja.',
      '3 iguais na bandeja somem.',
      'Se a bandeja encher, acaba!',
    ],
  },
  inverte: {
    goal: 'Chegar o mais longe possível invertendo a gravidade.',
    steps: ['Toque para virar a gravidade e ir para o outro lado.', 'Desvie dos obstáculos.'],
  },
  balao: {
    goal: 'Voar pela caverna sem encostar.',
    steps: [
      'Segure para o balão subir e solte para descer.',
      'A caverna vai ficando mais estreita.',
    ],
  },
  toupeira: {
    goal: 'Acertar as toupeiras e fugir das bombas.',
    steps: ['Toque nas toupeiras assim que aparecerem.', 'Tocar numa bomba custa pontos ou vida.'],
  },
  corta: {
    goal: 'Fatiar as frutas que sobem.',
    steps: ['Deslize o dedo sobre as frutas para cortá-las.', 'Não corte as bombas!'],
  },
  gelo: {
    goal: 'Chegar à bandeira escorregando no gelo.',
    steps: [
      'Deslize o dedo; o personagem desliza até bater em algo.',
      'Planeje onde parar. O tempo é limitado.',
    ],
  },
  velha: {
    goal: 'Fazer 3 em linha antes do robô.',
    steps: [
      'Toque numa casa para jogar.',
      'Cada jogador só mantém 3 marcas: a quarta apaga a mais antiga.',
    ],
  },
  ligue4: {
    goal: 'Alinhar 4 peças antes do robô.',
    steps: ['Toque numa coluna para soltar sua peça.', 'Vale na horizontal, vertical e diagonal.'],
  },
  minas: {
    goal: 'Abrir todas as casas sem minas.',
    steps: [
      'Toque para abrir uma casa; o número diz quantas minas há ao redor.',
      'Marque com bandeira onde acha que há mina.',
      'Abrir uma mina acaba o jogo.',
    ],
  },
  bolhas: {
    goal: 'Estourar grupos de bolhas da mesma cor.',
    steps: ['Arraste para mirar e solte para atirar.', '3 ou mais bolhas da mesma cor estouram.'],
  },
  blocos: {
    goal: 'Completar linhas para limpá-las.',
    steps: [
      'Deslize para mover e girar as peças que caem.',
      'Linhas completas somem e dão pontos.',
      'Se as peças chegarem ao topo, acaba.',
    ],
  },
  comecome: {
    goal: 'Comer todos os pontos fugindo dos fantasmas.',
    steps: ['Deslize para mudar de direção.', 'Pegue as pílulas grandes para comer os fantasmas.'],
  },
  nave: {
    goal: 'Destruir tudo que aparece.',
    steps: ['Arraste para mover a nave; ela atira sozinha.', 'Desvie dos inimigos e dos tiros.'],
  },
  liquidos: {
    goal: 'Separar as cores, uma por tubo.',
    steps: [
      'Toque num tubo e depois em outro para despejar o líquido.',
      'Só dá para despejar sobre a mesma cor ou um tubo vazio.',
    ],
  },
  ricochete: {
    goal: 'Quebrar os números atirando bolas.',
    steps: [
      'Arraste para mirar e solte para atirar.',
      'Cada bola tira 1 de um número; zere todos antes que desçam até o fim.',
    ],
  },
  horda: {
    goal: 'Sobreviver à horda de monstros.',
    steps: [
      'Arraste para se mover e desviar.',
      'As armas atiram sozinhas no monstro mais próximo.',
      'Pegue os cristais e escolha 1 de 3 melhorias a cada nível.',
    ],
  },
  gancho: {
    goal: 'Balance sobre a lava.',
    steps: ['Segure para lançar a corda', 'Solte para voar!'],
  },
  orbita: {
    goal: 'Salte de planeta em planeta.',
    steps: ['Toque para sair da órbita', 'Mire no centro do próximo planeta!'],
  },
  cadeia: {
    goal: 'Um toque, mil explosões.',
    steps: ['Toque UMA vez para soltar a explosão', 'Os átomos tocados explodem também!'],
  },
  escorrega: {
    goal: 'Deslize no gelo até a saída.',
    steps: ['Deslize para qualquer lado', 'Você só para em pedras ou na borda'],
  },
  plinko: {
    goal: 'Plinko com upgrades.',
    steps: ['Deslize para mirar, solte para largar', 'Segure para chover bolas!'],
  },
  tinta: {
    goal: 'Acerte a cor do pedido.',
    steps: [
      'Misture os pigmentos até igualar a cor do pedido',
      'Cada gota conta: a mistura é a média!',
    ],
  },
  espelhos: {
    goal: 'Guie o laser até os cristais.',
    steps: ['Toque nos espelhos para girá-los', 'Acenda todos os cristais com o laser!'],
  },
  masmorra: {
    goal: 'Escolha bem cada carta.',
    steps: [
      'Toque num monstro para lutar: a arma reduz o dano',
      'Pegue armas, poções e escudos. Cuidado com o HP!',
    ],
  },
  pinball: {
    goal: 'Flippers, bumpers e combos.',
    steps: ['Toque nos lados para mover os flippers', 'Toque para lançar a bola!'],
  },
  dados: {
    goal: 'Combos, mult e coringas.',
    steps: ['Role os dados e toque nos que quer guardar', 'Fichas × multiplicador = pontos da mão'],
  },
  selecao: {
    goal: 'Montar a seleção e vencer 7 jogos.',
    steps: [
      'Escolha a formação e o estilo de jogo.',
      'Sorteie seleções e escolha um jogador de cada, 11 vezes.',
      'Perdeu um jogo, está fora. Você tem 3 sorteios extras.',
    ],
  },
  timesbr: {
    goal: 'Montar o time dos sonhos com clubes brasileiros.',
    steps: [
      'Sorteie um clube de uma temporada e escolha um jogador.',
      'Complete o time e veja como ele se sai.',
    ],
  },
  brasileirao: {
    goal: 'Montar um time e disputar 38 rodadas.',
    steps: [
      'Escolha os jogadores do seu clube.',
      'Jogue o campeonato de pontos corridos e termine o mais alto possível.',
    ],
  },
  penalti: {
    goal: 'Chute com curva e pegue pênaltis.',
    steps: ['Deslize o dedo para cima para chutar', 'Curva + força = gol no ângulo'],
  },
  golfe: {
    goal: '9 buracos, mire no par.',
    steps: ['Puxe para trás e solte', 'Quanto mais puxar, mais forte'],
  },
  tenis: {
    goal: 'Tie-break contra 5 rivais.',
    steps: ['Deslize para CIMA para rebater', 'Para o lado mira; rápido = forte'],
  },
  basquete: {
    goal: 'Swish, cestas de 3 e em chamas.',
    steps: ['Puxe para trás e solte', 'Cesta sem tocar no aro = SWISH!'],
  },
  boliche: {
    goal: '10 frames, strikes e spares.',
    steps: [
      'Arraste para o lado para posicionar',
      'Deslize para cima para jogar',
      'Curva no gesto = efeito na bola',
    ],
  },
  curling: {
    goal: 'Lance, gire e varra o gelo.',
    steps: [
      'Puxe para trás para lançar',
      'Escolha o giro (↺ ↻) antes',
      'Esfregue a tela para varrer!',
    ],
  },
  skate: {
    goal: 'Bombeie e mande manobras.',
    steps: [
      'Toque quando estiver DESCENDO a rampa',
      'No ar: deslize ← → ↑ ↓ para manobras',
      'Termine a manobra antes de cair!',
    ],
  },
  boxe: {
    goal: 'Esquive e contra-ataque.',
    steps: [
      'Soco vindo da ESQUERDA: deslize →',
      'Da DIREITA: deslize ← · Direto: deslize ↓',
      'Toque à esquerda/direita para socar',
    ],
  },
  ciclismo: {
    goal: 'Energia, vácuo e sprint.',
    steps: [
      'SEGURE para pedalar, SOLTE para descansar',
      'Nas descidas, solte! Atrás de alguém = vácuo',
      'Guarde energia para o sprint final',
    ],
  },
  esqui: {
    goal: 'Passe pelos portões.',
    steps: [
      'Segure o dedo para onde quer ir',
      'Passe ENTRE as bandeiras de cada portão',
      'Reto = rápido · curva = freia',
    ],
  },
  arqueiro: {
    goal: 'Flechas até errar 3 vezes.',
    steps: [
      'Puxe para TRÁS (para a esquerda) e solte',
      'Atenção ao vento!',
      'Errou 3 vezes, acabou',
    ],
  },
  galeria: {
    goal: 'Patos sim, coelhos não.',
    steps: ['Toque nos patos e alvos', 'NÃO acerte os coelhos 🐰', 'Recarregue na caixa'],
  },
  sniper: {
    goal: 'Luneta, vento e respiração.',
    steps: [
      'Arraste para mirar',
      'Segure o botão: prende a respiração',
      'Solte para atirar · mire acima (a bala cai)',
    ],
  },
  damas: {
    goal: 'Capturar todas as peças do robô.',
    steps: [
      'Toque numa peça e depois na casa de destino.',
      'A captura é obrigatória, e você deve escolher a que pega mais peças.',
      'Chegando ao outro lado, a peça vira dama.',
    ],
  },
  naval: {
    goal: 'Afundar toda a frota inimiga.',
    steps: [
      'Toque numa casa do mar inimigo para atirar.',
      'Acertou? Atire de novo ao redor até afundar o navio.',
    ],
  },
  domino: {
    goal: 'Chegar a 50 pontos antes do robô.',
    steps: [
      'Toque numa peça sua que combine com uma ponta da mesa.',
      'Sem peça para jogar, compre do mercado.',
      'Pontos vêm de pontas somando múltiplos de 5.',
    ],
  },
  hoquei: {
    goal: 'Fazer gols no robô.',
    steps: ['Arraste a raquete para rebater o disco.', 'Defenda o seu gol e acerte o do robô.'],
  },
  reversi: {
    goal: 'Vire as peças e domine o tabuleiro.',
    steps: ['Toque nos círculos marcados para cercar', 'e virar as peças do robô!'],
  },
  nonograma: {
    goal: 'Descubra o desenho pelos números.',
    steps: ['Os números indicam quantos blocos seguidos', 'existem em cada linha e coluna!'],
  },
  canos: {
    goal: 'Gire os canos e leve a água.',
    steps: ['Toque nos canos para girá-los', 'e levar a água da fonte até todos os cristais!'],
  },
  submarino: {
    goal: 'Lance cargas de profundidade no sonar.',
    steps: ['Toque na água para mover o navio e lançar cargas', 'Desvie das minas que sobem!'],
  },
  asteroides: {
    goal: 'Destrua rochas espaciais em 360°.',
    steps: [
      'Toque ou segure no espaço para mirar e atirar',
      'Use o Impulso para escapar das rochas!',
    ],
  },
  cofre: {
    goal: 'Toque no pino exato e abra o cofre.',
    steps: ['Toque na tela no instante exato em que', 'o ponteiro passar pela trava dourada!'],
  },
  malabares: {
    goal: 'Não deixe nenhuma bola cair.',
    steps: ['Toque nas bolas antes que caiam no chão!', 'A zona dourada dá bônus Perfeito!'],
  },
  volei: {
    goal: 'Receba, levante e corte na areia.',
    steps: ['Arraste na quadra para se posicionar', 'Salte perto da rede para mandar uma Cortada!'],
  },
  blackjack: {
    goal: 'Chegue a 21 sem estourar a banca.',
    steps: [
      'Chegue mais perto de 21 que a Banca sem estourar!',
      '10 mãos para multiplicar suas fichas!',
    ],
  },
  hexagono: {
    goal: 'Gire e escape das paredes.',
    steps: ['Segure a esquerda ou a direita da tela', 'para girar e passar pelas aberturas!'],
  },
  termo: {
    goal: 'Adivinhe a palavra em 6 tentativas.',
    steps: ['Adivinhe a palavra de 5 letras!', 'Verde: lugar certo · Amarelo: está na palavra'],
  },
  estaciona: {
    goal: 'Tire o carro vermelho do aperto.',
    steps: ['Arraste os carros e tire o vermelho pela saída →', 'Cada movimento gasta 1 litro!'],
  },
  ligapontos: {
    goal: 'Ligue as cores sem cruzar.',
    steps: ['Ligue cada par de pontos da mesma cor', 'sem cruzar os caminhos!'],
  },
  pescaria: {
    goal: 'Desça desviando, suba pescando.',
    steps: ['Descendo: desvie dos peixes!', 'Subindo: pegue todos — cuidado com a água-viva 🪼'],
  },
  lunar: {
    goal: 'Pouse suave na plataforma.',
    steps: [
      'Segure a esquerda ou a direita para acionar os motores',
      'Os dois juntos sobem reto. Pouse devagar!',
    ],
  },
  misseis: {
    goal: 'Proteja as cidades do céu.',
    steps: ['Toque no céu para explodir os mísseis', 'Explosões em cadeia valem mais!'],
  },
  motoluz: {
    goal: 'Prenda os rivais no seu rastro.',
    steps: ['Deslize para virar a moto azul', 'Não bata em nenhum rastro — prenda os rivais!'],
  },
  sinuca: {
    goal: 'Encaçape uma por tacada.',
    steps: ['Puxe para trás e solte para tacar', 'Encaçape ao menos uma bola por tacada!'],
  },
  maiormenor: {
    goal: 'Arrisque ou guarde o pote.',
    steps: ['A próxima carta é maior ou menor?', 'Guarde o pote antes de errar!'],
  },
  dalgona: {
    goal: 'Recorte a forma sem rachar.',
    steps: ['Passe o dedo devagar sobre o contorno', 'Saiu da linha ou foi rápido demais? Racha!'],
  },
  mahjong: {
    goal: 'Pares livres, combos e tempo.',
    steps: ['Junte pares iguais que estejam livres', '(sem peça em cima e com um lado aberto)'],
  },
  luzes: {
    goal: 'Apague todas as luzes.',
    steps: ['Toque numa luz: ela e as vizinhas trocam', 'Apague todas!'],
  },
  deslizante: {
    goal: 'Deslize as peças até a ordem.',
    steps: ['Toque numa peça da linha ou coluna do vazio', 'Coloque tudo em ordem: 1, 2, 3…'],
  },
  senha: {
    goal: 'Descubra a senha secreta.',
    steps: ['● preto: cor e lugar certos', '○ branco: cor certa, lugar errado'],
  },
  cacapalavras: {
    goal: 'Ache as palavras escondidas.',
    steps: ['Arraste da primeira à última letra', 'para marcar cada palavra'],
  },
  anagrama: {
    goal: 'Desembaralhe as letras rápido.',
    steps: ['Toque nas letras na ordem certa', 'para formar uma palavra!'],
  },
  binario: { goal: 'Zeros e uns em equilíbrio.', steps: ['Toque para trocar: vazio → 0 → 1'] },
  somadez: {
    goal: 'Some 10 e limpe o quadro.',
    steps: ['Arraste um retângulo com números', 'que somem exatamente 10!'],
  },
  tesouro: {
    goal: 'Cave seguindo as pistas.',
    steps: ['Cave a areia: o número diz quantos passos', 'faltam até o tesouro mais perto'],
  },
  labirinto: {
    goal: 'Ache a saída sem luz.',
    steps: ['Deslize para correr pelos corredores', 'Ache a saída verde no escuro!'],
  },
  ritmo: {
    goal: 'Toque no círculo no tempo certo.',
    steps: ['Toque no círculo quando o anel', 'encostar nele — no ritmo!'],
  },
  paraquedas: {
    goal: 'Abra o mais baixo que puder.',
    steps: ['Arraste para passar pelos anéis', 'Abra o paraquedas o mais baixo que puder!'],
  },
  letras: {
    goal: 'Digite antes que caiam.',
    steps: ['Toque a letra no teclado', 'antes que ela caia no chão!'],
  },
  cubo: {
    goal: 'Pule os espinhos no ritmo.',
    steps: ['Toque para pular · segure para pular sem parar'],
  },
  colinas: {
    goal: 'Mergulhe e voe pelas colinas.',
    steps: ['Segure para mergulhar na descida', 'solte no fundo para voar longe!'],
  },
  canhao: {
    goal: 'Quebre as pedras numeradas.',
    steps: ['Arraste para mover o canhão', 'Ele atira sozinho — não deixe as pedras caírem nele!'],
  },
  equilibrio: {
    goal: 'Não deixe a vara cair.',
    steps: ['Arraste o dedo para os lados', 'e não deixe a vara cair!'],
  },
  desarme: {
    goal: 'Desarmar a bomba cortando o fio certo.',
    steps: [
      'Leia as regras da bomba para a quantidade de fios dela.',
      'Toque no fio certo antes do tempo acabar.',
      'Errar o fio ou o tempo custa uma vida.',
    ],
  },
  trafego: {
    goal: 'Troque os sinais sem batidas.',
    steps: ['Toque numa rua para trocar o sinal', 'Não deixe carros se cruzarem!'],
  },
  aeroporto: {
    goal: 'Desenhe a rota até a pista.',
    steps: ['Arraste do avião até a pista ✈️', 'e do helicóptero até o heliponto 🚁'],
  },
  lanchonete: {
    goal: 'Monte os lanches do pedido.',
    steps: ['Monte o lanche na ordem do pedido:', 'de baixo para cima!'],
  },
  defesa: {
    goal: 'Torres contra ondas de inimigos.',
    steps: ['Escolha uma torre embaixo e toque na grama', 'Toque numa torre para melhorar'],
  },
  mina: {
    goal: 'Minere e invista em 90 s.',
    steps: [
      'Toque na pedra para minerar ouro',
      'Compre ajudantes — o placar é todo o ouro minerado!',
    ],
  },
  poquer: {
    goal: 'Formar as melhores mãos de pôquer.',
    steps: [
      'As cartas vêm uma a uma: toque numa casa livre da grade 5×5 para colocá-la.',
      'Linhas e colunas valem como mãos de pôquer.',
      'Faça pares, trincas, sequências e mais para somar pontos.',
    ],
  },
  dardos: {
    goal: 'Prenda a respiração e acerte.',
    steps: ['Segure para prender a respiração (a mira acalma)', 'e solte para lançar o dardo'],
  },
  botao: {
    goal: 'Peteleco no botão e gol.',
    steps: ['Puxe um botão azul para trás e solte', 'Faça o gol lá em cima!'],
  },
  saltoesqui: {
    goal: 'Impulso, equilíbrio e pouso.',
    steps: ['1) Toque na beira da rampa', '2) Segure/solte para equilibrar · 3) Toque ao pousar'],
  },
  cem: {
    goal: 'Vencer a corrida de 100 m.',
    steps: [
      'Espere o tiro de largada: tocar antes é queimar a largada.',
      'Toque nos botões esquerdo e direito, alternando.',
      'Tocar o mesmo lado duas vezes é tropeço.',
    ],
  },
  mancala: {
    goal: 'Semeie, capture e jogue de novo.',
    steps: ['Toque numa cova sua para semear', 'Termine no depósito e jogue de novo!'],
  },
  hex: {
    goal: 'Ligue os dois lados do tabuleiro.',
    steps: ['Ligue o topo ao fundo (azul)', 'antes que o robô ligue os lados (rosa)'],
  },
  trilha: {
    goal: 'Forme moinhos e roube peças.',
    steps: ['Forme três em linha (moinho)', 'para remover uma peça do robô'],
  },
  pontinhos: {
    goal: 'Feche quadrados e jogue de novo.',
    steps: ['Toque entre dois pontos para traçar', 'Feche um quadrado e jogue de novo!'],
  },
  restaum: {
    goal: 'Pule os pinos até sobrar um.',
    steps: ['Toque num pino e depois no buraco', 'do outro lado de um pino vizinho'],
  },
  raposa: {
    goal: 'Pule os gansos antes de ser cercada.',
    steps: ['Toque numa casa para mover a raposa', 'Pule sobre um ganso para capturá-lo'],
  },
  suprema: {
    goal: 'Nove velhas em um só tabuleiro.',
    steps: ['Onde você joga manda o robô', 'para o quadro correspondente'],
  },
  captura: {
    goal: 'Cerque as pedras do robô.',
    steps: [
      'Cerque as pedras do robô para capturar',
      'Pedras sem saída (anel vermelho) estão em perigo',
    ],
  },
  muralha: {
    goal: 'Corra e levante muros no caminho.',
    steps: [
      'Chegue à linha de cima antes do robô',
      'Em "Muro", toque entre as casas para bloquear',
    ],
  },
  gravidade: {
    goal: 'Inverta a gravidade e fuja dos espinhos.',
    steps: ['Toque para inverter a gravidade', 'Fuja dos espinhos!'],
  },
  buraco: {
    goal: 'Engula tudo e cresça em 60 s.',
    steps: ['Arraste para mover o buraco', 'Engula o que for menor que ele!'],
  },
  estilingue: {
    goal: 'Derrube as torres e estoure os porcos.',
    steps: ['Arraste para trás e solte', 'Derrube as torres e estoure os porcos'],
  },
  pendulo: {
    goal: 'Balance de gancho em gancho sobre a lava.',
    steps: ['Toque para soltar a corda e voar', 'Toque de novo para agarrar o próximo gancho'],
  },
  ninja: {
    goal: 'Pule entre as paredes desviando de tudo.',
    steps: ['Toque para pular para o outro lado', 'Fuja dos espinhos e das shurikens!'],
  },
  sumo: {
    goal: 'Empurre os rivais para fora do ringue.',
    steps: ['Deslize o dedo para investir', 'Empurre todos para fora do ringue!'],
  },
  esquiva: {
    goal: 'Desvie de uma chuva de balas.',
    steps: ['Arraste para mover a nave', 'Desvie das balas e pegue as estrelas'],
  },
  escudo: {
    goal: 'Gire o escudo e bloqueie os tiros.',
    steps: ['Toque ou arraste para girar o escudo', 'Bloqueie todos os tiros!'],
  },
  corda: {
    goal: 'Pule no tempo certo, a corda acelera.',
    steps: ['Toque para pular', 'Pule quando a corda passar pelo chão!'],
  },
  fabrica: {
    goal: 'Toque, melhore e asse mais rápido.',
    steps: ['Toque no biscoito!', 'Compre melhorias para assar sozinho'],
  },
  fazendinha: {
    goal: 'Plante, colha e venda em 2 minutos.',
    steps: [
      'Escolha a semente, toque numa terra vazia',
      'Colha quando estiver maduro — antes que estrague!',
    ],
  },
  bolsa: {
    goal: 'Leia a notícia e lucre antes do mercado.',
    steps: [
      'Leia a notícia: ela quase sempre acerta',
      'Compre antes de subir, venda antes de cair',
    ],
  },
  reino: {
    goal: 'Decida bem e reine por mais tempo.',
    steps: ['Arraste a carta ou use os botões', 'Mantenha os medidores longe de 0 e 100'],
  },
  cidade: {
    goal: 'Posicione prédios e some pontos com os vizinhos.',
    steps: ['Escolha um prédio e toque numa casa vazia', 'Vizinhos mudam os pontos!'],
  },
  aquario: {
    goal: 'Alimente, cresça e venda os peixes.',
    steps: ['Toque na água para soltar ração (1 moeda)', 'Toque num peixe grande para vendê-lo'],
  },
  pocoes: {
    goal: 'Misture cores e atenda os clientes.',
    steps: [
      'Misture 2 ingredientes e toque no cliente',
      'Vermelho + Azul = Roxo, e assim por diante',
    ],
  },
  usina: {
    goal: 'Esquente, gere energia e evite a explosão.',
    steps: ['Toque no reator para resfriar', 'Quanto mais quente, mais energia — até 100°!'],
  },
  bichinho: {
    goal: 'Cuide do seu pet pelo máximo de tempo.',
    steps: ['Cuide das 4 barras', 'Se uma ficar zerada por muito tempo, acabou'],
  },
  caixas: {
    goal: 'Colocar todas as caixas em cima dos alvos.',
    steps: [
      'Deslize o dedo no tabuleiro (ou use as setas) para mover o personagem; ao andar contra uma caixa, você a empurra.',
      'Você só empurra, nunca puxa: cuidado para não encostar uma caixa num canto.',
      'Errou? Use Desfazer ou Reiniciar.',
      'Termina quando todas as caixas estiverem nos alvos.',
    ],
  },
  hanoi: {
    goal: 'Levar todos os discos para a torre da direita.',
    steps: [
      'Toque numa torre para escolher o disco de cima e toque na torre de destino para movê-lo.',
      'Só se move 1 disco por vez.',
      'Nunca ponha um disco grande em cima de um menor.',
    ],
  },
  fluxo: {
    goal: 'Ligar os pares de pontos da mesma cor, preenchendo todo o tabuleiro.',
    steps: [
      'Arraste o dedo de um ponto até o outro da mesma cor, desenhando um cano.',
      'Os canos não podem se cruzar.',
      'No fim, nenhum quadrado pode ficar vazio.',
    ],
  },
  pontes: {
    goal: 'Ligar todas as ilhas com pontes.',
    steps: [
      'Toque numa ilha e depois em outra na mesma linha ou coluna para fazer uma ponte; toque de novo para ponte dupla.',
      'O número da ilha é quantas pontes ela precisa ter.',
      'Pontes não se cruzam e todas as ilhas ficam conectadas.',
    ],
  },
  rainhas: {
    goal: 'Pôr 1 rainha em cada linha, coluna e cor.',
    steps: [
      'Toque numa casa para colocar ou tirar uma rainha 👑.',
      'Cada linha, cada coluna e cada região colorida precisa ter exatamente 1 rainha.',
      'Duas rainhas não podem se encostar, nem na diagonal.',
      'Dica: comece pelas cores com poucas casas.',
    ],
  },
  sapos: {
    goal: 'Trocar de lugar os sapos verdes e os vermelhos.',
    steps: [
      'Os verdes começam à esquerda e os vermelhos à direita; no meio há uma vitória-régia vazia.',
      'Toque num sapo para ele andar: ele pula para a vitória-régia vazia ao lado ou por cima de 1 sapo.',
      'Sapos só andam para a frente: verdes para a direita, vermelhos para a esquerda.',
      'No fim, os verdes ficam à direita e os vermelhos à esquerda.',
    ],
  },
  balanca: {
    goal: 'Deixar os dois pratos da balança com o mesmo peso.',
    steps: [
      'Toque num peso para levá-lo ao prato da esquerda; toque de novo para o da direita; de novo para voltar à mesa.',
      'Todos os pesos precisam estar nos pratos.',
      'Vence quando os dois lados pesam igual.',
    ],
  },
  rio: {
    goal: 'Levar todo mundo para o outro lado do rio.',
    steps: [
      'Toque nas pessoas da margem para embarcar no barco, até o limite dele.',
      'Toque em Atravessar; o barco precisa de pelo menos 1 pessoa.',
      'Em qualquer margem (e no barco), canibais nunca podem ser mais que exploradores, senão eles são comidos.',
    ],
  },
  cavalo: {
    goal: 'Passar por todas as casas, uma única vez.',
    steps: [
      'O cavalo ♞ anda em L: 2 casas numa direção e 1 para o lado.',
      'Toque numa casa destacada para mover o cavalo até ela.',
      'Casas já visitadas não podem ser usadas de novo.',
      'Termina quando todas as casas forem visitadas.',
    ],
  },
  torres: {
    goal: 'Preencher a grade com prédios de alturas diferentes.',
    steps: [
      'Toque numa casa para trocar o número: é a altura do prédio (1 é o mais baixo).',
      'Nenhum número pode repetir na mesma linha ou coluna.',
      'O número fora da grade diz quantos prédios você vê olhando daquele lado: um prédio alto esconde os menores atrás dele.',
      'Números errados ficam em vermelho.',
    ],
  },
  mentira: {
    goal: 'Descobrir quem fala a verdade e quem mente.',
    steps: [
      'Sinceros sempre dizem a verdade; mentirosos sempre mentem.',
      'Toque em cada pessoa para marcar Sincero ou Mentiroso.',
      'Quando todos estiverem marcados, toque em Verificar. Errar custa uma vida.',
    ],
  },
  moeda: {
    goal: 'Descobrir qual moeda é a mais pesada.',
    steps: [
      'Toque nas moedas para mandá-las para a esquerda ou a direita da balança, ou deixá-las de fora.',
      'Os dois lados precisam ter o mesmo número de moedas; toque em Pesar.',
      'Você tem poucas pesagens. Quando souber, toque em Dar palpite e na moeda; errar custa uma vida.',
    ],
  },
  panquecas: {
    goal: 'Ordenar a pilha: maior embaixo, menor em cima.',
    steps: [
      'Toque numa panqueca: ela e todas as que estão acima dela viram de cabeça para baixo.',
      'Planeje os giros para levar a maior para o fundo e depois as próximas.',
      'Menos giros dão mais pontos.',
    ],
  },
  circuito: {
    goal: 'Acender a lâmpada de cima.',
    steps: [
      'Toque nas chaves de baixo para ligar ou desligar.',
      'A corrente passa pelas portas lógicas: E (AND) precisa de todas ligadas, OU (OR) de alguma, NÃO (NOT) inverte.',
      'XOR liga se só uma entrada estiver ligada; NAND e NOR são o contrário de AND e OR.',
    ],
  },
  encaixe: {
    goal: 'Preencher o tabuleiro inteiro com as peças.',
    steps: [
      'Escolha uma peça embaixo e use Girar para rodá-la.',
      'Toque no tabuleiro para encaixar a peça; toque numa peça já colocada para pegá-la de volta.',
      'Não pode sobrar espaço nem sobrepor peças. Use Limpar para recomeçar.',
    ],
  },
  rolante: {
    goal: 'Levar o dado até a bandeira com o número pedido virado para cima.',
    steps: [
      'Use as setas (ou deslize o dedo) para rolar o dado uma casa.',
      'Cada rolada muda as faces: faces opostas somam 7.',
      'Chegue à bandeira com o número pedido em cima.',
    ],
  },
  jarros: {
    goal: 'Deixar exatamente a quantidade pedida num jarro.',
    steps: [
      'Os jarros não têm marcas: só dá para saber quando estão cheios ou vazios.',
      'Toque num jarro e depois em Encher ou Esvaziar.',
      'Ou toque num jarro e depois em outro para despejar: a água passa até encher o outro ou esvaziar o primeiro.',
      'Misture os jarros até sobrar a quantidade pedida em cima da tela.',
    ],
  },
  padroes: {
    goal: 'Descobrir o número que continua a sequência.',
    steps: [
      'Observe como os números mudam: somam, multiplicam, alternam…',
      'Toque na alternativa que ocupa o lugar do ?.',
      'Errar custa uma vida e bloqueia aquela alternativa.',
    ],
  },
};
