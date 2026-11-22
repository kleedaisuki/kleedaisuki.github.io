import { threshold } from "./dither";
import { hash, seeded } from "./raster";

/*
 * Chladni figures: sand on a vibrating square plate gathers where the plate stays still. Every slug picks its
 * own modes, so each piece gets a figure that is stable across builds and needs no artwork.
 */
export const PLATE = 48;
/** Width of a line of settled sand, in cells, and the share of cells where grains still bounce. */
const GRAIN = 1.1;
const BOUNCE = 0.04;
/** Slope below which the plate counts as flat, so a saddle becomes a patch rather than a flood. */
const FLAT = 0.09;

export type PlateTone = "sand" | "spark";

interface Mode {
  n: number;
  m: number;
  weight: number;
}

/** Low modes only: higher ones have lines closer together than the grid can draw. */
const shapes = Array.from({ length: 36 }, (_, index) => ({
  n: index % 6,
  m: Math.floor(index / 6),
})).filter(({ n, m }) => n < m && m > 1 && n + m <= 5);

function modesOf(slug: string): Mode[] {
  const random = seeded(hash(slug));
  const pick = (count: number) => Math.floor(random() * count);
  const sign = random() < 0.5 ? 1 : -1;
  const first = pick(shapes.length);
  const second = (first + 1 + pick(shapes.length - 1)) % shapes.length;
  return [
    { ...(shapes[first] as (typeof shapes)[number]), weight: 1 },
    {
      ...(shapes[second] as (typeof shapes)[number]),
      weight: sign * (0.3 + 0.5 * random()),
    },
  ];
}

function displacement({ n, m, weight }: Mode, x: number, y: number): number {
  const wave = (k: number, t: number) => Math.cos(k * Math.PI * t);
  return weight * (wave(n, x) * wave(m, y) - wave(m, x) * wave(n, y));
}

export function plateOf(
  slug: string,
): (column: number, row: number) => PlateTone | undefined {
  const modes = modesOf(slug);
  const heightAt = (column: number, row: number): number => {
    const x = ((column + 0.5) / PLATE) * 2 - 1;
    const y = ((row + 0.5) / PLATE) * 2 - 1;
    return modes.reduce((total, mode) => total + displacement(mode, x, y), 0);
  };
  return (column, row) => {
    const height = heightAt(column, row);
    const slope = Math.hypot(
      heightAt(column + 0.5, row) - heightAt(column - 0.5, row),
      heightAt(column, row + 0.5) - heightAt(column, row - 0.5),
    );
    // Height over slope is the distance to the nearest still line, so every line gets the same width.
    const distance = Math.abs(height) / Math.max(slope, FLAT);
    const limit = threshold(column, row);
    if (Math.exp(-((distance / GRAIN) ** 2)) > limit) return "sand";
    return Math.abs(height) > 1 && limit < BOUNCE ? "spark" : undefined;
  };
}
