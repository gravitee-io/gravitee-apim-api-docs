# gravitee-apim-api-docs

Static site aggregating Gravitee APIM REST API documentation across versions, rendered with [Stoplight Elements](https://stoplight.io/open-source/elements). Published via **GitHub Pages** from the `gh-pages` branch.

## Branch layout

| Branch | Contains | Role |
|---|---|---|
| `main` | `index.html`, `assets/`, `scripts/ingest.sh`, `.circleci/`, this README | Source of truth — code reviewed here. |
| `gh-pages` | `index.html`, `assets/`, `specs/versions.json`, `specs/<version>/...` | Deployable artifact served by GitHub Pages. Rebuilt automatically by the ingest CI job; do not edit by hand. |

`specs/` is intentionally absent from `main`. To preview the site locally with real data, run the ingest script (see below) or check out `gh-pages`.

## Local preview

Populate `specs/` first, then serve:

```bash
./scripts/ingest.sh 4.11.5
python3 -m http.server 8080
# open http://localhost:8080
```

## Ingest a new version

```bash
./scripts/ingest.sh <version>
# example:
./scripts/ingest.sh 4.11.5
```

The script downloads the four APIM REST API jars from Maven (Gravitee Nexus / Maven Central), extracts the embedded OpenAPI yaml files into `specs/<version>/`, and updates `specs/versions.json`. No APIM source checkout or local Maven build is required.

## APIs included

- Automation (`open-api.yaml`)
- Portal (`portal-openapi.yaml`)
- Management v1 (`console-openapi.yaml`, generated at APIM build time)
- Management v2 — one entry per domain (`openapi-apis.yaml`, `openapi-plugins.yaml`, …)

## Excluded

- Files matching `*-deprecated.yaml`
- The `kafka-explorer` module

## Automated deployment (CircleCI)

Two workflows in `.circleci/config.yml`:

1. **`ingest`** — triggered by an external API call (typically from APIM's release pipeline) with a `version` parameter. Runs the ingest script, syncs the result onto `gh-pages`, and commits as `gravitee-bot`. Can also be triggered manually from the CircleCI UI.
2. **`deploy-static`** — triggered on every push to `main`. Syncs `index.html` and `assets/` onto `gh-pages` without touching `specs/`, so UI changes ship immediately.

### Secrets to provision (in Keeper, exposed via the `cicd-orchestrator` context)

| Secret | Where it's used | What it is |
|---|---|---|
| `gravitee-bot` GitHub token | docs repo CI | PAT or fine-grained token with `contents:write` on `gravitee-io/gravitee-apim-api-docs`. Used to push to `gh-pages`. |
| CircleCI API token | APIM repo CI | Used by APIM's release pipeline to POST a pipeline trigger to the docs repo. |
| Maven `settings.xml` (optional) | docs repo CI | Only needed if a release jar is not on Maven Central and requires Gravitee Nexus auth. Currently not required for tagged releases. |

### Triggering an ingestion manually

From the CircleCI UI: open the docs project, "Trigger Pipeline", set parameter `version` to the target APIM version (e.g. `4.11.5`), run.

Equivalent API call:

```bash
curl -X POST \
  https://circleci.com/api/v2/project/gh/gravitee-io/gravitee-apim-api-docs/pipeline \
  -H "Circle-Token: $CIRCLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters":{"version":"4.11.5"}}'
```
