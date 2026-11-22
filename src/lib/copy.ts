/** How long a button keeps showing the outcome. */
const HOLD = 1800;

const resting = new WeakMap<HTMLButtonElement, number>();

function sourceOf(button: HTMLButtonElement): string {
  const { copy, copyFrom } = button.dataset;
  if (copy !== undefined) return copy;
  return document.querySelector<HTMLElement>(copyFrom ?? "")?.innerText ?? "";
}

function show(
  button: HTMLButtonElement,
  state: "copied" | "failed" | undefined,
): void {
  if (state) button.dataset.state = state;
  else delete button.dataset.state;
  const status = button.querySelector("[role=status]");
  const message = {
    copied: button.dataset.copied,
    failed: button.dataset.failed,
  };
  if (status) status.textContent = state ? (message[state] ?? "") : "";
}

async function copy(button: HTMLButtonElement): Promise<void> {
  clearTimeout(resting.get(button));
  const outcome = await navigator.clipboard
    .writeText(sourceOf(button))
    .then(() => "copied" as const)
    .catch(() => "failed" as const);
  show(button, outcome);
  resting.set(
    button,
    window.setTimeout(() => show(button, undefined), HOLD),
  );
}

// Useless without a script, so the buttons stay hidden until one runs.
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy], [data-copy-from]",
)) {
  button.hidden = !navigator.clipboard;
  button.addEventListener("click", () => copy(button));
}
