import { threshold } from "./dither";
import { seeded } from "./raster";

/*
 * A cellular fire with no DOM and no clock: heat is fed by fuel, rises one row per step, wanders one column,
 * and cools. The build draws a settled frame as SVG and the browser replays the same steps from the same seed,
 * so the canvas takes over without a visible change. Any frame is a valid resting picture.
 */
export const HEARTH = { columns: 160, rows: 52 } as const;
export const SETTLE = 90;

export const tones = ["glow", "flame", "honey", "hot"] as const;
export type HearthTone = (typeof tones)[number];

const COOLING = 0.074;
const FADE = 0.965;
const EMBER = 0.02;

/** Steady fuel for every cell, row-major; zero where nothing burns. */
export type Fuel = Float32Array;

export interface Hearth {
  readonly columns: number;
  readonly rows: number;
  readonly fuel: Fuel;
  readonly heat: Float32Array;
  /** Extra fuel per column that a touch adds and time removes. */
  readonly flare: Float32Array;
  readonly random: () => number;
}

export function createHearth(
  fuel: Fuel,
  columns: number,
  rows: number,
): Hearth {
  const hearth: Hearth = {
    columns,
    rows,
    fuel,
    heat: new Float32Array(columns * rows),
    flare: new Float32Array(columns),
    random: seeded(columns * rows),
  };
  for (let step = 0; step < SETTLE; step++) advance(hearth);
  return hearth;
}

/** Updating downward in place reads a next row that is not rewritten yet. */
export function advance(hearth: Hearth): void {
  const { columns, rows, fuel, heat, flare, random } = hearth;
  for (let at = 0; at < columns * rows; at++) {
    const column = at % columns;
    const drift = column + Math.floor(random() * 3) - 1;
    const source = Math.min(columns - 1, Math.max(0, drift));
    const below = heat[at - column + columns + source] ?? 0;
    const risen = below - COOLING * random();
    const fed = fuel[at] as number;
    const burning = fed && Math.min(1, fed + (flare[column] as number));
    heat[at] = Math.max(burning, risen < EMBER ? 0 : risen);
  }
  for (let column = 0; column < columns; column++) {
    const left = (flare[column] as number) * FADE;
    flare[column] = left < EMBER ? 0 : left;
  }
}

/** A touch feeds the columns beneath it and lights the cells around it. */
export function stoke(
  hearth: Hearth,
  x: number,
  y: number,
  power: number,
): void {
  const { columns, rows, heat, flare, random } = hearth;
  const reach = 2 + 7 * power;
  for (let column = 0; column < columns; column++) {
    const near = Math.exp(-(((column - x) / reach) ** 2));
    const gain = power * near * (0.3 + 0.7 * random());
    flare[column] = Math.min(1, (flare[column] as number) + gain);
  }
  for (let at = 0; at < columns * rows; at++) {
    const distance = Math.hypot(
      (at % columns) - x,
      Math.floor(at / columns) - y,
    );
    if (distance > reach) continue;
    const value = power * (1 - distance / reach) * (0.5 + random());
    heat[at] = Math.min(1, Math.max(heat[at] as number, value));
  }
}

export function isCalm({ flare }: Hearth): boolean {
  return flare.every((value) => value === 0);
}

/** Four colors only; the dither supplies what lies between. */
export function toneAt(
  { columns, heat }: Hearth,
  column: number,
  row: number,
): HearthTone | undefined {
  const value = heat[row * columns + column] as number;
  if (value === 0) return undefined;
  const level = Math.floor(value * tones.length + threshold(column, row)) - 1;
  return tones[Math.min(level, tones.length - 1)];
}

/** A pilot light: the hearth never goes out between two pieces. */
const PILOT = 0.16;

/** Feed only the bottom row with one value per column. */
export function bedFuel(profile: ArrayLike<number>, rows: number): Fuel {
  const columns = profile.length;
  const fuel = new Float32Array(columns * rows);
  for (let column = 0; column < columns; column++) {
    fuel[(rows - 1) * columns + column] = Math.max(
      PILOT,
      profile[column] as number,
    );
  }
  return fuel;
}

/** Sparse and quantized, since most cells never burn. */
export function packFuel(fuel: Fuel): string {
  const lit = [...fuel].flatMap((value, at) =>
    value ? [[at, Math.round(value * 255)]] : [],
  );
  return JSON.stringify(lit);
}

export function unpackFuel(packed: string, size: number): Fuel {
  const fuel = new Float32Array(size);
  for (const [at, value] of JSON.parse(packed) as [number, number][]) {
    fuel[at] = value / 255;
  }
  return fuel;
}

/** Burn the upper outline of a shape, which leaves the shape itself legible below its flames. */
export function crestFuel(
  lit: (column: number, row: number) => boolean,
  columns: number,
  rows: number,
): Fuel {
  const fuel = new Float32Array(columns * rows);
  for (let column = 0; column < columns; column++) {
    let row = 0;
    while (row < rows && !lit(column, row)) row++;
    if (row < rows) fuel[row * columns + column] = 1;
  }
  return fuel;
}
