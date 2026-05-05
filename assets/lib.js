// Pure helpers, URL helpers, and the application factory. Imported by
// app.js (the runtime entry point) and by tests. Kept free of any
// side-effects at import time so tests can drive it deterministically.

// ---------- pure helpers ----------

export const minorOf = (version) => version.split(".").slice(0, 2).join(".");

export const compareSemverDesc = (a, b) => {
  const ai = a.split(".").map((x) => parseInt(x, 10));
  const bi = b.split(".").map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(ai.length, bi.length); i++) {
    const d = (bi[i] || 0) - (ai[i] || 0);
    if (d) return d;
  }
  return 0;
};

export const groupByMinor = (versions) => {
  const tmp = new Map();
  for (const v of versions) {
    const m = minorOf(v.version);
    if (!tmp.has(m)) tmp.set(m, []);
    tmp.get(m).push(v);
  }
  for (const list of tmp.values()) {
    list.sort((a, b) => compareSemverDesc(a.version, b.version));
  }
  const sortedKeys = [...tmp.keys()].sort(compareSemverDesc);
  const out = new Map();
  for (const k of sortedKeys) out.set(k, tmp.get(k));
  return out;
};

// Resolve a `v` value to a manifest version object.
//   "4.11.5" -> exact match (or null if absent)
//   "4.11"   -> latest patch of the 4.11 minor (or null if minor unknown)
//   anything else / null / unknown -> null (caller decides fallback)
export const resolveV = (v, manifest, minorGroups) => {
  if (!v) return null;
  if (/^\d+\.\d+\.\d+/.test(v)) {
    return manifest.versions.find((entry) => entry.version === v) || null;
  }
  if (/^\d+\.\d+$/.test(v)) {
    const list = minorGroups.get(v);
    return list && list[0] ? list[0] : null;
  }
  return null;
};

// ---------- URL helpers ----------

export const parseHash = () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { v: params.get("v"), api: params.get("api") };
};

// We keep whatever `v` form is passed (minor like "4.11" or full like
// "4.11.5") — the URL is the contract, and we never silently rewrite it.
export const setHash = (vValue, apiId) => {
  const params = new URLSearchParams();
  if (vValue) params.set("v", vValue);
  if (apiId) params.set("api", apiId);
  const next = "#" + params.toString();
  if (next !== window.location.hash) {
    history.replaceState(null, "", next);
  }
};

// ---------- application factory ----------
//
// Returns a fresh runtime instance with its own state. app.js calls this
// once on page load; tests call it after seeding the DOM and URL via jsdom.

export const createApp = () => {
  let manifest = null;
  let minorGroups = null;
  // The manifest version object currently being displayed (full, e.g.
  // "4.11.5"). Read by onApiChange to re-render without re-resolving.
  let currentVersion = null;

  const versionSelect = document.getElementById("version-select");
  const apiSelect = document.getElementById("api-select");
  const container = document.getElementById("doc-container");

  const setPlaceholder = (text, isError = false) => {
    container.innerHTML = "";
    const div = document.createElement("div");
    div.className = "placeholder" + (isError ? " error" : "");
    div.textContent = text;
    container.appendChild(div);
  };

  const setEmptyState = () => {
    document.querySelector(".selectors").style.visibility = "hidden";
    container.innerHTML = `
      <div class="empty-state">
        <h1 class="empty-state-title">No documentation loaded</h1>
        <p class="empty-state-text">
          You're looking at the source repository. The published documentation
          is served from the <code>gh-pages</code> branch via GitHub Pages.
        </p>
        <div class="empty-state-actions">
          <a class="empty-state-cta"
             href="https://gravitee-io.github.io/gravitee-apim-api-docs/">
            Open published documentation
          </a>
        </div>
      </div>
    `;
  };

  // The version selector's `value` is a minor (e.g. "4.11"), not a full
  // version. The displayed minor always renders the latest patch.
  const populateVersions = () => {
    versionSelect.innerHTML = "";
    const minors = [...minorGroups.keys()];
    const latestMinor = minors[0];
    for (const minor of minors) {
      const latestPatch = minorGroups.get(minor)[0].version;
      const opt = document.createElement("option");
      opt.value = minor;
      opt.textContent =
        minor === latestMinor
          ? `${minor} (${latestPatch}) - latest`
          : `${minor} (${latestPatch})`;
      versionSelect.appendChild(opt);
    }
  };

  const populateApis = (versionObj) => {
    apiSelect.innerHTML = "";
    if (!versionObj) return;

    const groups = new Map();
    for (const api of versionObj.apis) {
      const key = api.group || "_root";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(api);
    }

    const appendApi = (parent, api) => {
      const opt = document.createElement("option");
      opt.value = api.id;
      opt.textContent = api.label;
      parent.appendChild(opt);
    };

    if (groups.has("_root")) {
      for (const api of groups.get("_root")) appendApi(apiSelect, api);
    }
    for (const [groupName, apis] of groups) {
      if (groupName === "_root") continue;
      const og = document.createElement("optgroup");
      og.label = groupName;
      for (const api of apis) appendApi(og, api);
      apiSelect.appendChild(og);
    }
  };

  const renderApi = (versionObj, apiId) => {
    if (!versionObj) {
      setPlaceholder("Unknown version.", true);
      return;
    }
    const api =
      versionObj.apis.find((a) => a.id === apiId) || versionObj.apis[0];
    if (!api) {
      setPlaceholder("No API available for this version.", true);
      return;
    }

    const specUrl = "specs/" + api.spec;
    container.innerHTML = "";
    const el = document.createElement("elements-api");
    el.setAttribute("apiDescriptionUrl", specUrl);
    el.setAttribute("router", "hash");
    el.setAttribute("layout", "sidebar");
    el.setAttribute("hideSchemas", "false");
    el.setAttribute("hideInternal", "true");
    el.setAttribute("tryItCredentialsPolicy", "omit");
    container.appendChild(el);

    if (apiSelect.value !== api.id) apiSelect.value = api.id;
  };

  // Picking a different version always writes the minor in the hash, since
  // that's what the selector exposes. Any explicit-patch context
  // (#v=4.10.5) is intentionally lost — the user asked for a different
  // version via the dropdown.
  const onVersionChange = () => {
    const minor = versionSelect.value;
    const newVersion = minorGroups.get(minor)?.[0];
    if (!newVersion) return;
    currentVersion = newVersion;

    const previousApiId = apiSelect.value;
    populateApis(newVersion);
    const apiId =
      newVersion.apis.find((a) => a.id === previousApiId)?.id ||
      apiSelect.options[0]?.value;
    if (apiId) apiSelect.value = apiId;

    renderApi(newVersion, apiId);
    setHash(minor, apiId);
  };

  // Picking a different API preserves whatever `v` is currently in the URL,
  // so a deep link to a specific patch stays specific.
  const onApiChange = () => {
    const apiId = apiSelect.value;
    const currentV = parseHash().v;
    renderApi(currentVersion, apiId);
    setHash(currentV, apiId);
  };

  const init = async () => {
    let res;
    try {
      res = await fetch("specs/versions.json", { cache: "no-cache" });
    } catch (e) {
      setPlaceholder("Failed to load specs/versions.json: " + e.message, true);
      return;
    }

    if (res.status === 404) {
      setEmptyState();
      return;
    }
    if (!res.ok) {
      setPlaceholder(
        `Failed to load specs/versions.json: HTTP ${res.status}`,
        true,
      );
      return;
    }
    try {
      manifest = await res.json();
    } catch (e) {
      setPlaceholder("Invalid specs/versions.json: " + e.message, true);
      return;
    }

    if (!manifest.versions || manifest.versions.length === 0) {
      setEmptyState();
      return;
    }

    minorGroups = groupByMinor(manifest.versions);
    populateVersions();

    const hash = parseHash();
    const resolved = resolveV(hash.v, manifest, minorGroups);

    let versionObj, vForUrl;
    if (resolved) {
      versionObj = resolved;
      vForUrl = hash.v;
    } else {
      const latestMinor = [...minorGroups.keys()][0];
      versionObj = minorGroups.get(latestMinor)[0];
      vForUrl = latestMinor;
    }

    currentVersion = versionObj;
    versionSelect.value = minorOf(versionObj.version);

    populateApis(versionObj);

    const apiId =
      (hash.api && versionObj.apis.find((a) => a.id === hash.api)?.id) ||
      apiSelect.options[0]?.value;
    if (apiId) apiSelect.value = apiId;

    renderApi(versionObj, apiId);
    setHash(vForUrl, apiId);

    versionSelect.addEventListener("change", onVersionChange);
    apiSelect.addEventListener("change", onApiChange);
  };

  return { init, onVersionChange, onApiChange };
};
