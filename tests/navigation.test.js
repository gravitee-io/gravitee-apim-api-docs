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
    <div class="brand">
      <span class="brand-name">Gravitee APIM</span>
      <span class="brand-sub">API Documentation</span>
    </div>
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
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });

  it("selects the first API of that version", async () => {
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("automation");
    expect(window.location.search).toMatch(/api=automation/);
  });
});

describe("init: URL has ?v=<minor>", () => {
  it("selects that minor and renders its latest patch", async () => {
    history.replaceState(null, "", "?v=4.10");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.10");
    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
  });

  it("falls back to latest minor when the requested minor is unknown", async () => {
    history.replaceState(null, "", "?v=4.99");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("init: URL has ?v=<full>", () => {
  it("preserves the explicit patch in the URL", async () => {
    history.replaceState(null, "", "?v=4.11.3");
    const app = createApp();
    await app.init();
    expect(window.location.search).toMatch(/v=4\.11\.3/);
  });

  it("still puts the selector on the corresponding minor", async () => {
    history.replaceState(null, "", "?v=4.11.3");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
  });

  it("falls back to the same minor when the explicit patch is unknown", async () => {
    // Asking for 4.10.99 should land on 4.10's latest patch (4.10.13)
    // rather than jumping to the latest minor altogether — keeps the
    // user in the version line they asked for.
    history.replaceState(null, "", "?v=4.10.99");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.10");
    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
  });

  it("rewrites the URL to the minor when the explicit patch is unknown", async () => {
    history.replaceState(null, "", "?v=4.10.99");
    const app = createApp();
    await app.init();
    // The URL form is rewritten to the minor — the requested patch was
    // dropped because it isn't valid, but the user's chosen minor is kept.
    expect(window.location.search).not.toMatch(/4\.10\.99/);
    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
  });

  it("falls back to latest minor when both the patch and the minor are unknown", async () => {
    history.replaceState(null, "", "?v=4.99.0");
    const app = createApp();
    await app.init();
    expect(versionSelect().value).toBe("4.11");
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("init: URL has ?v=...&api=...", () => {
  it("honors the requested API when it exists", async () => {
    history.replaceState(null, "", "?v=4.10&api=portal");
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("portal");
    expect(window.location.search).toMatch(/api=portal/);
  });

  it("falls back to the first API when the requested API doesn't exist", async () => {
    history.replaceState(null, "", "?v=4.9&api=portal");
    const app = createApp();
    await app.init();
    expect(apiSelect().value).toBe("automation");
  });
});

describe("init: legacy hash URL is migrated", () => {
  it("rewrites #v=4.10&api=portal to ?v=4.10&api=portal", async () => {
    history.replaceState(null, "", "#v=4.10&api=portal");
    const app = createApp();
    await app.init();
    expect(window.location.hash).toBe("");
    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
    expect(window.location.search).toMatch(/api=portal/);
    expect(versionSelect().value).toBe("4.10");
    expect(apiSelect().value).toBe("portal");
  });

  it("preserves an Elements route hash (#/operations/...)", async () => {
    history.replaceState(null, "", "#/operations/getApi");
    const app = createApp();
    await app.init();
    // Hash untouched, query has the latest defaults.
    expect(window.location.hash).toBe("#/operations/getApi");
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("onVersionChange", () => {
  it("writes the selected minor into the URL", async () => {
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
  });

  it("'falls back' from a full-version URL to a minor-shaped URL", async () => {
    history.replaceState(null, "", "?v=4.11.3");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(window.location.search).not.toMatch(/4\.11/);
    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
  });

  it("keeps the same API across versions when it still exists", async () => {
    history.replaceState(null, "", "?v=4.11&api=portal");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(apiSelect().value).toBe("portal");
    expect(window.location.search).toMatch(/api=portal/);
  });

  it("picks the first API when the previous one doesn't exist in the new version", async () => {
    history.replaceState(null, "", "?v=4.11&api=portal");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.9";
    app.onVersionChange();

    expect(apiSelect().value).toBe("automation");
  });

  it("preserves the URL hash so Elements' navigation survives a version switch", async () => {
    history.replaceState(
      null,
      "",
      window.location.pathname + "?v=4.11#/operations/getApi",
    );
    const app = createApp();
    await app.init();

    versionSelect().value = "4.10";
    app.onVersionChange();

    expect(window.location.hash).toBe("#/operations/getApi");
  });
});

describe("goHome", () => {
  it("resets to latest minor and its first API", async () => {
    history.replaceState(null, "", "?v=4.10&api=portal");
    const app = createApp();
    await app.init();

    app.goHome();

    expect(versionSelect().value).toBe("4.11");
    expect(apiSelect().value).toBe("automation");
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
    expect(window.location.search).toMatch(/api=automation/);
  });

  it("resets even when the URL had an exact patch", async () => {
    history.replaceState(null, "", "?v=4.11.3");
    const app = createApp();
    await app.init();

    app.goHome();

    // The exact patch is dropped, URL is back to the minor form.
    expect(window.location.search).not.toMatch(/4\.11\.3/);
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });

  it("is wired to a click on the .brand element", async () => {
    history.replaceState(null, "", "?v=4.10&api=portal");
    const app = createApp();
    await app.init();

    document.querySelector(".brand").click();

    expect(versionSelect().value).toBe("4.11");
    expect(window.location.search).toMatch(/v=4\.11(?!\.)/);
  });
});

describe("onApiChange", () => {
  it("preserves the v param exactly as it appears in the URL", async () => {
    history.replaceState(null, "", "?v=4.11.3&api=automation");
    const app = createApp();
    await app.init();

    apiSelect().value = "portal";
    app.onApiChange();

    expect(window.location.search).toMatch(/v=4\.11\.3/);
    expect(window.location.search).toMatch(/api=portal/);
  });

  it("preserves a minor-shaped v across an API change", async () => {
    history.replaceState(null, "", "?v=4.10");
    const app = createApp();
    await app.init();

    apiSelect().value = "portal";
    app.onApiChange();

    expect(window.location.search).toMatch(/v=4\.10(?!\.)/);
    expect(window.location.search).toMatch(/api=portal/);
  });
});

describe("Portal API split into one entry per portal", () => {
  // From 4.14 the manifest lists the Portal API once per portal, both
  // entries pointing to the same spec.
  const splitManifest = {
    latest: "4.14.0",
    versions: [
      {
        version: "4.14.0",
        apis: [
          { id: "automation", label: "Automation", spec: "4.14.0/automation.yaml" },
          { id: "portal-next", label: "Next Gen Portal", spec: "4.14.0/portal.yaml", portal: "next" },
          { id: "portal-classic", label: "Classic Portal", spec: "4.14.0/portal.yaml", portal: "classic" },
        ],
      },
      {
        version: "4.13.2",
        apis: [
          { id: "automation", label: "Automation", spec: "4.13.2/automation.yaml" },
          { id: "portal", label: "Portal", spec: "4.13.2/portal.yaml" },
        ],
      },
    ],
  };

  const portalSpec = {
    openapi: "3.0.0",
    info: { title: "Portal" },
    paths: {
      "/apis": { get: { operationId: "getApis", "x-gravitee-portal": "classic" } },
      "/apis/_search": { post: { operationId: "searchApis", "x-gravitee-portal": "both" } },
    },
  };

  const stubFetch = (specResponse) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "specs/versions.json"
          ? { ok: true, status: 200, json: async () => splitManifest }
          : specResponse(),
      ),
    );
  const specFound = () => ({ ok: true, status: 200, text: async () => JSON.stringify(portalSpec) });

  const renderedApi = () => document.querySelector("elements-api");
  const renderedOperationIds = async () => {
    await vi.waitFor(() => expect(renderedApi()?.hasAttribute("apiDescriptionDocument")).toBe(true));
    const spec = JSON.parse(renderedApi().getAttribute("apiDescriptionDocument"));
    return Object.values(spec.paths).flatMap((item) => Object.values(item).map((op) => op.operationId));
  };

  beforeEach(() => {
    // YAML is a superset of JSON, so JSON.parse stands in for js-yaml.
    vi.stubGlobal("jsyaml", { load: (text) => JSON.parse(text) });
  });

  it("shows only the operations of the selected portal", async () => {
    stubFetch(specFound);
    history.replaceState(null, "", "?api=portal-classic");
    const app = createApp();
    await app.init();
    expect(await renderedOperationIds()).toEqual(["getApis", "searchApis"]);

    apiSelect().value = "portal-next";
    app.onApiChange();
    await vi.waitFor(async () => expect(await renderedOperationIds()).toEqual(["searchApis"]));
  });

  it("opens the Next Gen Portal from a former portal link", async () => {
    stubFetch(specFound);
    history.replaceState(null, "", "?v=4.14&api=portal");
    await createApp().init();
    expect(apiSelect().value).toBe("portal-next");
    expect(window.location.search).toMatch(/api=portal-next/);
  });

  it("opens the Classic Portal from a link to a classic operation", async () => {
    stubFetch(specFound);
    history.replaceState(null, "", "?v=4.14&api=portal#/operations/getApis");
    await createApp().init();
    expect(await renderedOperationIds()).toEqual(["getApis", "searchApis"]);
    expect(apiSelect().value).toBe("portal-classic");
    expect(window.location.search).toMatch(/api=portal-classic/);
    expect(window.location.hash).toBe("#/operations/getApis");
  });

  it("keeps the Portal API selected when changing to a version that is not split", async () => {
    stubFetch(specFound);
    history.replaceState(null, "", "?v=4.14&api=portal-classic");
    const app = createApp();
    await app.init();

    versionSelect().value = "4.13";
    app.onVersionChange();
    expect(apiSelect().value).toBe("portal");
  });

  it("falls back to the spec URL when the Portal spec cannot be loaded", async () => {
    stubFetch(() => ({ ok: false, status: 500 }));
    history.replaceState(null, "", "?api=portal-next");
    await createApp().init();

    await vi.waitFor(() => expect(renderedApi()).not.toBeNull());
    expect(renderedApi().getAttribute("apiDescriptionUrl")).toBe("specs/4.14.0/portal.yaml");
  });

  it("keeps passing the spec URL for the other APIs", async () => {
    stubFetch(() => {
      throw new Error("only the manifest should be fetched");
    });
    history.replaceState(null, "", "?api=automation");
    await createApp().init();

    expect(renderedApi().getAttribute("apiDescriptionUrl")).toBe("specs/4.14.0/automation.yaml");
  });
});
