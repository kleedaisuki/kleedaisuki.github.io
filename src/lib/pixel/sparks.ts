import type { Timeline } from "./timeline";

/** Distance kept between two sparks, in hearth cells; a spark itself is two cells wide. */
const PITCH = 3;
/** Flames reach roughly this many rows per unit of fuel. */
const FLAME_ROWS = 21;
const CLEARANCE = 4;
const DRIFT = 7;
const LIFT = 16;

interface Spot {
  column: number;
  row: number;
}

/** Nearby spots, closest first; drifting sideways costs more because the column is the date. */
const offsets: readonly Spot[] = Array.from(
  { length: (2 * DRIFT + 1) * LIFT },
  (_, index) => ({
    column: (index % (2 * DRIFT + 1)) - DRIFT,
    row: -Math.floor(index / (2 * DRIFT + 1)),
  }),
).sort((left, right) => cost(left) - cost(right));

function cost({ column, row }: Spot): number {
  return 1.6 * Math.abs(column) - row;
}

/** Sparks fly just above the flame they fed, and crowd around it when days are busy. */
export function placeSparks<Piece extends { date: Date }>(
  pieces: readonly Piece[],
  { profile, columnOf }: Timeline,
  rows: number,
): (Piece & Spot)[] {
  const taken: Spot[] = [];
  return pieces.map((piece) => {
    const column = Math.round(columnOf(piece.date)) - 1;
    const height = Math.round((profile[column] ?? 0) * FLAME_ROWS);
    const home = { column, row: rows - height - CLEARANCE };
    const spot = firstFree(home, taken);
    taken.push(spot);
    return { ...piece, ...spot };
  });
}

function firstFree(home: Spot, taken: readonly Spot[]): Spot {
  for (const offset of offsets) {
    const spot = {
      column: home.column + offset.column,
      row: home.row + offset.row,
    };
    if (taken.every((other) => !touches(spot, other))) return spot;
  }
  return home;
}

function touches(left: Spot, right: Spot): boolean {
  return (
    Math.abs(left.column - right.column) < PITCH &&
    Math.abs(left.row - right.row) < PITCH
  );
}
