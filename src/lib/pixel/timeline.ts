import { HEARTH } from "./hearth";

const DAY = 86_400_000;
/** Days in which a piece cools to 1/e of its warmth. */
const COOLING_DAYS = 15;
const KINDLING_DAYS = 2.5;
const LEAD = 5;
const TRAIL = 12;

export interface Timeline {
  /** Fuel per column in [0, 1). */
  profile: number[];
  columnOf: (date: Date) => number;
  /** First days of each quarter in range, for the axis. */
  quarters: Date[];
}

/** Every piece warms the days after it; the hearth burns on that history. */
export function createTimeline(
  dates: readonly Date[],
  columns: number = HEARTH.columns,
): Timeline {
  const times = dates.map((date) => date.getTime());
  const first = Math.min(...times);
  const last = Math.max(...times);
  const perColumn = Math.max(DAY, (last - first) / (columns - LEAD - TRAIL));
  const columnOf = (date: Date) => LEAD + (date.getTime() - first) / perColumn;

  const profile = Array.from({ length: columns }, (_, column) => {
    const now = first + (column - LEAD) * perColumn;
    const warmth = times.reduce(
      (total, time) => total + warmthAfter((now - time) / DAY),
      0,
    );
    return 1 - Math.exp(-0.8 * warmth);
  });
  return { profile, columnOf, quarters: quartersBetween(first, last) };
}

function warmthAfter(days: number): number {
  return days < 0
    ? Math.exp(days / KINDLING_DAYS)
    : Math.exp(-days / COOLING_DAYS);
}

function quartersBetween(first: number, last: number): Date[] {
  const start = new Date(first);
  const quarter = Math.floor(start.getUTCMonth() / 3);
  const nth = (n: number) =>
    new Date(Date.UTC(start.getUTCFullYear(), (quarter + n) * 3, 1));
  const quarters: Date[] = [];
  for (let n = 1; nth(n).getTime() <= last; n++) quarters.push(nth(n));
  return quarters;
}
