/** The site's one 8×8 Bayer matrix: pixels vary in density, never in opacity. */
export const SIDE = 8;

/** Interleaving the bits of both coordinates yields the Bayer order. */
function bayerRank(column: number, row: number): number {
  let rank = 0;
  for (let bit = 0; bit < 3; bit++) {
    const y = (row >> bit) & 1;
    const x = (column >> bit) & 1;
    rank = (rank << 2) | (((x ^ y) << 1) | y);
  }
  return rank;
}

const ranks = Uint8Array.from({ length: SIDE * SIDE }, (_, index) =>
  bayerRank(index % SIDE, Math.floor(index / SIDE)),
);

/** In (0, 1) and averaging ½, so dithering preserves tone. */
export function threshold(column: number, row: number): number {
  const at = (row & (SIDE - 1)) * SIDE + (column & (SIDE - 1));
  return ((ranks[at] as number) + 0.5) / (SIDE * SIDE);
}

function maskUrl(width: number, height: number, path: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' shape-rendering='crispEdges'><path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A horizontally tiling mask that runs from sparse to dense. */
export function edgeMask(rows: number): string {
  let path = "";
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < SIDE; column++) {
      if ((row + 0.5) / rows > threshold(column, row))
        path += `M${column} ${row}h1v1h-1z`;
    }
  }
  return maskUrl(SIDE, rows, path);
}

/** A tile with `level` of its 64 pixels lit, in Bayer order. */
export function levelMask(level: number): string {
  let path = "";
  for (const [index, rank] of ranks.entries()) {
    if (rank < level)
      path += `M${index % SIDE} ${Math.floor(index / SIDE)}h1v1h-1z`;
  }
  return maskUrl(SIDE, SIDE, path);
}
