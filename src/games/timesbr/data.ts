import type { Campaign, Nation } from '@/games/selecao/data';

/**
 * Brazilian clubs and seasons. Same format as the national teams (see selecao/data.ts): rosters
 * are written from memory, so a few names may be off. Seasons without a roster are only opponents.
 */
const c = (strength: number, roster?: string): Campaign => ({
  strength,
  ...(roster ? { roster } : {}),
});

export const CLUBS: readonly Nation[] = [
  {
    name: 'Santos',
    flag: '⚪',
    cups: {
      1962: c(
        93,
        'GOL: Gilmar*, Laércio~; LD: Lima, Ismael~; LE: Dalmo; ZAG: Mauro*, Calvet, Zé Carlos~; VOL: Zito*; MC: Mengálvio; MEI: Coutinho*; PD: Dorval; PE: Pepe*; CA: Pelé*, Coutinho*',
      ),
      1963: c(
        91,
        'GOL: Gilmar*, Laércio~; LD: Lima; LE: Dalmo; ZAG: Mauro*, Haroldo, Calvet; VOL: Zito*; MC: Mengálvio; PD: Dorval; PE: Pepe*; CA: Pelé*, Coutinho*, Almir~',
      ),
      2011: c(
        80,
        'GOL: Rafael*; LD: Danilo*; LE: Léo; ZAG: Durval, Edu Dracena, Bruno Rodrigo~; VOL: Arouca, Adriano; MC: Elano~; MEI: Ganso*, Paulo Henrique~; PD: Neymar*; CA: Borges*, Zé Love~',
      ),
      1978: c(74),
    },
  },
  {
    name: 'Flamengo',
    flag: '🔴',
    cups: {
      1981: c(
        91,
        'GOL: Raul*, Cantarele~; LD: Leandro*, Nei Dias~; LE: Júnior*; ZAG: Mozer*, Marinho, Figueiredo~; VOL: Andrade*, Vitor~; MC: Adílio*; MEI: Zico*; PD: Tita*, Lico; PE: Lico~; CA: Nunes*, Anselmo~',
      ),
      2019: c(
        91,
        'GOL: Diego Alves*, César~; LD: Rafinha*, Pará~; LE: Filipe Luís*, Renê; ZAG: Rodrigo Caio, Pablo Marí*, Léo Duarte, Gustavo Henrique; VOL: Willian Arão, Gerson*; MC: Arrascaeta*; MEI: Everton Ribeiro*; PE: Bruno Henrique*; PD: Éverton Cebolinha~; CA: Gabigol*, Vitinho~',
      ),
      2022: c(
        84,
        'GOL: Santos, Hugo Souza~; LD: Rodinei; LE: Ayrton Lucas; ZAG: David Luiz*, Fabrício Bruno, Léo Pereira; VOL: Thiago Maia, Willian Arão; MC: João Gomes*, Everton Ribeiro; MEI: Arrascaeta*, Gerson; PD: Marinho; PE: Bruno Henrique*; CA: Pedro*, Gabigol*',
      ),
      1992: c(80),
    },
  },
  {
    name: 'Palmeiras',
    flag: '🟢',
    cups: {
      1999: c(
        86,
        'GOL: Marcos*, Sérgio~; LD: Arce*; LE: Júnior; ZAG: Roque Júnior*, Júnior Baiano, Cléber; VOL: Galeano, César Sampaio*; MEI: Alex*, Zinho; PD: Paulo Nunes; PE: Euller; CA: Oséas, Evair*, Asprilla~',
      ),
      2020: c(
        84,
        'GOL: Weverton*, Jailson~; LD: Marcos Rocha; LE: Viña; ZAG: Gustavo Gómez*, Luan, Emerson Santos~; VOL: Danilo, Felipe Melo*; MC: Zé Rafael, Patrick de Paula~; MEI: Raphael Veiga*; PD: Dudu*; PE: Rony; CA: Luiz Adriano, Willian~',
      ),
      2021: c(
        86,
        'GOL: Weverton*, Vinícius Silva~; LD: Mayke, Marcos Rocha; LE: Piquerez, Viña; ZAG: Gustavo Gómez*, Luan, Murilo; VOL: Danilo*, Felipe Melo; MC: Zé Rafael; MEI: Raphael Veiga*; PD: Dudu*; PE: Rony*, Gabriel Menino~; CA: Deyverson, Luiz Adriano~',
      ),
      1969: c(80),
    },
  },
  {
    name: 'Corinthians',
    flag: '⚫',
    cups: {
      2012: c(
        85,
        'GOL: Cássio*, Júlio César~; LD: Alessandro; LE: Fábio Santos; ZAG: Chicão, Paulo André*, Leandro Castán~; VOL: Ralf*; MC: Paulinho*, Danilo*; PD: Jorge Henrique; PE: Emerson Sheik*; CA: Guerrero*, Romarinho, Liedson~',
      ),
      1999: c(
        83,
        'GOL: Dida*, Márcio~; LD: Índio; LE: Kléber; ZAG: Adílson, Gamarra*, Nenê~; VOL: Vampeta*; MC: Rincón*; MEI: Edilson, Ricardinho*; PD: Marcelinho Carioca*; CA: Luizão*, Gilmar~',
      ),
      1977: c(74),
    },
  },
  {
    name: 'São Paulo',
    flag: '🔺',
    cups: {
      1992: c(
        89,
        'GOL: Zetti*, Ronaldo~; LD: Cafu*, Vítor; LE: Leonardo*; ZAG: Ronaldão, Válber, Antônio Carlos~; VOL: Pintado, Axel~; MC: Toninho Cerezo*, Palhinha*; MEI: Raí*; PD: Müller*; PE: Elivélton~; CA: Macedo, Dinho~',
      ),
      2005: c(
        86,
        'GOL: Rogério Ceni*, Bosco~; LD: Cicinho*; LE: Júnior; ZAG: Fabão, Lugano*, Edcarlos~; VOL: Mineiro*, Josué; MC: Danilo*; MEI: Diego Tardelli~; PD: Amoroso*; PE: Aloísio; CA: Grafite*, Luizão~',
      ),
      2008: c(
        80,
        'GOL: Rogério Ceni*, Bosco~; LD: Zé Luís, Jancarlos~; LE: Júnior César; ZAG: Miranda*, André Dias; VOL: Hernanes*, Jean; MC: Joílson, Richarlyson; MEI: Hugo; PD: Borges; CA: Dagoberto*, Aloísio, Adriano~',
      ),
    },
  },
  {
    name: 'Grêmio',
    flag: '🔵',
    cups: {
      1983: c(
        85,
        'GOL: Mazarópi, Leão~; LD: Paulo César; LE: Casemiro; ZAG: De León*, Baidek; VOL: China; MC: Osvaldo; MEI: Paulo Isidoro, Tonho; PD: Renato Gaúcho*; CA: César, Tarciso*',
      ),
      1995: c(
        84,
        'GOL: Danrlei*, Marcos~; LD: Arce*; LE: Roger; ZAG: Adílson, Rivarola, Luís Eduardo~; VOL: Dinho, Goiano*; MC: Luís Carlos Goiano, Carlos Miguel; MEI: Paulo Nunes*; PD: Jardel*; PE: Alcindo~; CA: Jardel*, Müller~',
      ),
      2017: c(
        83,
        'GOL: Marcelo Grohe*, Paulo Victor~; LD: Edílson; LE: Bruno Cortez; ZAG: Geromel*, Kannemann*, Rafael Thyere~; VOL: Michel*; MC: Arthur*, Jailson; MEI: Ramiro, Everton*; PD: Luan*; CA: Lucas Barrios, Fernandinho~',
      ),
    },
  },
  {
    name: 'Internacional',
    flag: '🟥',
    cups: {
      2006: c(
        86,
        'GOL: Clemer*, Renan~; LD: Ceará; LE: Rubens Cardoso; ZAG: Índio*, Fabiano Eller*, Alex~; VOL: Edinho, Fernandão*; MC: Wellington Monteiro, Tinga*; MEI: Alex*, D’Alessandro; PD: Iarley; PE: Rafael Sóbis*; CA: Fernandão*, Nilmar~',
      ),
      1979: c(
        83,
        'GOL: Benítez*, Gasperin~; LD: Toninho Baiano; LE: Mauro Pastor; ZAG: Figueroa*, Mauro Galvão*, Aristeu~; VOL: Batista, Jair; MC: Falcão*, Tonho~; MEI: Mário Sérgio~; PD: Valdomiro*; PE: Chico Spina~; CA: Bira*, Adílson~',
      ),
      1975: c(87),
    },
  },
  {
    name: 'Cruzeiro',
    flag: '💠',
    cups: {
      1976: c(
        83,
        'GOL: Raul*, Luís Antônio~; LD: Nelinho*; LE: Vanderlei; ZAG: Darci Menezes, Morais; VOL: Piazza*; MC: Zé Carlos; MEI: Eduardo Amorim; PD: Joãozinho*; PE: Palhinha~; CA: Dirceu Lopes*, Roberto Batata~',
      ),
      2003: c(
        86,
        'GOL: Gomes*, Rafael~; LD: Maurinho; LE: Leandro; ZAG: Luisão*, Cris*, Maicon~; VOL: Augusto Recife, Maldonado; MC: Wendel; MEI: Alex*, Deivid~; PD: Zinho~; PE: Aristizábal; CA: Alex*, Deivid, Mota~',
      ),
      1997: c(82),
    },
  },
  {
    name: 'Atlético-MG',
    flag: '🐓',
    cups: {
      2013: c(
        83,
        'GOL: Victor*, Giovanni~; LD: Marcos Rocha*; LE: Júnior César; ZAG: Réver*, Léo Silva, Gilberto Silva~; VOL: Pierre*, Leandro Donizete; MC: Josué; MEI: Ronaldinho*, Bernard~; PD: Tardelli; PE: Luan*; CA: Jô*, Diego Tardelli*',
      ),
      2021: c(
        85,
        'GOL: Everson*, Rafael~; LD: Mariano; LE: Guilherme Arana*; ZAG: Nathan Silva, Junior Alonso, Réver; VOL: Allan*, Jair; MC: Zaracho, Tchê Tchê~; MEI: Nacho Fernández*; PD: Hyoran~; PE: Keno*, Savarino; CA: Hulk*, Diego Costa~',
      ),
    },
  },
  {
    name: 'Fluminense',
    flag: '🍃',
    cups: {
      1984: c(
        82,
        'GOL: Paulo Victor*, Ricardo Pinto~; LD: Aldo; LE: Branco*; ZAG: Duílio, Ricardo Gomes*; VOL: Jandir; MC: Delei; MEI: Assis*, Romerito*; PD: Tato; PE: Washington~; CA: Washington*, Tato~',
      ),
      2023: c(
        84,
        'GOL: Fábio*, Marcelo Pitaluga~; LD: Samuel Xavier, Guga~; LE: Marcelo*; ZAG: Nino*, Felipe Melo*, Manoel~; VOL: André*; MC: Martinelli*, Alexsander~; MEI: Ganso*; PD: Arias*; PE: Keno, Marquinhos~; CA: Cano*, John Kennedy~',
      ),
      2012: c(82),
    },
  },
  {
    name: 'Vasco',
    flag: '⚓',
    cups: {
      1998: c(
        84,
        'GOL: Carlos Germano*, Hélton~; LD: Vágner; LE: Felipe*; ZAG: Mauro Galvão*, Odvan, Gilberto~; VOL: Nasa*, Luisinho; MC: Juninho Pernambucano*, Ramon; MEI: Juninho Pernambucano*; PD: Luizão*; PE: Donizete*, Edmundo~; CA: Donizete*, Luizão~',
      ),
      2000: c(
        83,
        'GOL: Helton*, Hélton~; LD: Jorginho Paulista; LE: Gílson Kleina; ZAG: Mauro Galvão, Júnior Baiano, Odvan~; VOL: Juninho Paulista, Fabrício; MC: Ramon; MEI: Romário*, Euller; PD: Euller*; CA: Romário*, Edmundo*, Viola~',
      ),
      1989: c(78),
    },
  },
  {
    name: 'Botafogo',
    flag: '⭐',
    cups: {
      1968: c(
        84,
        'GOL: Manga*, Cao~; LD: Moreira; LE: Rildo; ZAG: Leônidas, Nei Conceição; VOL: Carlos Roberto, Gérson*; MC: Gérson*, Afonsinho; MEI: Paulo César*; PD: Jairzinho*; PE: Rogério; CA: Roberto*, Zequinha~',
      ),
      2023: c(
        81,
        'GOL: John*, Gatito Fernández~; LD: Di Placido, Hugo~; LE: Marçal*; ZAG: Adryelson, Bastos*, Victor Cuesta~; VOL: Tchê Tchê, Marlon Freitas*; MC: Eduardo, Danilo Barbosa; MEI: Almada*; PD: Júnior Santos*, Luis Henrique; PE: Luiz Henrique*; CA: Tiquinho Soares*, Matheus Nascimento~',
      ),
      1995: c(82),
    },
  },
  // Only opponents (no roster to draft).
  { name: 'Athletico-PR', flag: '🌪️', cups: { 2005: c(74), 2019: c(78) } },
  { name: 'Bahia', flag: '🔔', cups: { 1988: c(76), 2022: c(68) } },
  { name: 'Sport', flag: '🦁', cups: { 1987: c(78), 2008: c(66) } },
  { name: 'Goiás', flag: '💚', cups: { 1999: c(68), 2010: c(64) } },
  { name: 'Coritiba', flag: '🤍', cups: { 1985: c(74), 2011: c(68) } },
  { name: 'Vitória', flag: '🛡️', cups: { 1993: c(66), 2010: c(65) } },
];
