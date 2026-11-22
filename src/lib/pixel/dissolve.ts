import { levelMask } from "./dither";

const LEVELS = 16;
const DURATION = 420;
const TILE = "48px 48px";

/** The new page arrives pixel by pixel in Bayer order; the matrix that draws the site also changes it. */
function frames(): Keyframe[] {
  return Array.from({ length: LEVELS }, (_, index) => ({
    maskImage: levelMask(Math.round(((index + 1) / LEVELS) * 64)),
    maskSize: TILE,
    easing: "steps(1, end)",
  }));
}

let current: ViewTransition | undefined;

/** Apply a change behind a dithered dissolve, or at once where that is unsupported or unwanted. */
export function dissolve(apply: () => void): void {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !document.startViewTransition) {
    apply();
    return;
  }
  const root = document.documentElement;
  root.dataset.dissolve = "";
  const transition = document.startViewTransition(apply);
  current = transition;
  // A transition is skipped when another one starts; the change itself still lands.
  transition.ready
    .then(() =>
      root.animate(frames(), {
        duration: DURATION,
        pseudoElement: "::view-transition-new(root)",
      }),
    )
    .catch(() => undefined);
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (current === transition) delete root.dataset.dissolve;
    });
}
