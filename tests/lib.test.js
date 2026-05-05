import { describe, it, expect, beforeEach } from "vitest";
import {
  minorOf,
  compareSemverDesc,
  groupByMinor,
  resolveV,
  parseHash,
  setHash,
} from "../assets/lib.js";

describe("minorOf", () => {
  it("extracts minor from full version", () => {
    expect(minorOf("4.11.5")).toBe("4.11");
  });

  it("returns minor unchanged when given a minor", () => {
    expect(minorOf("4.11")).toBe("4.11");
  });

  it("handles two-digit minor", () => {
    expect(minorOf("4.10.13")).toBe("4.10");
  });
});

describe("compareSemverDesc", () => {
  it("places newer minor first", () => {
    expect(compareSemverDesc("4.11", "4.10")).toBeLessThan(0);
  });

  // The classic string-sort pitfall: "4.10" alphabetical-sorts BEFORE "4.9",
  // so we have to compare numerically.
  it("places 4.10 after 4.9 numerically", () => {
    expect(compareSemverDesc("4.10", "4.9")).toBeLessThan(0);
    expect(compareSemverDesc("4.10.13", "4.9.18")).toBeLessThan(0);
  });

  it("places newer patch first within a minor", () => {
    expect(compareSemverDesc("4.11.5", "4.11.3")).toBeLessThan(0);
    expect(compareSemverDesc("4.11.13", "4.11.5")).toBeLessThan(0);
  });

  it("returns 0 for equal versions", () => {
    expect(compareSemverDesc("4.11.5", "4.11.5")).toBe(0);
  });
});

describe("groupByMinor", () => {
  it("groups by minor and sorts patches descending within each group", () => {
    const groups = groupByMinor([
      { version: "4.11.3" },
      { version: "4.10.13" },
      { version: "4.11.5" },
      { version: "4.10.5" },
    ]);

    expect([...groups.keys()]).toEqual(["4.11", "4.10"]);
    expect(groups.get("4.11").map((v) => v.version)).toEqual([
      "4.11.5",
      "4.11.3",
    ]);
    expect(groups.get("4.10").map((v) => v.version)).toEqual([
      "4.10.13",
      "4.10.5",
    ]);
  });

  it("orders minor keys descending (4.11 before 4.10 before 4.9)", () => {
    const groups = groupByMinor([
      { version: "4.9.18" },
      { version: "4.11.5" },
      { version: "4.10.13" },
    ]);
    expect([...groups.keys()]).toEqual(["4.11", "4.10", "4.9"]);
  });
});

describe("resolveV", () => {
  const manifest = {
    versions: [
      { version: "4.11.5" },
      { version: "4.11.3" },
      { version: "4.10.13" },
    ],
  };
  let groups;

  beforeEach(() => {
    groups = groupByMinor(manifest.versions);
  });

  it("resolves an exact full version", () => {
    expect(resolveV("4.11.3", manifest, groups)?.version).toBe("4.11.3");
  });

  it("resolves a minor to its latest patch", () => {
    expect(resolveV("4.11", manifest, groups)?.version).toBe("4.11.5");
    expect(resolveV("4.10", manifest, groups)?.version).toBe("4.10.13");
  });

  it("returns null for an unknown minor", () => {
    expect(resolveV("4.99", manifest, groups)).toBeNull();
  });

  it("returns null for an unknown full version", () => {
    expect(resolveV("4.11.99", manifest, groups)).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(resolveV(null, manifest, groups)).toBeNull();
    expect(resolveV("", manifest, groups)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(resolveV("not-a-version", manifest, groups)).toBeNull();
    expect(resolveV("4", manifest, groups)).toBeNull();
  });
});

describe("parseHash", () => {
  beforeEach(() => {
    history.replaceState(null, "", window.location.pathname);
  });

  it("returns null fields when hash is empty", () => {
    expect(parseHash()).toEqual({ v: null, api: null });
  });

  it("parses v and api from a #v=...&api=... hash", () => {
    history.replaceState(null, "", "#v=4.11&api=portal");
    expect(parseHash()).toEqual({ v: "4.11", api: "portal" });
  });

  it("handles a hash with only v", () => {
    history.replaceState(null, "", "#v=4.11.5");
    expect(parseHash()).toEqual({ v: "4.11.5", api: null });
  });

  it("handles a hash with only api", () => {
    history.replaceState(null, "", "#api=portal");
    expect(parseHash()).toEqual({ v: null, api: "portal" });
  });
});

describe("setHash", () => {
  beforeEach(() => {
    history.replaceState(null, "", window.location.pathname);
  });

  it("writes both v and api into the hash", () => {
    setHash("4.11", "portal");
    expect(window.location.hash).toBe("#v=4.11&api=portal");
  });

  it("omits empty values", () => {
    setHash("4.11", null);
    expect(window.location.hash).toBe("#v=4.11");
  });

  it("does nothing when the hash is already correct", () => {
    history.replaceState(null, "", "#v=4.11&api=portal");
    setHash("4.11", "portal");
    expect(window.location.hash).toBe("#v=4.11&api=portal");
  });
});
