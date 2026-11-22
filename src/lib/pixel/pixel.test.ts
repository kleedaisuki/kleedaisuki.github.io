import { describe, expect, it } from "vitest";
import { SIDE, threshold } from "./dither";
import {
  advance,
  bedFuel,
  createHearth,
  crestFuel,
  HEARTH,
  isCalm,
  packFuel,
  stoke,
  unpackFuel,
} from "./hearth";
import { PLATE, plateOf } from "./plate";
import { tonePaths } from "./raster";
import { placeSparks } from "./sparks";
import { createTimeline } from "./timeline";
import { pixelNumber, placed } from "./type";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function plateText(slug: string): string {
  const toneAt = plateOf(slug);
  return Array.from(
    { length: PLATE * PLATE },
    (_, at) => toneAt(at % PLATE, Math.floor(at / PLATE))?.[1] ?? ".",
  ).join("");
}

describe("dither", () => {
  it("uses every level of the tile once", () => {
    const levels = Array.from({ length: SIDE * SIDE }, (_, at) =>
      threshold(at % SIDE, Math.floor(at / SIDE)),
    );
    expect(new Set(levels).size).toBe(64);
    expect(levels.reduce((a, b) => a + b) / 64).toBeCloseTo(0.5);
  });
});

describe("tonePaths", () => {
  it("draws each run of one tone as one segment", () => {
    const row = ["a", "a", undefined, "b", "a"] as const;
    expect(tonePaths(5, 1, (column) => row[column])).toEqual([
      { tone: "a", d: "M0 0h2M4 0h1" },
      { tone: "b", d: "M3 0h1" },
    ]);
  });
});

describe("plate", () => {
  it("is stable for a slug and differs between slugs", () => {
    expect(plateText("cinder")).toBe(plateText("cinder"));
    expect(plateText("cinder")).not.toBe(plateText("chronosys"));
  });

  it("keeps sand a drawing rather than a fill", () => {
    for (const slug of ["cinder", "chronosys", "a", "b", "c", "长名字"]) {
      const sand = plateText(slug).replaceAll(/[^a]/g, "").length;
      expect(sand / PLATE ** 2).toBeGreaterThan(0.08);
      expect(sand / PLATE ** 2).toBeLessThan(0.55);
    }
  });
});

describe("hearth", () => {
  const fuel = bedFuel(
    Array.from({ length: 40 }, (_, column) => column / 40),
    20,
  );

  it("replays the same frame from packed fuel, so the canvas matches the SVG", () => {
    const packed = unpackFuel(packFuel(fuel), fuel.length);
    const again = unpackFuel(packFuel(packed), fuel.length);
    expect(createHearth(again, 40, 20).heat).toEqual(
      createHearth(packed, 40, 20).heat,
    );
  });

  it("keeps heat in range and calms down after a touch", () => {
    const hearth = createHearth(fuel, 40, 20);
    stoke(hearth, 10, 15, 1);
    expect(isCalm(hearth)).toBe(false);
    for (let step = 0; step < 200; step++) advance(hearth);
    expect(isCalm(hearth)).toBe(true);
    expect(hearth.heat.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("burns only above the fuel", () => {
    const number = pixelNumber(404);
    const lit = placed(number, { left: 2, top: 10, scale: 1 });
    const crest = crestFuel(lit, 21, 20);
    const { heat } = createHearth(crest, 21, 20);
    expect(heat.slice(17 * 21).every((value) => value === 0)).toBe(true);
    expect(crest.filter(Boolean)).toHaveLength(15);
  });
});

describe("timeline and sparks", () => {
  const busy = Array.from({ length: 20 }, () => ({ date: day("2025-09-10") }));
  const pieces = [
    { date: day("2025-06-01") },
    ...busy,
    { date: day("2026-10-07") },
  ];
  const timeline = createTimeline(pieces.map(({ date }) => date));

  it("is warmest where most was published", () => {
    const peak = timeline.profile.indexOf(Math.max(...timeline.profile));
    const expected = timeline.columnOf(day("2025-09-10"));
    expect(Math.abs(peak - expected)).toBeLessThan(3);
  });

  it("marks each quarter inside the range", () => {
    expect(
      timeline.quarters.map((date) => date.toISOString().slice(0, 7)),
    ).toEqual([
      "2025-07",
      "2025-10",
      "2026-01",
      "2026-04",
      "2026-07",
      "2026-10",
    ]);
  });

  it("gives every spark its own place on the grid", () => {
    const sparks = placeSparks(pieces, timeline, HEARTH.rows);
    for (const [index, spark] of sparks.entries()) {
      expect(spark.column).toBeGreaterThanOrEqual(0);
      expect(spark.column).toBeLessThan(HEARTH.columns - 1);
      expect(spark.row).toBeGreaterThanOrEqual(0);
      for (const other of sparks.slice(index + 1)) {
        const apart = Math.max(
          Math.abs(spark.column - other.column),
          Math.abs(spark.row - other.row),
        );
        expect(apart).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("burns on a pilot light before anything is published", () => {
    const empty = createTimeline([]);
    expect(empty.quarters).toEqual([]);
    expect(empty.profile.every((value) => value === 0)).toBe(true);
  });
});
