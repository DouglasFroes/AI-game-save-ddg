import type { DayStats, Page } from './api';

/** Escapes text for use inside HTML. Everything from the API goes through this. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** 45s, 2m 15s, 2h 5m. */
export function duration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

export const number = (n: number): string => (Number.isFinite(n) ? n.toLocaleString('pt-BR') : '0');

export function percent(part: number, total: number, digits = 1): string {
  if (!total || total <= 0 || !Number.isFinite(part)) return '0%';
  const pct = (part / total) * 100;
  if (digits === 0) return `${Math.round(pct)}%`;
  return `${pct.toFixed(digits).replace('.', ',')}%`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** "há 5 min", "há 3 h", "há 2 d". */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min)) return '—';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

/** Quotes a CSV cell when it needs it. */
export function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Computes the page button sequence for pagination controls, inserting `'…'` where pages are skipped.
 */
export function pageRange(current: number, totalPages: number): Array<number | '…'> {
  const total = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(total, Math.max(1, Math.floor(current)));
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | '…'> = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);

  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

/**
 * Slices a client-side array into a standard `Page<T>` object, clamping `page` into valid bounds.
 */
export function paginateSlice<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const safePerPage = Math.max(1, Math.floor(perPage));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page)));
  const offset = (safePage - 1) * safePerPage;
  return {
    items: items.slice(offset, offset + safePerPage),
    total,
    page: safePage,
    per_page: safePerPage,
  };
}

/**
 * Fills a continuous sequence of `daysCount` UTC calendar days ending at `now` (or the latest day in `sparse`),
 * so days with 0 sessions still appear on the chart.
 */
export function fillDailyTimeline(
  sparse: readonly DayStats[],
  daysCount: number,
  now: Date = new Date(),
): DayStats[] {
  const count = Math.max(1, Math.min(365, Math.floor(daysCount)));
  const byDay = new Map<string, DayStats>();
  for (const d of sparse) {
    byDay.set(d.day.slice(0, 10), d);
  }
  const endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: DayStats[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(endUtc - i * 86_400_000);
    const key = dt.toISOString().slice(0, 10);
    const found = byDay.get(key);
    out.push(
      found
        ? { ...found, day: key }
        : { day: key, sessions: 0, play_seconds: 0, players: 0 },
    );
  }
  return out;
}

const DETAIL_LABELS: Readonly<Record<string, string>> = {
  level: 'Nível',
  wins: 'Vitórias',
  matches: 'Vitórias',
  goals: 'Gols',
  baskets: 'Cestas',
  strikes: 'Strikes',
  strokes: 'Tacadas',
  diff: 'Par',
  kos: 'Nocautes',
  place: 'Lugar',
  time: 'Tempo',
  missed: 'Perdidos',
  hits: 'Acertos',
  accuracy: 'Precisão',
  xs: 'X',
  perfects: 'Perfeitos',
  lines: 'Linhas',
  moves: 'Movimentos',
  combo: 'Combo',
  wave: 'Onda',
  floor: 'Andar',
  stars: 'Estrelas',
  coins: 'Moedas',
  distance: 'Distância',
  best: 'Melhor',
  mine: 'Você',
  theirs: 'Rival',
};

export function formatDetailPairs(details: Record<string, number> | null | undefined): Array<{ label: string; value: string }> {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([k, v]) => {
      const label = DETAIL_LABELS[k] ?? k;
      let val = number(v);
      if (k === 'accuracy') val = `${v}%`;
      else if (k === 'place') val = `${v}º`;
      return { label, value: val };
    });
}

export function parseHashRoute(hash: string): { tab: string; params: URLSearchParams } {
  const clean = hash.replace(/^#\/?/, '');
  const qIndex = clean.indexOf('?');
  if (qIndex === -1) {
    return { tab: clean || 'geral', params: new URLSearchParams() };
  }
  return {
    tab: clean.slice(0, qIndex) || 'geral',
    params: new URLSearchParams(clean.slice(qIndex + 1)),
  };
}

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} GB`;
}

export function anomalyReasonLabel(reason: string): { title: string; desc: string } {
  switch (reason) {
    case 'no_session':
      return {
        title: 'Recorde sem partida',
        desc: 'Recorde enviado ao ranking sem nenhuma sessão registrada neste jogo.',
      };
    case 'score_mismatch':
      return {
        title: 'Acima da maior sessão',
        desc: 'Pontuação no ranking maior que a maior pontuação já registrada nas partidas do jogador.',
      };
    case 'short_high_score':
    default:
      return {
        title: 'Alta pontuação em ≤4s',
        desc: 'Pontuação elevada obtida em uma sessão extremamente curta.',
      };
  }
}
