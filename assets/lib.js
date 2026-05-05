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
//   "4.11.5" -> exact match if it exists; otherwise the latest patch of
//               the 4.11 minor if that minor exists; otherwise null.
//   "4.11"   -> latest patch of the 4.11 minor (or null if minor unknown).
//   anything else / null / unknown -> null (caller decides fallback).
//
// The full -> minor fallback keeps the user "in the same minor" when they
// follow a deep link to a patch that no longer exists in the manifest
// (e.g. an obsolete 4.8.20 link still lands on the latest 4.8 patch).
export const resolveV = (v, manifest, minorGroups) => {
  if (!v) return null;
  if (/^\d+\.\d+\.\d+/.test(v)) {
    const exact = manifest.versions.find((entry) => entry.version === v);
    if (exact) return exact;
    const list = minorGroups.get(minorOf(v));
    return list && list[0] ? list[0] : null;
  }
  if (/^\d+\.\d+$/.test(v)) {
    const list = minorGroups.get(v);
    return list && list[0] ? list[0] : null;
  }
  return null;
};

// ---------- URL helpers ----------
//
// Our state (selected version + API) lives in classic query parameters
// (?v=4.11&api=portal). The URL hash is left for Stoplight Elements'
// own router (which uses fragments like #/operations/getApi for in-spec
// navigation).

export const parseSearch = () => {
  const params = new URLSearchParams(window.location.search);
  return { v: params.get("v"), api: params.get("api") };
};

// We keep whatever `v` form is passed (minor like "4.11" or full like
// "4.11.5") — the URL is the contract, and we never silently rewrite it.
// The hash is preserved so Elements' navigation state survives.
export const setSearch = (vValue, apiId) => {
  const params = new URLSearchParams();
  if (vValue) params.set("v", vValue);
  if (apiId) params.set("api", apiId);
  const newSearch = params.toString() ? "?" + params.toString() : "";
  if (newSearch !== window.location.search) {
    history.replaceState(
      null,
      "",
      window.location.pathname + newSearch + window.location.hash,
    );
  }
};

// Backward compat for legacy URLs that put our state in the hash
// (#v=4.11&api=portal). If we detect that shape — anything that isn't an
// Elements route (those start with '/') and contains v= or api= —
// migrate it to query params and clear the hash. Returns true when a
// migration happened.
export const migrateLegacyHash = () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash || hash.startsWith("/")) return false;
  const params = new URLSearchParams(hash);
  if (!params.has("v") && !params.has("api")) return false;
  history.replaceState(
    null,
    "",
    window.location.pathname + "?" + params.toString(),
  );
  return true;
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

  // Picking a different version always writes the minor in `?v`, since
  // that's what the selector exposes. Any explicit-patch context
  // (?v=4.10.5) is intentionally lost — the user asked for a different
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
    setSearch(minor, apiId);
  };

  // Picking a different API preserves whatever `v` is currently in the URL,
  // so a deep link to a specific patch stays specific.
  const onApiChange = () => {
    const apiId = apiSelect.value;
    const currentV = parseSearch().v;
    renderApi(currentVersion, apiId);
    setSearch(currentV, apiId);
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

    migrateLegacyHash();
    const search = parseSearch();
    const resolved = resolveV(search.v, manifest, minorGroups);

    let versionObj, vForUrl;
    if (resolved) {
      versionObj = resolved;
      // Preserve the URL form the user came in with when it points at the
      // resolved version exactly (full match) or at its minor (sticky
      // minor link). Otherwise we got here via a full -> minor fallback
      // (e.g. ?v=4.8.20 resolved to the latest 4.8 patch), so rewrite the
      // URL to the minor form to make the sticky link explicit.
      const resolvedMinor = minorOf(resolved.version);
      vForUrl =
        search.v === resolved.version || search.v === resolvedMinor
          ? search.v
          : resolvedMinor;
    } else {
      const latestMinor = [...minorGroups.keys()][0];
      versionObj = minorGroups.get(latestMinor)[0];
      vForUrl = latestMinor;
    }

    currentVersion = versionObj;
    versionSelect.value = minorOf(versionObj.version);

    populateApis(versionObj);

    const apiId =
      (search.api && versionObj.apis.find((a) => a.id === search.api)?.id) ||
      apiSelect.options[0]?.value;
    if (apiId) apiSelect.value = apiId;

    renderApi(versionObj, apiId);
    setSearch(vForUrl, apiId);

    versionSelect.addEventListener("change", onVersionChange);
    apiSelect.addEventListener("change", onApiChange);
  };

  return { init, onVersionChange, onApiChange };
};
