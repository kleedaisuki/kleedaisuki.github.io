import {
  advance,
  createHearth,
  type Fuel,
  type Hearth,
  type HearthTone,
  isCalm,
  SETTLE,
  stoke,
  toneAt,
  tones,
} from "./hearth";
import { CELL } from "./raster";

const FRAME = 1000 / 30;
const MAX_RATIO = 2;
/** Farthest a touch acts from the grid, so strokes outside the canvas stay cheap. */
const REACH = 12;

type Palette = Record<HearthTone, string>;

function readPalette(canvas: HTMLCanvasElement): Palette {
  const style = getComputedStyle(canvas);
  const entries = tones.map((tone) => [
    tone,
    style.getPropertyValue(`--hearth-${tone}`).trim(),
  ]);
  return Object.fromEntries(entries) as Palette;
}

/** Wires a hearth to a canvas. Frames run only while something burns down and the canvas is visible. */
export class HearthStage {
  private readonly hearth: Hearth;
  private readonly context: CanvasRenderingContext2D;
  private palette: Palette;
  private visible = true;
  private request = 0;
  private last = 0;
  private burning = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    fuel: Fuel,
    columns: number,
    rows: number,
  ) {
    this.hearth = createHearth(fuel, columns, rows);
    this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.palette = readPalette(canvas);
    new ResizeObserver(() => this.measure()).observe(canvas);
    new MutationObserver(() => this.measure()).observe(
      document.documentElement,
      { attributeFilter: ["data-moe-theme"] },
    );
    new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      this.wake();
    }).observe(canvas);
    this.measure();
  }

  /** Stoke at viewport coordinates. */
  stokeAt(clientX: number, clientY: number, power: number): void {
    const box = this.canvas.getBoundingClientRect();
    const { columns, rows } = this.hearth;
    const x = ((clientX - box.left) / box.width) * columns;
    const y = ((clientY - box.top) / box.height) * rows;
    if (y < -REACH || y > rows + REACH) return;
    this.stokeCell(x, y, power);
  }

  stokeCell(x: number, y: number, power: number): void {
    stoke(this.hearth, x, y, power);
    this.burning = SETTLE;
    this.wake();
  }

  private measure(): void {
    const ratio = Math.min(devicePixelRatio, MAX_RATIO);
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio);
    this.palette = readPalette(this.canvas);
    this.paint();
  }

  private paint(): void {
    const { hearth } = this;
    const context = this.context;
    const palette = this.palette;
    const { width, height } = this.canvas;
    const unit = width / hearth.columns;
    const side = Math.max(1, Math.round(unit * CELL));
    const inset = (unit - side) / 2;
    context.clearRect(0, 0, width, height);
    for (let row = 0; row < hearth.rows; row++) {
      for (let column = 0; column < hearth.columns; column++) {
        const tone = toneAt(hearth, column, row);
        if (!tone) continue;
        context.fillStyle = palette[tone];
        context.fillRect(
          Math.round(column * unit + inset),
          Math.round(row * unit + inset),
          side,
          side,
        );
      }
    }
  }

  private wake(): void {
    if (this.request || !this.visible || this.burning === 0) return;
    this.request = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.request = 0;
    if (now - this.last >= FRAME) {
      this.last = now;
      advance(this.hearth);
      this.paint();
      if (isCalm(this.hearth)) this.burning--;
    }
    this.wake();
  }
}
