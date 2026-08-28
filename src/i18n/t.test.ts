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
    expect(t("home", "zh")).toBe("Atelier");
    expect(t("home", "en")).toBe("Atelier");
    expect(t("atelier", "zh")).toBe("Articrafts");
    expect(t("atelier", "en")).toBe("Articrafts");
  });
});
