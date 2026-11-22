/** A 5×7 bitmap for the digits and punctuation that pixel headings use. */
const glyphs: Record<string, readonly string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

export interface Bitmap {
  columns: number;
  rows: number;
  lit: (column: number, row: number) => boolean;
}

/** Enlarge a bitmap and place it on a larger grid. */
export function placed(
  { lit }: Bitmap,
  frame: { left: number; top: number; scale: number },
): Bitmap["lit"] {
  return (column, row) =>
    lit(
      Math.floor((column - frame.left) / frame.scale),
      Math.floor((row - frame.top) / frame.scale),
    );
}

/** Set a number in the bitmap, one blank column between digits. */
export function pixelNumber(value: number): Bitmap {
  const lines = Array.from({ length: 7 }, (_, row) =>
    [...String(value)]
      .map((digit) => (glyphs[digit] as readonly string[])[row])
      .join("0"),
  );
  return {
    columns: (lines[0] as string).length,
    rows: 7,
    lit: (column, row) => lines[row]?.[column] === "1",
  };
}
