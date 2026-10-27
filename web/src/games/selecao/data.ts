/**
 * National teams and the World Cups they played. Each campaign has a rough team strength and,
 * for the ones that can be drawn, a roster written from memory (so a few call-ups may be off).
 *
 * Roster format: `POSITION: name, name*, name~; POSITION: …` — `*` marks a star, `~` a reserve;
 * the rating of each player comes from the campaign's strength plus that mark (see core.ts).
 * Campaigns without a roster are only used as opponents.
 */
export interface Campaign {
  /** Team strength (about 60–93). */
  readonly strength: number;
  readonly roster?: string;
}

export interface Nation {
  readonly name: string;
  readonly flag: string;
  /** Cup year → campaign. */
  readonly cups: Readonly<Record<number, Campaign>>;
}

const c = (strength: number, roster?: string): Campaign => ({
  strength,
  ...(roster ? { roster } : {}),
});

export const NATIONS: readonly Nation[] = [
  {
    name: 'Brasil',
    flag: '🇧🇷',
    cups: {
      1958: c(
        88,
        'GOL: Gilmar*, Castilho~; LD: Djalma Santos*, De Sordi; LE: Nilton Santos*; ZAG: Bellini*, Orlando, Mauro, Zózimo~; VOL: Zito, Dino~; MEI: Didi*; PD: Garrincha*, Joel~; PE: Zagallo; CA: Pelé*, Vavá*, Mazzola~',
      ),
      1970: c(
        93,
        'GOL: Félix, Ado~; LD: Carlos Alberto*, Zé Maria~; LE: Everaldo, Marco Antônio~; ZAG: Brito, Piazza, Fontana; VOL: Clodoaldo*; MC: Gérson*, Paulo Cézar~; MEI: Rivellino*; PD: Jairzinho*; PE: Edu~; CA: Pelé*, Tostão*, Roberto~',
      ),
      1982: c(
        89,
        'GOL: Waldir Peres, Paulo Sérgio~; LD: Leandro*, Edevaldo~; LE: Júnior*; ZAG: Oscar, Luizinho, Edinho, Juninho~; VOL: Falcão*, Batista~; MC: Cerezo*, Sócrates*; MEI: Zico*, Dirceu~; PE: Éder*; CA: Serginho, Careca~, Roberto Dinamite~',
      ),
      1994: c(
        87,
        'GOL: Taffarel, Zetti~, Gilmar~; LD: Jorginho, Cafu*; LE: Branco, Leonardo*; ZAG: Aldair*, Márcio Santos, Ronaldão~, Ricardo Rocha~; VOL: Dunga*, Mauro Silva*; MC: Mazinho, Zinho; MEI: Raí; ME: Müller~; CA: Romário*, Bebeto*, Viola~, Ronaldo~',
      ),
      2002: c(
        91,
        'GOL: Marcos*, Dida~, Rogério Ceni~; LD: Cafu*, Belletti~; LE: Roberto Carlos*, Júnior~; ZAG: Lúcio*, Roque Júnior, Edmílson, Anderson Polga~; VOL: Gilberto Silva*, Kléberson; MC: Juninho Paulista, Ricardinho~; MEI: Ronaldinho*, Rivaldo*; ME: Denílson~; CA: Ronaldo*, Luizão~, Edílson~',
      ),
      2014: c(
        80,
        'GOL: Júlio César, Jefferson~, Victor~; LD: Daniel Alves, Maicon~; LE: Marcelo, Maxwell~; ZAG: Thiago Silva*, David Luiz*, Dante, Henrique~; VOL: Luiz Gustavo, Fernandinho; MC: Paulinho, Ramires~; MEI: Oscar*, Willian; PE: Hulk, Bernard~; CA: Neymar*, Fred, Jô~',
      ),
      2022: c(
        86,
        'GOL: Alisson*, Ederson*, Weverton~; LD: Danilo, Daniel Alves~; LE: Alex Sandro, Alex Telles~; ZAG: Marquinhos*, Thiago Silva, Éder Militão*, Bremer; VOL: Casemiro*, Fabinho; MC: Fred, Bruno Guimarães, Paquetá*; PE: Vinícius Júnior*, Antony, Martinelli~; PD: Raphinha*, Rodrygo; CA: Neymar*, Richarlison, Gabriel Jesus, Pedro~',
      ),
    },
  },
  {
    name: 'Argentina',
    flag: '🇦🇷',
    cups: {
      1986: c(
        88,
        'GOL: Pumpido, Islas~; LD: Cuciuffo; LE: Olarticoechea; ZAG: Brown, Ruggeri*, Passarella*; VOL: Batista, Giusti*; MC: Enrique, Burruchaga*; MEI: Maradona*; PD: Pasculli~; CA: Valdano*, Borghi~',
      ),
      2014: c(
        84,
        'GOL: Romero, Andújar~; LD: Zabaleta; LE: Rojo, Basanta~; ZAG: Garay, Demichelis, Fernández~; VOL: Mascherano*; MC: Biglia, Gago~; MEI: Messi*, Di María*, Lavezzi, Pérez; CA: Higuaín*, Agüero*, Palacio~',
      ),
      2022: c(
        90,
        'GOL: Emiliano Martínez*, Armani~; LD: Molina; LE: Acuña, Tagliafico~; ZAG: Romero*, Otamendi*, Lisandro Martínez, Pezzella~; VOL: De Paul*, Paredes; MC: Mac Allister*, Enzo Fernández*; MEI: Messi*, Papu Gómez~; PE: Di María*; CA: Julián Álvarez*, Lautaro Martínez, Dybala~',
      ),
    },
  },
  {
    name: 'Alemanha',
    flag: '🇩🇪',
    cups: {
      1974: c(
        90,
        'GOL: Maier*, Nigbur~; LD: Vogts*; LE: Breitner*; ZAG: Beckenbauer*, Schwarzenbeck, Höttges~; VOL: Bonhof; MC: Overath*, Wimmer; MEI: Netzer~; PD: Grabowski; PE: Hölzenbein; CA: Gerd Müller*, Heynckes~',
      ),
      1990: c(
        89,
        'GOL: Illgner, Aumann~; LD: Reuter; LE: Brehme*, Berthold; ZAG: Kohler*, Augenthaler, Buchwald; VOL: Matthäus*; MC: Hässler, Thon~; ME: Littbarski*; CA: Klinsmann*, Völler*, Riedle~',
      ),
      2014: c(
        91,
        'GOL: Neuer*, Weidenfeller~; LD: Lahm*; LE: Höwedes; ZAG: Hummels*, Boateng*, Mertesacker; VOL: Schweinsteiger*, Khedira; MC: Kroos*; MEI: Özil*, Götze; PE: Podolski~; PD: Müller*, Schürrle; CA: Klose*',
      ),
    },
  },
  {
    name: 'Itália',
    flag: '🇮🇹',
    cups: {
      1982: c(
        87,
        'GOL: Zoff*, Bordon~; LD: Gentile*, Bergomi~; LE: Cabrini*; ZAG: Scirea*, Collovati, Vierchowod~; VOL: Oriali; MC: Tardelli*, Antognoni~; PD: Conti*; MEI: Dossena~; CA: Paolo Rossi*, Graziani, Altobelli~',
      ),
      2006: c(
        89,
        'GOL: Buffon*, Peruzzi~; LD: Zambrotta*, Oddo~; LE: Grosso*; ZAG: Cannavaro*, Materazzi, Nesta~; VOL: Pirlo*, Gattuso*; MC: Perrotta, De Rossi; ME: Camoranesi; MEI: Totti*; CA: Toni*, Gilardino, Inzaghi~, Del Piero*',
      ),
    },
  },
  {
    name: 'França',
    flag: '🇫🇷',
    cups: {
      1998: c(
        90,
        'GOL: Barthez, Charbonnier~; LD: Thuram*; LE: Lizarazu*; ZAG: Desailly*, Blanc*, Leboeuf; VOL: Deschamps*, Karembeu~; MC: Petit; MEI: Zidane*, Djorkaeff; PE: Henry~; PD: Lama~; CA: Dugarry, Guivarc’h, Trezeguet~',
      ),
      2006: c(
        85,
        'GOL: Barthez, Coupet~; LD: Sagnol; LE: Abidal; ZAG: Thuram*, Gallas; VOL: Makelele*, Vieira*; ME: Ribéry*, Malouda; MEI: Zidane*; CA: Henry*, Trezeguet, Wiltord~',
      ),
      2018: c(
        91,
        'GOL: Lloris*, Mandanda~; LD: Pavard; LE: Lucas Hernández*; ZAG: Varane*, Umtiti*, Kimpembe~; VOL: Kanté*; MC: Pogba*, Matuidi, Tolisso~; MEI: Griezmann*; PD: Mbappé*; ME: Dembélé~; CA: Giroud*, Fekir~',
      ),
    },
  },
  {
    name: 'Espanha',
    flag: '🇪🇸',
    cups: {
      2010: c(
        92,
        'GOL: Casillas*, Reina~; LD: Sergio Ramos*, Arbeloa~; LE: Capdevila; ZAG: Piqué*, Puyol*, Marchena~; VOL: Busquets*, Xabi Alonso*; MC: Xavi*, Iniesta*; MEI: Silva*, Cesc~; PD: Navas~; CA: Villa*, Torres*, Pedro~',
      ),
      2022: c(
        84,
        'GOL: Unai Simón, Raya~; LD: Carvajal; LE: Jordi Alba; ZAG: Laporte, Rodri*, Pau Torres; VOL: Busquets; MC: Gavi*, Pedri*, Koke~; ME: Ferran Torres, Asensio~; PD: Nico Williams~; CA: Morata, Sarabia~',
      ),
    },
  },
  {
    name: 'Inglaterra',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    cups: {
      1966: c(
        86,
        'GOL: Banks*, Bonetti~; LD: Cohen; LE: Wilson; ZAG: Moore*, Jack Charlton*; VOL: Stiles; MC: Bobby Charlton*, Ball; MD: Peters; CA: Hurst*, Hunt, Greaves~',
      ),
      1990: c(
        80,
        'GOL: Shilton, Woods~; LD: Stevens; LE: Pearce; ZAG: Butcher, Walker, Wright; VOL: Robson*; MC: Platt*, Webb~; MEI: Gascoigne*, Waddle; CA: Lineker*, Beardsley~',
      ),
      2018: c(
        83,
        'GOL: Pickford, Butland~; LD: Trippier, Walker; LE: Rose; ZAG: Maguire*, Stones, Cahill~; VOL: Dier, Henderson; MC: Alli, Lingard; ME: Sterling; CA: Kane*, Welbeck~, Rashford~',
      ),
    },
  },
  {
    name: 'Holanda',
    flag: '🇳🇱',
    cups: {
      1974: c(
        90,
        'GOL: Jongbloed, Schrijvers~; LD: Suurbier; LE: Krol*; ZAG: Rijsbergen, Haan; VOL: Neeskens*, Jansen; MC: Van Hanegem; PE: Rep*; PD: Rensenbrink~; CA: Cruyff*',
      ),
      1998: c(
        85,
        'GOL: Van der Sar, Waterreus~; LD: Reiziger; LE: Numan; ZAG: Stam*, Frank de Boer, Bogarde~; VOL: Davids*; MC: Cocu, Jonk; MEI: Bergkamp*, Seedorf; PE: Overmars*; CA: Kluivert*, Hasselbaink~, Zenden~',
      ),
      2010: c(
        86,
        'GOL: Stekelenburg, Vorm~; LD: Van der Wiel; LE: Van Bronckhorst; ZAG: Heitinga, Mathijsen; VOL: Van Bommel, De Jong; MEI: Sneijder*; PD: Robben*; PE: Kuyt; CA: Van Persie*, Huntelaar~',
      ),
    },
  },
  {
    name: 'Portugal',
    flag: '🇵🇹',
    cups: {
      2006: c(
        82,
        'GOL: Ricardo, Quim~; LD: Miguel; LE: Nuno Valente; ZAG: Ricardo Carvalho*, Jorge Andrade; VOL: Maniche, Petit; MEI: Deco*; PD: Figo*; PE: Cristiano Ronaldo*; CA: Pauleta*, Postiga~',
      ),
      2022: c(
        84,
        'GOL: Diogo Costa, Rui Patrício~; LD: Cancelo*, Dalot; LE: Nuno Mendes, Guerreiro; ZAG: Rúben Dias*, Pepe*, António Silva~; VOL: Danilo Pereira, Palhinha; MC: Bruno Fernandes*, Vitinha, Rúben Neves; MEI: Bernardo Silva*; PE: Rafael Leão*, João Félix*; CA: Cristiano Ronaldo*, Gonçalo Ramos, André Silva~',
      ),
    },
  },
  {
    name: 'Uruguai',
    flag: '🇺🇾',
    cups: {
      2010: c(
        79,
        'GOL: Muslera, Castillo~; LD: Maxi Pereira; LE: Fucile; ZAG: Lugano*, Godín, Victorino; VOL: Arévalo Ríos; MC: Diego Pérez, Gargano; MEI: Forlán*; ME: Álvaro Pereira; CA: Suárez*, Cavani, Abreu~',
      ),
      2018: c(
        78,
        'GOL: Muslera, Campaña~; LD: Varela; LE: Laxalt; ZAG: Godín*, Giménez, Coates; VOL: Torreira, Vecino; MC: Bentancur, Nández; ME: Cristian Rodríguez; CA: Suárez*, Cavani*, Stuani~',
      ),
    },
  },
  {
    name: 'Croácia',
    flag: '🇭🇷',
    cups: {
      2018: c(
        84,
        'GOL: Subašić, Kalinić~; LD: Vrsaljko; LE: Strinić; ZAG: Lovren, Vida; VOL: Brozović*; MC: Rakitić*, Modrić*; MEI: Badelj; ME: Perišić*, Rebić; CA: Mandžukić*, Kramarić',
      ),
      2022: c(
        83,
        'GOL: Livaković, Ivušić~; LD: Juranović; LE: Sosa; ZAG: Gvardiol*, Lovren, Ćaleta-Car; VOL: Brozović; MC: Modrić*, Kovačić*; MEI: Majer; ME: Perišić; CA: Kramarić, Petković, Livaja~',
      ),
    },
  },
  {
    name: 'Bélgica',
    flag: '🇧🇪',
    cups: {
      2018: c(
        87,
        'GOL: Courtois*, Mignolet~; LD: Meunier; LE: Chadli; ZAG: Alderweireld, Kompany*, Vertonghen; VOL: Witsel, Fellaini; MC: De Bruyne*, Dembélé; MEI: Hazard*; PD: Carrasco~; CA: Lukaku*, Mertens',
      ),
      2022: c(
        80,
        'GOL: Courtois*, Casteels~; LD: Castagne; LE: Meunier; ZAG: Alderweireld, Vertonghen, Faes~; VOL: Tielemans; MC: Witsel, De Bruyne*, Onana; MEI: Hazard, Mertens; CA: Lukaku, Batshuayi',
      ),
    },
  },
  {
    name: 'Hungria',
    flag: '🇭🇺',
    cups: {
      1954: c(
        91,
        'GOL: Grosics*, Gellér~; LD: Buzánszky; LE: Lantos; ZAG: Lóránt, Zakariás; VOL: Bozsik*; MEI: Hidegkuti*; PE: Czibor*, Budai~; PD: Tóth; CA: Puskás*, Kocsis*',
      ),
    },
  },
  {
    name: 'Colômbia',
    flag: '🇨🇴',
    cups: {
      2014: c(
        80,
        'GOL: Ospina, Vargas~; LD: Zúñiga; LE: Armero; ZAG: Yepes, Zapata; VOL: Sánchez, Guarín; MEI: James Rodríguez*; PD: Cuadrado*; CA: Gutiérrez, Jackson Martínez~',
      ),
    },
  },
  {
    name: 'Japão',
    flag: '🇯🇵',
    cups: {
      2022: c(
        75,
        'GOL: Gonda, Schmidt~; LD: Sakai; LE: Nagatomo; ZAG: Itakura, Tomiyasu, Yoshida; VOL: Endo*; MC: Morita, Tanaka; ME: Mitoma*, Kamada; CA: Maeda, Asano',
      ),
    },
  },
  {
    name: 'Marrocos',
    flag: '🇲🇦',
    cups: {
      2022: c(
        80,
        'GOL: Bounou*, El Kajoui~; LD: Hakimi*; LE: Mazraoui; ZAG: Saïss, Aguerd, Dari~; VOL: Amrabat*; MC: Ounahi, Sabiri~; ME: Ziyech*; CA: En-Nesyri, Boufal, Hamdallah~',
      ),
    },
  },
  // Only opponents (no roster to draft).
  { name: 'México', flag: '🇲🇽', cups: { 2018: c(74), 1986: c(72) } },
  { name: 'Estados Unidos', flag: '🇺🇸', cups: { 2022: c(72) } },
  { name: 'Coreia do Sul', flag: '🇰🇷', cups: { 2002: c(74), 2022: c(70) } },
  { name: 'Senegal', flag: '🇸🇳', cups: { 2002: c(73) } },
  { name: 'Gana', flag: '🇬🇭', cups: { 2010: c(72) } },
  { name: 'Costa Rica', flag: '🇨🇷', cups: { 2014: c(70) } },
  { name: 'Austrália', flag: '🇦🇺', cups: { 2022: c(68) } },
  { name: 'Irã', flag: '🇮🇷', cups: { 2022: c(66) } },
  { name: 'Arábia Saudita', flag: '🇸🇦', cups: { 2022: c(67) } },
  { name: 'Camarões', flag: '🇨🇲', cups: { 1990: c(70) } },
  { name: 'Suécia', flag: '🇸🇪', cups: { 1994: c(77) } },
  { name: 'Suíça', flag: '🇨🇭', cups: { 2022: c(72) } },
  { name: 'Equador', flag: '🇪🇨', cups: { 2022: c(68) } },
  { name: 'Paraguai', flag: '🇵🇾', cups: { 2010: c(72) } },
];
