const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
/** Words of this site that the dictionary splits wrongly (it reads 内核融合 as 内 + nuclear fusion). */
const TERMS = /(内核)/;
/** Particles and suffixes that read as the tail of the word before them. */
const TAIL = /^[的了着过们之性化度率者]$/;
/** Words that read as the head of the word after them. */
const HEAD = /^[也与和及或在将]$/;
const OPENING = /[“‘（《「]$/;
const CJK = /\p{Script=Han}/u;

/**
 * Split a title where a line may break. Browsers break Chinese between any two characters, which cuts words
 * apart in large type; dictionary segments keep words whole. Text without Han characters stays in one piece,
 * since spaces already do this job there.
 */
export function phrases(text: string): string[] {
  if (!CJK.test(text)) return [text];
  const parts: string[] = [];
  let previous = "";
  for (const segment of words(text)) {
    const tails = !/[\p{L}\p{N}]/u.test(segment) || TAIL.test(segment);
    const follows = OPENING.test(previous) || HEAD.test(previous);
    const last = parts.length - 1;
    if (last >= 0 && !OPENING.test(segment) && (tails || follows)) {
      parts[last] += segment;
    } else {
      parts.push(segment);
    }
    previous = segment;
  }
  return parts;
}

function words(text: string): string[] {
  return text
    .split(TERMS)
    .flatMap((piece) =>
      TERMS.test(piece)
        ? [piece]
        : Array.from(segmenter.segment(piece), ({ segment }) => segment),
    );
}
