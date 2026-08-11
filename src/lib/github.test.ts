import { afterEach, describe, expect, it, vi } from "vitest";
import { getGitHubAboutData } from "./github";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getGitHubAboutData", () => {
  it("keeps the most recently pushed non-fork repositories", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ login: "klee", html_url: "https://github.com/klee" }),
      )
      .mockResolvedValueOnce(
        Response.json([
          { name: "fork", fork: true, pushed_at: "2026-01-03" },
          { name: "old", fork: false, pushed_at: "2026-01-01" },
          { name: "new", fork: false, pushed_at: "2026-01-02" },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const data = await getGitHubAboutData(1);

    expect(data.profile?.login).toBe("klee");
    expect(data.repos.map((repo) => repo.name)).toEqual(["new"]);
  });

  it("returns empty API data after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const data = await getGitHubAboutData();

    expect(data.profile).toBeNull();
    expect(data.repos).toEqual([]);
  });
});
