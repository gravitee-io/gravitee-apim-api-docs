#!/usr/bin/env bash
#
# Point Maven at the Azure Artifacts feed, so ingest.sh can resolve the APIM jars.
#
# Usage: scripts/setup-maven-feed.sh
#
# APIM stopped publishing to Maven Central, and the feed answers 401 without
# credentials, so `mvn dependency:copy` needs both a repository and a server entry.
#
# Everything comes from the environment, so this runs anywhere. Two ways in:
#
#   AZURE_ARTIFACTS_PAT=<token> scripts/setup-maven-feed.sh
#       the short way, and the one to use by hand with a personal access token.
#
#   AZURE_CLIENT_ID=… AZURE_CLIENT_SECRET=… AZURE_TENANT=… scripts/setup-maven-feed.sh
#       exchanges the service principal's secret for a token, valid one hour. This is
#       what CI does: Gravitee.io Bot is an Entra service principal, and a service
#       principal cannot hold a personal access token. The job reads the three values
#       from Keeper and hands them over — fetching secrets is the pipeline's job, not
#       this script's.
#
# In CI the resulting token is appended to $BASH_ENV so later steps see it. It is never
# echoed: an `echo` of a secret ends up in a public build log.
set -euo pipefail

SETTINGS="${HOME}/.m2/settings.xml"
FEED_URL="${FEED_URL:-https://pkgs.dev.azure.com/graviteeio/packages/_packaging/gravitee/maven/v1}"

if [[ -z "${AZURE_ARTIFACTS_PAT:-}" ]]; then
  if [[ -z "${AZURE_CLIENT_ID:-}" || -z "${AZURE_CLIENT_SECRET:-}" || -z "${AZURE_TENANT:-}" ]]; then
    echo "ERROR: set AZURE_ARTIFACTS_PAT, or the three AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT." >&2
    exit 1
  fi
  echo "[feed] no AZURE_ARTIFACTS_PAT, exchanging the service principal secret for one"

  # --data-urlencode rather than -d, which sends its argument verbatim: a client secret
  # holding a +, & or = is mangled by the form decoder on the other side, and Entra
  # secrets routinely hold one.
  #
  # 499b84ac-1321-427f-aa17-267ca6975798 is the application ID of Azure DevOps as a
  # whole — Artifacts has none of its own. What the token may do comes from the roles
  # granted to the service principal on the feed, not from the scope.
  RESPONSE=$(curl -sS --retry 3 --retry-all-errors --retry-delay 5 --max-time 30 \
    -w '\n%{http_code}' -X POST \
    "https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token" \
    --data-urlencode "client_id=${AZURE_CLIENT_ID}" \
    --data-urlencode "client_secret=${AZURE_CLIENT_SECRET}" \
    --data-urlencode "scope=499b84ac-1321-427f-aa17-267ca6975798/.default" \
    --data-urlencode "grant_type=client_credentials") || RESPONSE=""

  CODE=$(printf '%s' "$RESPONSE" | tail -1)
  BODY=$(printf '%s' "$RESPONSE" | sed '$d')

  if [[ "$CODE" != "200" ]]; then
    echo "ERROR: Entra refused to issue a token (HTTP ${CODE:-no answer})." >&2
    printf '%s' "$BODY" | jq -r '.error_description // empty' >&2 || true
    echo "Same secret as APIM's own publishing jobs: if it expired, those are failing too." >&2
    exit 1
  fi

  AZURE_ARTIFACTS_PAT=$(printf '%s' "$BODY" | jq -r '.access_token // empty')
  [[ -n "$AZURE_ARTIFACTS_PAT" ]] || { echo "ERROR: Entra answered 200 without a token." >&2; exit 1; }

  # CI only: carry the token to the steps that follow. Written, never printed.
  [[ -n "${BASH_ENV:-}" ]] && printf "export AZURE_ARTIFACTS_PAT='%s'\n" "$AZURE_ARTIFACTS_PAT" >> "$BASH_ENV"
fi

mkdir -p "$(dirname "$SETTINGS")"
# ${env.AZURE_ARTIFACTS_PAT} is left for Maven to resolve — the quoted heredoc keeps the
# shell out of it — so the token does not sit on disk in clear.
cat > "$SETTINGS" <<'XML'
<settings>
  <servers>
    <server>
      <id>azure-artifacts-gravitee</id>
      <username>bot</username>
      <password>${env.AZURE_ARTIFACTS_PAT}</password>
    </server>
  </servers>
  <profiles>
    <profile>
      <id>azure</id>
      <repositories>
        <repository>
          <id>azure-artifacts-gravitee</id>
          <url>FEED_URL_PLACEHOLDER</url>
        </repository>
      </repositories>
    </profile>
  </profiles>
  <activeProfiles>
    <activeProfile>azure</activeProfile>
  </activeProfiles>
</settings>
XML
# The URL is substituted afterwards so the heredoc above can stay quoted.
sed -i.bak "s|FEED_URL_PLACEHOLDER|${FEED_URL}|" "$SETTINGS" && rm -f "${SETTINGS}.bak"

echo "[feed] $SETTINGS written, pointing at $FEED_URL"
