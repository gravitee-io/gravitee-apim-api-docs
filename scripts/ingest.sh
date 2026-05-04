#!/usr/bin/env bash
#
# Ingest one APIM version into specs/<version>/ by extracting OpenAPI files
# from published Maven jars (no source checkout, no Maven build of APIM).
#
# Usage: scripts/ingest.sh <version>
#   e.g. scripts/ingest.sh 4.11.5
#
# Pipeline overview:
#   1. Download 4 published jars from Maven (Gravitee Nexus / Maven Central)
#      via `mvn dependency:copy` into a tmp dir.
#   2. Unzip the OpenAPI yaml files we care about into specs/<version>/.
#   3. Re-generate specs/versions.json so the static site picks up this version.
#

# Strict mode:
#   -e  : exit on any command failure
#   -u  : fail on unset variable
#   -o pipefail : a pipe fails if any stage fails (not just the last)
set -euo pipefail

# --- 1. Argument parsing ---------------------------------------------------

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 2
fi

VERSION="$1"

# Resolve the repo root from the script location, so the script works whether
# you call it as ./scripts/ingest.sh or from anywhere else.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPECS_DIR="$ROOT/specs"
DEST="$SPECS_DIR/$VERSION"           # where this version's yaml will land
MANIFEST="$SPECS_DIR/versions.json"  # the manifest read by the static site

# --- 2. Maven coordinates of the 4 jars we need ---------------------------
#
# Each jar embeds its OpenAPI yaml at build time, so we don't need APIM's
# source code to extract them. groupId:artifactId pairs:
#
declare -a MODULES=(
  "io.gravitee.apim.rest.api.automation:gravitee-apim-rest-api-automation-rest"
  "io.gravitee.apim.rest.api.portal:gravitee-apim-rest-api-portal-rest"
  "io.gravitee.apim.rest.api.management:gravitee-apim-rest-api-management-rest"
  "io.gravitee.apim.rest.api.management.v2:gravitee-apim-rest-api-management-v2-rest"
)

# Temporary directory for the downloaded jars. The trap ensures it is wiped
# whether the script succeeds, fails, or is interrupted.
TMP="$(mktemp -d -t gravitee-apim-docs-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- 3. Download a jar via Maven ------------------------------------------
#
# `mvn dependency:copy` resolves an artifact through the locally configured
# Maven repos (so it picks up the Gravitee Nexus from your settings.xml) and
# drops the jar into outputDirectory. We don't need a pom.xml — the goal can
# be invoked standalone.
#
# Flags:
#   -B               batch mode (no interactive prompts, cleaner CI logs)
#   -q               quiet (only show errors)
#   -Dartifact=g:a:v:jar       what to fetch
#   -DoutputDirectory=$TMP     where to drop it
#   -Dmdep.stripVersion=false  keep "...-<version>.jar" in the filename so
#                              we can predict the path below
fetch_jar() {
  local g=$1 a=$2
  echo "  [fetch] $g:$a:$VERSION"
  mvn -B -q dependency:copy \
    -Dartifact="${g}:${a}:${VERSION}:jar" \
    -DoutputDirectory="$TMP" \
    -Dmdep.stripVersion=false
}

# --- 4. Prepare the destination -------------------------------------------

echo "[ingest] version $VERSION"

# Wipe any previous content for this version so an ingest is idempotent
# (no leftover files from a previous run).
rm -rf "$DEST"
mkdir -p "$DEST/management-v2"

# Loop over MODULES and download each jar. The `IFS=':' read` splits the
# "groupId:artifactId" string into two variables.
for entry in "${MODULES[@]}"; do
  IFS=':' read -r g a <<<"$entry"
  fetch_jar "$g" "$a"
done

# --- 5. Extract the yaml files from each jar ------------------------------
#
# Predicted jar paths in $TMP (Maven names them <artifactId>-<version>.jar
# because we passed -Dmdep.stripVersion=false above).
JAR_AUTO="$TMP/gravitee-apim-rest-api-automation-rest-$VERSION.jar"
JAR_PORTAL="$TMP/gravitee-apim-rest-api-portal-rest-$VERSION.jar"
JAR_MGMT="$TMP/gravitee-apim-rest-api-management-rest-$VERSION.jar"
JAR_V2="$TMP/gravitee-apim-rest-api-management-v2-rest-$VERSION.jar"

# `unzip -j` flattens directories (we don't want jar internals on disk).
# `-o` overwrites without prompting. We rename each file to a stable name
# decoupled from APIM's internal naming (open-api.yaml → automation.yaml etc.).
echo "[extract] automation, portal, management"
unzip -j -o "$JAR_AUTO"   "open-api.yaml"        -d "$DEST" >/dev/null
mv "$DEST/open-api.yaml"        "$DEST/automation.yaml"

unzip -j -o "$JAR_PORTAL" "portal-openapi.yaml"  -d "$DEST" >/dev/null
mv "$DEST/portal-openapi.yaml"  "$DEST/portal.yaml"

unzip -j -o "$JAR_MGMT"   "console-openapi.yaml" -d "$DEST" >/dev/null
mv "$DEST/console-openapi.yaml" "$DEST/management.yaml"

# Management v2 ships several yaml files under openapi/, one per domain
# (apis, plugins, users, ...). We extract them all, then drop the deprecated
# ones — those should not appear in the docs site.
echo "[extract] management-v2 (excluding *-deprecated.yaml)"
unzip -j -o "$JAR_V2" "openapi/openapi-*.yaml" -d "$DEST/management-v2" >/dev/null
find "$DEST/management-v2" -name "openapi-*-deprecated.yaml" -delete

# --- 6. Update specs/versions.json ----------------------------------------
#
# This is the single source of truth read by the front-end (assets/app.js).
# Format:
#   { "latest": "<x.y.z>",
#     "versions": [ { "version", "ingestedAt", "apis": [ {id,label,spec,group?} ] } ] }
#
# We embed a Python here-document because:
#   - it's easier to read than a tower of jq/sed,
#   - python3 is available out of the box on macOS and Linux runners,
#   - we need to scan the destination directory and build entries dynamically
#     (the management-v2 file list changes between APIM versions).
#
# Logic:
#   1. Build the apis array for THIS version by scanning $DEST.
#   2. Load the existing manifest, drop any prior entry for this version.
#   3. Append the new entry, sort versions semver-style, set "latest".
#   4. Write the manifest back.
echo "[manifest] update $MANIFEST"
python3 - "$MANIFEST" "$VERSION" "$DEST" <<'PY'
import json, os, re, sys
from datetime import date

manifest_path, version, dest = sys.argv[1:]

# Pretty-print a management-v2 file name into a human label.
# "openapi-api-products.yaml" -> "API Products"
def label_from(filename):
    base = re.sub(r'^openapi-', '', filename)
    base = re.sub(r'\.yaml$', '', base)
    parts = [p.capitalize() for p in base.split('-')]
    s = ' '.join(parts)
    # Acronym fixes (Title-case mangles them).
    s = s.replace('Apis', 'APIs').replace('Ui', 'UI').replace('Api ', 'API ')
    return s

apis = []

# The 3 "fixed" APIs always live at the same place when present.
fixed = [
    ('automation.yaml', 'Automation', 'automation'),
    ('portal.yaml',     'Portal',     'portal'),
    ('management.yaml', 'Management (v1)', 'management'),
]
for fname, label, aid in fixed:
    if os.path.exists(os.path.join(dest, fname)):
        apis.append({'id': aid, 'label': label, 'spec': f'{version}/{fname}'})

# management-v2: discover whatever yaml files were extracted (the set evolves
# between APIM versions, so we don't hardcode it).
v2_dir = os.path.join(dest, 'management-v2')
if os.path.isdir(v2_dir):
    for fname in sorted(os.listdir(v2_dir)):
        if not fname.endswith('.yaml') or fname.endswith('-deprecated.yaml'):
            continue
        slug = re.sub(r'^openapi-|\.yaml$', '', fname)
        apis.append({
            'id': f'mgmt-v2-{slug}',
            'label': label_from(fname),
            'spec': f'{version}/management-v2/{fname}',
            'group': 'Management v2',  # used by the front-end to render an <optgroup>
        })

# Load existing manifest (may be empty on first run).
with open(manifest_path) as f:
    manifest = json.load(f)

manifest.setdefault('versions', [])

# Idempotency: drop any existing entry for this version before appending.
manifest['versions'] = [v for v in manifest['versions'] if v.get('version') != version]
manifest['versions'].append({
    'version': version,
    'ingestedAt': date.today().isoformat(),
    'apis': apis,
})

# Sort by (major, minor, patch) so "4.10.13" comes after "4.9.18" — string sort
# would put 4.10 before 4.2.
def vkey(v):
    parts = re.split(r'[.\-+]', v)
    return tuple(int(p) if p.isdigit() else 0 for p in parts[:3])

manifest['versions'].sort(key=lambda v: vkey(v['version']))
manifest['latest'] = manifest['versions'][-1]['version'] if manifest['versions'] else None

# Write back with stable formatting (indent=2 + trailing newline => clean diffs).
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')

print(f"  -> {len(apis)} APIs registered for {version}")
PY

echo "[done] $VERSION ingested"
