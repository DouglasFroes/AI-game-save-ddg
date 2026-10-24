import type { RankColumn } from '@/games/registry';
import { GLOBAL_TOP } from '@/platform/leaderboard';
import { LOCAL_TOP } from '@/platform/localTop';
import { formatNumber } from '@/platform/ranking';
import { UI } from './hubTheme';
import type { IconKind } from './icons';

export const AVATAR_PALETTE = [0x38e1ff, 0x8b5cf6, 0xff5fb8, 0x34d399, 0xfbbf24, 0xfb7185] as const;

export interface ParsedStat {
  readonly label: string;
  readonly value: string;
}

export interface FormattedColumns {
  readonly primary: ParsedStat;
  readonly extras: readonly ParsedStat[];
}

export interface RunAchievement {
  readonly id: string;
  readonly icon: IconKind;
  readonly title: string;
  readonly subtitle: string;
  readonly color: number;
}

export interface RunAchievementInput {
  readonly hasRecord: boolean;
  readonly score: number;
  readonly previousBest: number;
  readonly newBest: boolean;
  readonly localPlace: number | null;
  readonly globalRank: number | null;
}

/** Deterministic positive hash from a string. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Picks a vibrant avatar color for a player name. */
export function avatarColorFor(name: string): number {
  if (!name.trim()) return UI.faint;
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length]!;
}

/** Respects system reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Splits a run stat string like `"Distância: 1,2 km"` into a label and value. */
export function parseStatLine(line: string): ParsedStat {
  const idx = line.indexOf(':');
  if (idx > 0 && idx < line.length - 1) {
    return {
      label: line.slice(0, idx).trim().toUpperCase(),
      value: line.slice(idx + 1).trim(),
    };
  }
  return { label: 'DESTAQUE', value: line.trim() };
}

/** Formats a single `RankColumn` value from a run's score and details. */
export function formatColumnCell(
  col: RankColumn,
  score: number,
  details: Readonly<Record<string, number>>,
): string {
  const v = col.key === 'score' ? score : details[col.key];
  if (v === undefined) return '-';
  return col.format ? col.format(v) : formatNumber(v);
}

/**
 * Separates a game's ranking columns into the primary headline metric and secondary detail chips,
 * preserving every column defined in `registry.ts`.
 */
export function formatRunColumns(
  columns: readonly RankColumn[],
  score: number,
  details: Readonly<Record<string, number>>,
): FormattedColumns {
  if (columns.length === 0) {
    return {
      primary: { label: 'PONTOS', value: formatNumber(score) },
      extras: [],
    };
  }
  const primaryCol = columns.find((c) => c.key === 'score') ?? columns[0]!;
  const primary: ParsedStat = {
    label: primaryCol.label === '★' ? 'ESTRELAS' : primaryCol.label.toUpperCase(),
    value:
      primaryCol.label === '★'
        ? `★ ${formatColumnCell(primaryCol, score, details)}`
        : formatColumnCell(primaryCol, score, details),
  };
  const extras: ParsedStat[] = columns
    .filter((c) => c !== primaryCol)
    .map((c) => ({
      label: c.label,
      value: formatColumnCell(c, score, details),
    }));
  return { primary, extras };
}

/** Formats an ISO date into `DD/MM` (plus `HH:MM` when valid) for personal run history. */
export function formatRunDate(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: '-', full: '-' };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return { short: `${dd}/${mm}`, full: `${dd}/${mm} · ${hh}:${min}` };
}

/**
 * Computes 0 to 3 performance stars for a run based on record progression and personal ranking.
 */
export function computeRunStars(
  score: number,
  previousBest: number,
  newBest: boolean,
  localPlace: number | null,
  hasRecord: boolean,
): 0 | 1 | 2 | 3 {
  if (!hasRecord || score <= 0) return 0;
  if (newBest || localPlace === 1 || (previousBest > 0 && score >= previousBest)) return 3;
  if (
    (localPlace !== null && localPlace <= 3) ||
    (previousBest > 0 && score >= previousBest * 0.65)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Generates up to 3 collectible achievement badges for the end-of-run screen.
 */
export function computeRunAchievements(input: RunAchievementInput): RunAchievement[] {
  const { hasRecord, score, previousBest, newBest, localPlace, globalRank } = input;
  if (!hasRecord) {
    return [
      {
        id: 'keep-going',
        icon: 'flame',
        title: 'Continue Tentando',
        subtitle: 'A prática leva ao topo',
        color: UI.pink,
      },
      {
        id: 'best-target',
        icon: 'crown',
        title: 'Meta Pessoal',
        subtitle:
          previousBest > 0 ? `Recorde: ${formatNumber(previousBest)}` : 'Busque o 1º recorde',
        color: UI.gold,
      },
    ];
  }

  const list: RunAchievement[] = [];
  if (newBest) {
    const diff = score - previousBest;
    list.push({
      id: 'new-record',
      icon: 'crown',
      title: 'Novo Recorde!',
      subtitle: previousBest > 0 && diff > 0 ? `+${formatNumber(diff)} pts` : 'Marca histórica',
      color: UI.gold,
    });
  } else if (previousBest > 0 && score >= previousBest * 0.85) {
    list.push({
      id: 'almost-there',
      icon: 'flame',
      title: 'Na Trave!',
      subtitle: `${Math.round((score / previousBest) * 100)}% do recorde`,
      color: 0xff9a2e,
    });
  }

  if (globalRank !== null && globalRank <= GLOBAL_TOP) {
    list.push({
      id: 'global-top',
      icon: 'trophy',
      title: `Elite Top ${GLOBAL_TOP}`,
      subtitle: `${globalRank}º lugar no placar`,
      color: UI.cyan,
    });
  }

  if (localPlace !== null && localPlace <= 3) {
    list.push({
      id: 'personal-podium',
      icon: 'medal',
      title: 'Pódio Pessoal',
      subtitle: `${localPlace}º melhor resultado`,
      color: 0xc084fc,
    });
  } else if (localPlace !== null && localPlace <= LOCAL_TOP) {
    list.push({
      id: 'personal-top10',
      icon: 'star',
      title: `Top ${LOCAL_TOP} Pessoal`,
      subtitle: `${localPlace}º melhor seu`,
      color: UI.violet,
    });
  }

  if (list.length < 2) {
    list.push({
      id: 'run-complete',
      icon: 'bolt',
      title: 'Pontuação Somada',
      subtitle: `${formatNumber(score)} pts na partida`,
      color: 0x34d399,
    });
  }
  if (list.length < 2) {
    list.push({
      id: 'challenger',
      icon: 'sparkle',
      title: 'Competidor',
      subtitle: 'Pronto para revanche',
      color: UI.cyan,
    });
  }

  return list.slice(0, 3);
}
