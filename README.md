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
./scripts/ingest.sh <version> [core-version]
# example:
./scripts/ingest.sh 4.11.5
# when the jars carry another number than the product:
./scripts/ingest.sh 4.13.4 4.13.1
```

The script downloads the four APIM REST API jars from Maven (Gravitee Nexus / Maven Central), extracts the embedded OpenAPI yaml files into `specs/<version>/`, and updates `specs/versions.json`. No APIM source checkout or local Maven build is required.

The jars belong to APIM's core reactor, which releases apart from the product from 4.13 on: the specs of product `4.13.4` may well sit in core `4.13.1`. The second argument says which number to download; the site keeps publishing under the first. Leave it out and the two are the same, which is what every version up to 4.12 does.

## APIs included

- Automation (`open-api.yaml`)
- Portal (`portal-openapi.yaml`)
- Management v1 (`console-openapi.yaml`, generated at APIM build time)
- Management v2 — one entry per domain (`openapi-apis.yaml`, `openapi-plugins.yaml`, …)

## Automated deployment (CircleCI)

Two workflows in `.circleci/config.yml`:

1. **`ingest`** — triggered by an external API call (typically from APIM's release pipeline) with a `version` parameter, and optionally a `core_version` one when the jars carry another number. Runs the ingest script, syncs the result onto `gh-pages`, and commits as `gravitee-bot`. Can also be triggered manually from the CircleCI UI. The job first polls Maven Central for up to one hour to wait for Sonatype's release to propagate; this absorbs the typical 10–30 min sync delay between an APIM release and the artifact becoming downloadable.
2. **`deploy-static`** — triggered on every push to `main`. Syncs `index.html` and `assets/` onto `gh-pages` without touching `specs/`, so UI changes ship immediately.

### Triggering an ingestion manually

From the CircleCI UI: open the docs project, "Trigger Pipeline", set parameter `version` to the target APIM version (e.g. `4.11.5`), run. Add `core_version` only if the REST API jars of that release were published under a different number.

Equivalent API call:

```bash
curl -X POST \
  https://circleci.com/api/v2/project/gh/gravitee-io/gravitee-apim-api-docs/pipeline \
  -H "Circle-Token: $CIRCLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters":{"version":"4.11.5"}}'
```
