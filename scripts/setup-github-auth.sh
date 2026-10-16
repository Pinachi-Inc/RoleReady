#!/usr/bin/env bash
# Turns on GitHub sign-in in Firebase Auth from the command line.
# Reads GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET from .env.local (gitignored) so the secret
# never lands in the repo or in shell history. Needs `gcloud auth login` as a project owner.
#
#   bash scripts/setup-github-auth.sh [firebase-project-id]
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="${1:-roleready-d7295}"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local. Add GITHUB_CLIENT_ID=... and GITHUB_CLIENT_SECRET=... to it first." >&2
  exit 1
fi
GITHUB_CLIENT_ID="$(grep -E '^GITHUB_CLIENT_ID=' .env.local | head -1 | cut -d= -f2- | tr -d "\"' ")"
GITHUB_CLIENT_SECRET="$(grep -E '^GITHUB_CLIENT_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d "\"' ")"
if [[ -z "$GITHUB_CLIENT_ID" || -z "$GITHUB_CLIENT_SECRET" ]]; then
  echo "GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is empty in .env.local." >&2
  exit 1
fi

TOKEN="$(gcloud auth print-access-token)"
BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/defaultSupportedIdpConfigs"
BODY="$(printf '{"enabled":true,"clientId":"%s","clientSecret":"%s"}' "$GITHUB_CLIENT_ID" "$GITHUB_CLIENT_SECRET")"
call() {
  curl -sS -o /tmp/github-idp.$$ -w '%{http_code}' -X "$1" "$2" \
    -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT" -H 'Content-Type: application/json' \
    --data @- <<<"$BODY"
}

# Create the GitHub provider; if it already exists, update it instead.
status="$(call POST "$BASE?idpId=github.com")"
if [[ "$status" == "409" ]]; then
  status="$(call PATCH "$BASE/github.com?updateMask=enabled,clientId,clientSecret")"
fi
if [[ "$status" != "200" ]]; then
  echo "Firebase answered HTTP $status:" >&2
  sed -E 's/"clientSecret": *"[^"]*"/"clientSecret": "***"/' /tmp/github-idp.$$ >&2
  rm -f /tmp/github-idp.$$
  exit 1
fi
rm -f /tmp/github-idp.$$
echo "GitHub sign-in is enabled for $PROJECT (client id $GITHUB_CLIENT_ID)."
