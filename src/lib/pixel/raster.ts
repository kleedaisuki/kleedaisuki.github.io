/** Filled share of a cell; the rest is the gap between pixels. */
export const CELL = 0.86;

/** Deterministic randomness, so every build draws the same picture. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** FNV-1a. */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const character of text) {
    value = Math.imul(value ^ (character.codePointAt(0) as number), 0x01000193);
  }
  return value >>> 0;
}

/** Stroke settings that turn a run of cells back into separate squares. */
export const strokeRun = {
  "stroke-width": CELL,
  "stroke-dasharray": `${CELL} ${(1 - CELL).toFixed(2)}`,
} as const;

/**
 * One path per tone, each horizontal run a single segment. Dashes restart at every subpath, so `strokeRun`
 * draws a run as individual pixels at a fraction of the bytes that one rectangle per pixel would take.
 */
export function tonePaths<Tone extends string>(
  columns: number,
  rows: number,
  toneAt: (column: number, row: number) => Tone | undefined,
): { tone: Tone; d: string }[] {
  const paths = new Map<Tone, string>();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; ) {
      const tone = toneAt(column, row);
      const start = column;
      do column++;
      while (column < columns && toneAt(column, row) === tone);
      if (tone === undefined) continue;
      const run = `M${start} ${row}h${column - start}`;
      paths.set(tone, (paths.get(tone) ?? "") + run);
    }
  }
  return [...paths].map(([tone, d]) => ({ tone, d }));
}
