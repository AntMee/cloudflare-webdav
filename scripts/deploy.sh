#!/usr/bin/env bash
set -euo pipefail

WORKER_NAME="${WORKER_NAME:-cloudflare-webdav}"
D1_NAME="${D1_NAME:-cloudflare-webdav}"
KV_NAMESPACE_NAME="${KV_NAMESPACE_NAME:-cloudflare-webdav-files}"
ADMIN_PAGES_PROJECT="${ADMIN_PAGES_PROJECT:-cloudflare-webdav-admin}"
USER_PAGES_PROJECT="${USER_PAGES_PROJECT:-cloudflare-webdav-user}"
SKIP_PAGES="${SKIP_PAGES:-0}"
SKIP_WORKER="${SKIP_WORKER:-0}"

step() {
  printf '\n==> %s\n' "$1"
}

wrangler() {
  npx wrangler "$@"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

get_d1_id() {
  wrangler d1 list --json 2>/dev/null | node -e '
const fs = require("fs");
const name = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8") || "[]");
const item = data.find((x) => x.name === name);
process.stdout.write(item?.uuid || "");
' "$D1_NAME"
}

ensure_d1() {
  step "Checking D1 database: $D1_NAME" >&2
  local existing
  existing="$(get_d1_id)"
  if [ -n "$existing" ]; then
    echo "Reusing D1: $existing" >&2
    printf '%s' "$existing"
    return
  fi

  wrangler d1 create "$D1_NAME" >/tmp/cloudflare-webdav-d1.out
  existing="$(get_d1_id)"
  if [ -z "$existing" ]; then
    cat /tmp/cloudflare-webdav-d1.out >&2
    echo "Could not determine D1 database_id." >&2
    exit 1
  fi
  printf '%s' "$existing"
}

get_kv_id() {
  wrangler kv namespace list 2>/dev/null | node -e '
const fs = require("fs");
const title = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8") || "[]");
const item = data.find((x) => x.title === title);
process.stdout.write(item?.id || "");
' "$KV_NAMESPACE_NAME"
}

ensure_kv() {
  step "Checking KV namespace: $KV_NAMESPACE_NAME" >&2
  local existing
  existing="$(get_kv_id)"
  if [ -n "$existing" ]; then
    echo "Reusing KV: $existing" >&2
    printf '%s' "$existing"
    return
  fi

  wrangler kv namespace create "$KV_NAMESPACE_NAME" >/tmp/cloudflare-webdav-kv.out
  existing="$(get_kv_id)"
  if [ -z "$existing" ]; then
    cat /tmp/cloudflare-webdav-kv.out >&2
    echo "Could not determine KV namespace id." >&2
    exit 1
  fi
  printf '%s' "$existing"
}

update_wrangler_config() {
  local d1_id="$1"
  local kv_id="$2"

  if [ ! -f wrangler.jsonc ]; then
    echo "wrangler.jsonc not found; skipping binding update."
    return
  fi

  step "Updating wrangler.jsonc bindings"
  node - "$D1_NAME" "$d1_id" "$kv_id" <<'NODE'
const fs = require("fs");
const [d1Name, d1Id, kvId] = process.argv.slice(2);
let content = fs.readFileSync("wrangler.jsonc", "utf8");
content = content.replace(/"database_name"\s*:\s*"[^"]+"/, `"database_name": "${d1Name}"`);
content = content.replace(/"database_id"\s*:\s*"[^"]+"/, `"database_id": "${d1Id}"`);
content = content.replace(/"id"\s*:\s*"[^"]+"/, `"id": "${kvId}"`);
fs.writeFileSync("wrangler.jsonc", content);
NODE
}

set_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "$name cannot be empty." >&2
    exit 1
  fi
  printf '%s' "$value" | wrangler secret put "$name"
}

ensure_pages_project() {
  local project="$1"
  if wrangler pages project list 2>/dev/null | grep -F "$project" >/dev/null 2>&1; then
    echo "Reusing Pages project: $project"
    return
  fi
  wrangler pages project create "$project"
}

require_command node

step "Checking Cloudflare login"
wrangler whoami

if [ -f package.json ]; then
  step "Installing dependencies"
  npm install
fi

D1_ID="$(ensure_d1)"
KV_ID="$(ensure_kv)"
update_wrangler_config "$D1_ID" "$KV_ID"

if [ "$SKIP_WORKER" != "1" ]; then
  step "Configuring admin variables and secrets"
  read -r -p "ADMIN_USERNAME: " ADMIN_USERNAME
  if [ -z "$ADMIN_USERNAME" ]; then
    echo "ADMIN_USERNAME cannot be empty." >&2
    exit 1
  fi

  if [ -f wrangler.jsonc ]; then
    node - "$ADMIN_USERNAME" <<'NODE'
const fs = require("fs");
const adminUsername = process.argv[2];
let content = fs.readFileSync("wrangler.jsonc", "utf8");
if (/"vars"\s*:\s*\{/.test(content)) {
  if (/"ADMIN_USERNAME"\s*:/.test(content)) {
    content = content.replace(/"ADMIN_USERNAME"\s*:\s*"[^"]+"/, `"ADMIN_USERNAME": "${adminUsername}"`);
  } else {
    content = content.replace(/"vars"\s*:\s*\{/, `"vars": {\n    "ADMIN_USERNAME": "${adminUsername}",`);
  }
  fs.writeFileSync("wrangler.jsonc", content);
} else {
  console.log("wrangler.jsonc has no vars block; add ADMIN_USERNAME manually if needed.");
}
NODE
  fi

  read -r -s -p "ADMIN_PASSWORD: " ADMIN_PASSWORD
  printf '\n'
  set_secret "ADMIN_PASSWORD" "$ADMIN_PASSWORD"

  read -r -p "JWT_SECRET (leave empty to auto-generate): " JWT_SECRET
  if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  fi
  set_secret "JWT_SECRET" "$JWT_SECRET"

  if [ -d migrations ] && [ -f wrangler.jsonc ]; then
    step "Applying D1 migrations"
    wrangler d1 migrations apply "$D1_NAME" --remote
  fi

  if [ -f wrangler.jsonc ] && [ -d src ]; then
    step "Deploying Worker"
    wrangler deploy
  else
    echo "wrangler.jsonc or src/ not found; skipping Worker deploy."
  fi
fi

if [ "$SKIP_PAGES" != "1" ]; then
  if [ -d pages-admin ]; then
    step "Deploying admin Pages"
    ensure_pages_project "$ADMIN_PAGES_PROJECT"
    wrangler pages deploy ./pages-admin --project-name "$ADMIN_PAGES_PROJECT"
  fi

  if [ -d pages-user ]; then
    step "Deploying user Pages"
    ensure_pages_project "$USER_PAGES_PROJECT"
    wrangler pages deploy ./pages-user --project-name "$USER_PAGES_PROJECT"
  fi
fi

step "Deploy flow complete"
echo "D1 database_id: $D1_ID"
echo "KV namespace id: $KV_ID"
