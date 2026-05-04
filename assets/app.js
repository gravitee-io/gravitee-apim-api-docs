(() => {
  const versionSelect = document.getElementById("version-select");
  const apiSelect = document.getElementById("api-select");
  const container = document.getElementById("doc-container");

  let manifest = null;

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

  const parseHash = () => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return { v: params.get("v"), api: params.get("api") };
  };

  const setHash = (version, apiId) => {
    const params = new URLSearchParams();
    if (version) params.set("v", version);
    if (apiId) params.set("api", apiId);
    const next = "#" + params.toString();
    if (next !== window.location.hash) {
      history.replaceState(null, "", next);
    }
  };

  const findVersion = (versionId) =>
    manifest.versions.find((v) => v.version === versionId);

  const populateVersions = () => {
    versionSelect.innerHTML = "";
    for (const v of manifest.versions) {
      const opt = document.createElement("option");
      opt.value = v.version;
      opt.textContent =
        v.version === manifest.latest ? `${v.version} (latest)` : v.version;
      versionSelect.appendChild(opt);
    }
  };

  const populateApis = (version) => {
    apiSelect.innerHTML = "";
    const v = findVersion(version);
    if (!v) return;

    const groups = new Map();
    for (const api of v.apis) {
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

  const renderApi = (version, apiId) => {
    const v = findVersion(version);
    if (!v) {
      setPlaceholder(`Unknown version: ${version}`, true);
      return;
    }
    const api = v.apis.find((a) => a.id === apiId) || v.apis[0];
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
    setHash(version, api.id);
  };

  const onVersionChange = () => {
    const version = versionSelect.value;
    populateApis(version);
    const firstApi = apiSelect.options[0]?.value;
    if (firstApi) renderApi(version, firstApi);
  };

  const onApiChange = () => {
    renderApi(versionSelect.value, apiSelect.value);
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
      setPlaceholder(`Failed to load specs/versions.json: HTTP ${res.status}`, true);
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

    populateVersions();

    const hash = parseHash();
    const initialVersion =
      (hash.v && findVersion(hash.v)?.version) ||
      manifest.latest ||
      manifest.versions[0].version;
    versionSelect.value = initialVersion;
    populateApis(initialVersion);

    const initialApi =
      (hash.api &&
        findVersion(initialVersion).apis.find((a) => a.id === hash.api)?.id) ||
      apiSelect.options[0]?.value;
    if (initialApi) apiSelect.value = initialApi;

    renderApi(initialVersion, initialApi);

    versionSelect.addEventListener("change", onVersionChange);
    apiSelect.addEventListener("change", onApiChange);
  };

  init();
})();
