import type { Team } from '@/games/selecao/core';

/**
 * Brazilian clubs and seasons they can be drawn from, with a rough strength for each campaign.
 * Like the national teams, squads are invented (no real players), only the clubs and years are real.
 */
const SURNAMES =
  'Almeida Batista Cavalcanti Damasceno Ferraz Gomes Henrique Jesus Lopes Machado Nascimento Oliveira Pereira Queiroz Ribeiro Santana Teixeira Vieira Xavier Zanetti';

const club = (
  name: string,
  flag: string,
  cups: Record<number, number>,
  surnames = SURNAMES,
): Team => ({ name, flag, cups, surnames });

export const CLUBS: readonly Team[] = [
  club('Santos', '⚪', { 1962: 93, 1963: 91, 1978: 74, 2011: 80 }),
  club('Flamengo', '🔴', { 1981: 91, 1992: 80, 2009: 78, 2019: 91, 2022: 84 }),
  club('Palmeiras', '🟢', { 1969: 80, 1996: 88, 1999: 86, 2020: 84, 2021: 86 }),
  club('Corinthians', '⚫', { 1977: 74, 1990: 78, 1999: 83, 2012: 85 }),
  club('São Paulo', '🔺', { 1977: 76, 1992: 89, 1993: 88, 2005: 86, 2008: 80 }),
  club('Grêmio', '🔵', { 1983: 85, 1995: 84, 2017: 83, 1996: 74 }),
  club('Internacional', '🟥', { 1975: 87, 1979: 83, 2006: 86, 2010: 80 }),
  club('Cruzeiro', '💠', { 1976: 83, 1997: 82, 2003: 86, 2014: 79 }),
  club('Atlético-MG', '🐓', { 1971: 78, 2013: 83, 2021: 85 }),
  club('Fluminense', '🍃', { 1984: 82, 2012: 82, 2023: 84, 1970: 72 }),
  club('Vasco', '⚓', { 1974: 76, 1998: 84, 2000: 83, 1989: 78 }),
  club('Botafogo', '⭐', { 1968: 84, 1995: 82, 2023: 81, 1962: 83 }),
  club('Athletico-PR', '🌪️', { 2001: 76, 2019: 78, 2005: 74 }),
  club('Bahia', '🔔', { 1988: 76, 1959: 72, 2022: 68 }),
  club('Sport', '🦁', { 1987: 78, 2008: 66, 1962: 66 }),
  club('Goiás', '💚', { 1999: 68, 2010: 64, 1990: 66 }),
  club('Coritiba', '🤍', { 1985: 74, 2011: 68, 1973: 66 }),
  club('Vitória', '🛡️', { 1993: 66, 2010: 65, 1999: 64 }),
];
