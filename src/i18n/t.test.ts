import { describe, expect, it } from "vitest";
import { asLocale, t } from "./t";

describe("asLocale", () => {
  it.each([
    ["en", "en"],
    ["en-US", "en"],
    ["zh-CN", "zh"],
    [undefined, "zh"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(asLocale(input)).toBe(expected);
  });
});

describe("t", () => {
  it("returns translated navigation labels", () => {
    expect(t("home", "zh")).toBe("首页");
    expect(t("home", "en")).toBe("Home");
  });
});
