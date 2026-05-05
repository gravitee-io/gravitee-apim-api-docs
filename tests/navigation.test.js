import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createApp } from "../assets/lib.js";

// A small but representative manifest covering the cases we care about:
// - multiple minors
// - multiple patches within a minor
// - an API that exists in some versions but not others (so we can test
//   what happens when changing version drops the current API)
const fakeManifest = {
  latest: "4.11.5",
  versions: [
    {
      version: "4.11.5",
      apis: [
        { id: "automation", label: "Automation", spec: "4.11.5/automation.yaml" },
        { id: "portal", label: "Portal", spec: "4.11.5/portal.yaml" },
        { id: "management", label: "Management", spec: "4.11.5/management.yaml" },
      ],
    },
    {
      version: "4.11.3",
      apis: [
        { id: "automation", label: "Automation", spec: "4.11.3/automation.yaml" },
        { id: "portal", label: "Portal", spec: "4.11.3/portal.yaml" },
      ],
    },
    {
      version: "4.10.13",
      apis: [
        { id: "automation", label: "Automation", spec: "4.10.13/automation.yaml" },
        { id: "portal", label: "Portal", spec: "4.10.13/portal.yaml" },
      ],
    },
    {
      version: "4.9.18",
      apis: [
        { id: "automation", label: "Automation", spec: "4.9.18/automation.yaml" },
        // No "portal" here — used to test cross-version API selection.
      ],
    },
  ],
};

const PAGE_HTML = `
  <header class="topbar">
    <div class="selectors">
      <label>Version <select id="version-select"></select></label>
      <label>API <select id="api-select"></select></label>
    </div>
  </header>
  <main id="doc-container">
    <div id="placeholder" class="placeholder">Loading…</div>
  </main>
`;

const versionSelect = () => document.getElementById("version-select");
const apiSelect = () => document.getElementById("api-select");

beforeEach(() => {
  document.body.innerHTML = PAGE_HTML;
  history.replaceState(null, "", window.location.pathname);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fakeManifest,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("init: URL has no v param", () => {
  it("selects the latest minor", async () => {
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
  });

  it("writes the latest minor into the URL", async () => {
    const app = createApp();
    await app.init();
    expect(window.location.hash).toMatch(/v=4\.11(?!\.)/);
  });

  it("selects the first API of that version", async () => {
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("automation");
    expect(window.location.hash).toMatch(/api=automation/);
  });
});

describe("init: URL has #v=<minor>", () => {
  it("selects that minor and renders its latest patch", async () => {
    history.replaceState(null, "", "#v=4.10");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.10");
    expect(window.location.hash).toMatch(/v=4\.10(?!\.)/);
  });

  it("falls back to latest minor when the requested minor is unknown", async () => {
    history.replaceState(null, "", "#v=4.99");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
    expect(window.location.hash).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("init: URL has #v=<full>", () => {
  it("preserves the explicit patch in the URL", async () => {
    history.replaceState(null, "", "#v=4.11.3");
    const app = createApp();
    await app.init();
    expect(window.location.hash).toMatch(/v=4\.11\.3/);
  });

  it("still puts the selector on the corresponding minor", async () => {
    history.replaceState(null, "", "#v=4.11.3");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
  });

  it("falls back to latest minor when the explicit patch is unknown", async () => {
    history.replaceState(null, "", "#v=4.11.99");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
    expect(window.location.hash).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("init: URL has #v=...&api=...", () => {
  it("honors the requested API when it exists", async () => {
    history.replaceState(null, "", "#v=4.10&api=portal");
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("portal");
    expect(window.location.hash).toMatch(/api=portal/);
  });

  it("falls back to the first API when the requested API doesn't exist", async () => {
    history.replaceState(null, "", "#v=4.9&api=portal");
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("automation");
  });
});

describe("onVersionChange", () => {
  it("writes the selected minor into the URL", async () => {
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(window.location.hash).toMatch(/v=4\.10(?!\.)/);
  });

  it("'falls back' from a full-version URL to a minor-shaped URL", async () => {
    history.replaceState(null, "", "#v=4.11.3");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(window.location.hash).not.toMatch(/4\.11/);
    expect(window.location.hash).toMatch(/v=4\.10(?!\.)/);
  });

  it("keeps the same API across versions when it still exists", async () => {
    history.replaceState(null, "", "#v=4.11&api=portal");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(apiSelect().value).toBe("portal");
    expect(window.location.hash).toMatch(/api=portal/);
  });

  it("picks the first API when the previous one doesn't exist in the new version", async () => {
    history.replaceState(null, "", "#v=4.11&api=portal");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.9";
    app.onVersionChange();

    expect(apiSelect().value).toBe("automation");
  });
});

describe("onApiChange", () => {
  it("preserves the v param exactly as it appears in the URL", async () => {
    history.replaceState(null, "", "#v=4.11.3&api=automation");
    const app = createApp();
    await app.init();

    apiSelect().value = "portal";
    app.onApiChange();

    expect(window.location.hash).toMatch(/v=4\.11\.3/);
    expect(window.location.hash).toMatch(/api=portal/);
  });

  it("preserves a minor-shaped v across an API change", async () => {
    history.replaceState(null, "", "#v=4.10");
    const app = createApp();
    await app.init();

    apiSelect().value = "portal";
    app.onApiChange();

    expect(window.location.hash).toMatch(/v=4\.10(?!\.)/);
    expect(window.location.hash).toMatch(/api=portal/);
  });
});
