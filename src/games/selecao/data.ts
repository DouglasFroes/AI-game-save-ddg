/**
 * National teams and the World Cups they played, with a rough strength for each campaign.
 * Squads are generated from this table (see core.ts) with invented player names, so no real
 * person or likeness is used: the fun is in the draw, not in the names.
 */
export interface Nation {
  readonly name: string;
  readonly flag: string;
  /** World Cup year → team strength (about 60–93). */
  readonly cups: Readonly<Record<number, number>>;
  /** Surnames used to invent the squads (space separated). */
  readonly surnames: string;
}

export const NATIONS: readonly Nation[] = [
  {
    name: 'Brasil',
    flag: '🇧🇷',
    cups: { 1958: 87, 1970: 93, 1982: 88, 1994: 86, 2002: 90, 2014: 80, 2022: 85 },
    surnames:
      'Andrade Barreto Cardoso Duarte Esteves Fagundes Guedes Lacerda Moraes Nogueira Pacheco Rangel',
  },
  {
    name: 'Argentina',
    flag: '🇦🇷',
    cups: { 1978: 82, 1986: 88, 1990: 79, 2014: 84, 2022: 90 },
    surnames:
      'Acosta Bianchi Cabrera Dominguez Escobar Ferrero Gimenez Herrera Ibarra Juarez Lombardi Medina',
  },
  {
    name: 'Alemanha',
    flag: '🇩🇪',
    cups: { 1954: 80, 1974: 90, 1990: 89, 2002: 82, 2014: 91 },
    surnames:
      'Albrecht Brandt Dietrich Eberle Fischer Gruber Hartmann Jaeger Keller Lindner Maurer Neumann',
  },
  {
    name: 'Itália',
    flag: '🇮🇹',
    cups: { 1934: 76, 1970: 86, 1982: 87, 2006: 89 },
    surnames:
      'Bellini Conti Donati Esposito Fabbri Greco Lombardo Marini Neri Orsini Pellegrini Rinaldi',
  },
  {
    name: 'França',
    flag: '🇫🇷',
    cups: { 1958: 82, 1998: 90, 2006: 85, 2018: 91, 2022: 90 },
    surnames:
      'Arnaud Beaumont Chevalier Delacroix Fournier Gauthier Hamel Joubert Lacombe Marchand Navarre Perrin',
  },
  {
    name: 'Espanha',
    flag: '🇪🇸',
    cups: { 1950: 76, 1982: 74, 2010: 92, 2022: 84 },
    surnames:
      'Alvarado Blanco Castillo Delgado Espinosa Fuentes Gallego Hidalgo Iglesias Jimenez Luque Montero',
  },
  {
    name: 'Inglaterra',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    cups: { 1966: 85, 1990: 80, 2018: 83, 2022: 86 },
    surnames:
      'Ashworth Bradley Carter Dawson Ellison Fletcher Granger Hollis Ingram Kendall Langley Mercer',
  },
  {
    name: 'Holanda',
    flag: '🇳🇱',
    cups: { 1974: 90, 1978: 84, 1998: 85, 2010: 86, 2014: 85 },
    surnames:
      'Aalders Bakker Corver Dekker Evers Faber Gerritsen Hoekstra Jansen Kuiper Linden Moerman',
  },
  {
    name: 'Portugal',
    flag: '🇵🇹',
    cups: { 1966: 80, 2006: 82, 2016: 78, 2022: 84 },
    surnames:
      'Abrantes Bragança Cardim Domingos Estrela Furtado Gouveia Henriques Lourenço Matos Neves Ourique',
  },
  {
    name: 'Uruguai',
    flag: '🇺🇾',
    cups: { 1950: 82, 1970: 76, 2010: 79, 2018: 78 },
    surnames:
      'Alzaga Bentancor Calleros Dutra Echeverry Ferreyra Giraldo Hernandez Irazoqui Lasa Mendoza Olivera',
  },
  {
    name: 'Croácia',
    flag: '🇭🇷',
    cups: { 1998: 78, 2018: 84, 2022: 83 },
    surnames:
      'Babic Cosic Dragic Ercegovac Filipovic Grgic Horvat Ivancic Jurkovic Kovacic Lukic Maric',
  },
  {
    name: 'Bélgica',
    flag: '🇧🇪',
    cups: { 1986: 76, 2018: 87, 2022: 80 },
    surnames:
      'Aerts Brouwers Claes Desmet Evrard Francois Goossens Hendrickx Jacobs Lambert Maes Peeters',
  },
  {
    name: 'México',
    flag: '🇲🇽',
    cups: { 1970: 68, 1986: 72, 2018: 74, 2022: 70 },
    surnames:
      'Aguirre Banda Cervantes Dorantes Escamilla Fierro Garza Huerta Ibanez Jaramillo Leyva Mondragon',
  },
  {
    name: 'Japão',
    flag: '🇯🇵',
    cups: { 2002: 68, 2010: 69, 2018: 73, 2022: 75 },
    surnames: 'Abe Fujita Goto Hayashi Ikeda Kimura Maeda Nakamura Okada Saito Takeda Yamada',
  },
  {
    name: 'Marrocos',
    flag: '🇲🇦',
    cups: { 1986: 66, 2018: 70, 2022: 80 },
    surnames:
      'Amrabat Benali Chaouki Daoudi Elidrissi Fassi Guerrouj Haddad Idrissi Jabri Karimi Lahlou',
  },
  {
    name: 'Colômbia',
    flag: '🇨🇴',
    cups: { 1990: 74, 1994: 76, 2014: 83, 2018: 77 },
    surnames:
      'Angulo Betancur Cuesta Diaz Echeverri Forero Gaviria Hurtado Ibarguen Lozano Mosquera Naranjo',
  },
  {
    name: 'Suécia',
    flag: '🇸🇪',
    cups: { 1958: 80, 1994: 77, 2018: 74 },
    surnames:
      'Axelsson Berglund Carlsson Dahlberg Ekstrom Forsberg Gustafsson Holmgren Isaksson Jonsson Lindqvist Nystrom',
  },
  {
    name: 'Hungria',
    flag: '🇭🇺',
    cups: { 1954: 91, 1938: 75, 1966: 72 },
    surnames: 'Balogh Czibor Dobos Egri Farkas Gulyas Hegedus Illes Juhasz Kocsis Lakatos Meszaros',
  },
  {
    name: 'Estados Unidos',
    flag: '🇺🇸',
    cups: { 1994: 66, 2002: 71, 2022: 72 },
    surnames:
      'Anderson Bennett Calloway Donovan Everett Foster Garrett Hastings Irwin Jennings Kessler Maddox',
  },
  {
    name: 'Coreia do Sul',
    flag: '🇰🇷',
    cups: { 2002: 74, 2010: 69, 2022: 72 },
    surnames: 'Bae Choi Han Hwang Jang Kang Kwon Lim Moon Park Seo Yoon',
  },
  {
    name: 'Senegal',
    flag: '🇸🇳',
    cups: { 2002: 73, 2018: 69, 2022: 72 },
    surnames: 'Badji Cisse Diagne Faye Gueye Kouyate Mbaye Ndiaye Sarr Sow Thiam Diop',
  },
  {
    name: 'Chile',
    flag: '🇨🇱',
    cups: { 1962: 74, 1998: 68, 2014: 74 },
    surnames:
      'Araya Burgos Contreras Donoso Fuenzalida Galdames Henriquez Inostroza Jara Lagos Maturana Orellana',
  },
];
