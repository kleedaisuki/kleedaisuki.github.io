import { describe, expect, it } from "vitest";
import { phrases } from "./phrases";

describe("phrases", () => {
  it.each([
    "为记忆付费：大语言模型上下文压缩的价格几何与更新控制",
    "评学校“AI实践课”",
    "C++ 中的 Concept：把代数证明交还给编译器",
    "Plain English title",
  ])("keeps every character of %s", (text) => {
    expect(phrases(text).join("")).toBe(text);
  });

  it("never starts a line with punctuation or a particle", () => {
    const parts = phrases(
      "刻苦被发明为能力之后：封闭条件下的局部最优解，以及更多。",
    );
    expect(parts.some((part) => /^[：，。的]/.test(part))).toBe(false);
  });

  it("keeps a conjunction with what follows and the terms of this site whole", () => {
    const parts = phrases("CUDA 的内核融合与数据移动，也收好作品");
    expect(parts.some((part) => /[与也]$/.test(part))).toBe(false);
    expect(parts.some((part) => /^核/.test(part))).toBe(false);
  });

  it("leaves text without Han characters whole", () => {
    expect(phrases("Before MPI: Locality")).toEqual(["Before MPI: Locality"]);
  });
});
