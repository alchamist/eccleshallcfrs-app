#!/usr/bin/env bash
# Usage: ./scripts/new-group.sh <slug> "<Scheme Name>" <CALLSIGN> "<Coordinator Name>" <coordinator_prf>
#
# Example:
#   ./scripts/new-group.sh cannock "Cannock CFRs" RC0999 "Jane Smith" 9001
#
# What this does:
#   1. Creates two KV namespaces (CFR_USERS and CFR_DATA)
#   2. Creates wrangler.<slug>.toml
#   3. Seeds config:vehicle KV key
#   4. Creates an initial coordinator user
#   5. Adds a deploy step to the GitHub Action
#   6. Prints the remaining manual steps (DVLA secret, Pages project)

set -euo pipefail

SLUG="${1:-}"
SCHEME_NAME="${2:-}"
CALLSIGN="${3:-}"
COORD_NAME="${4:-}"
COORD_PRF="${5:-}"
ACCOUNT_ID="91e87a1af94c50755b19f07943df567c"
PAGES_PROJECT="${SLUG}cfrs-app"
WORKFLOW_FILE=".github/workflows/deploy-secondary-groups.yml"

if [[ -z "$SLUG" || -z "$SCHEME_NAME" || -z "$CALLSIGN" || -z "$COORD_NAME" || -z "$COORD_PRF" ]]; then
  echo "Usage: $0 <slug> \"<Scheme Name>\" <CALLSIGN> \"<Coordinator Name>\" <coordinator_prf>"
  echo "Example: $0 cannock \"Cannock CFRs\" RC0999 \"Jane Smith\" 9001"
  exit 1
fi

echo ""
echo "=== New CFR Group Setup: $SCHEME_NAME ($CALLSIGN) ==="
echo ""

# ── 1. Create KV namespaces ───────────────────────────────────────────────────

echo "Creating KV namespaces..."

USERS_NS_JSON=$(wrangler kv namespace create "${SLUG^^}_CFR_USERS" --remote 2>&1)
USERS_NS_ID=$(echo "$USERS_NS_JSON" | grep -oP 'id = "\K[^"]+')
echo "  CFR_USERS namespace: $USERS_NS_ID"

DATA_NS_JSON=$(wrangler kv namespace create "${SLUG^^}_CFR_DATA" --remote 2>&1)
DATA_NS_ID=$(echo "$DATA_NS_JSON" | grep -oP 'id = "\K[^"]+')
echo "  CFR_DATA namespace:  $DATA_NS_ID"

# ── 2. Create wrangler.<slug>.toml ────────────────────────────────────────────

TOML_FILE="wrangler.${SLUG}.toml"
echo ""
echo "Creating $TOML_FILE..."

cat > "$TOML_FILE" <<TOML
name = "${PAGES_PROJECT}"
compatibility_date = "2024-09-23"
pages_build_output_dir = "."

[[kv_namespaces]]
binding = "CFR_USERS"
id = "${USERS_NS_ID}"

[[kv_namespaces]]
binding = "CFR_DATA"
id = "${DATA_NS_ID}"
TOML

echo "  Created $TOML_FILE"

# ── 3. Seed config:vehicle ────────────────────────────────────────────────────

echo ""
echo "Seeding config:vehicle..."

VEHICLE_JSON=$(cat <<JSON
{"scheme_name":"${SCHEME_NAME}","callsign":"${CALLSIGN}","vrm":null,"wallboard_pin":null,"tread_warn_mm":3,"maintenance":{"mot":{"next_due":null,"warn_days":30},"service":{"next_due":null,"warn_days":14,"interval_miles":10000,"interval_months":12},"insurance":{"next_due":null,"warn_days":30},"deep_clean":{"interval_days":60,"warn_days":7}}}
JSON
)

wrangler kv key put "config:vehicle" "$VEHICLE_JSON" --namespace-id "$DATA_NS_ID" --remote
echo "  config:vehicle written"

# ── 4. Create initial coordinator user ────────────────────────────────────────

echo ""
echo "Creating coordinator user..."

ACCESS_KEY="cfr-CORD-0001-INIT"
USER_UUID=$(node -e "process.stdout.write(require('crypto').randomUUID())" 2>/dev/null || python3 -c "import uuid; print(str(uuid.uuid4()))")

USER_JSON=$(cat <<JSON
{"id":"${ACCESS_KEY}","name":"${COORD_NAME}","roles":["responder","coordinator","support"],"active":true,"prf_number":"${COORD_PRF}","created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON
)

wrangler kv key put "user:${ACCESS_KEY}" "$USER_JSON" --namespace-id "$USERS_NS_ID" --remote
wrangler kv key put "users:index" '["cfr-CORD-0001-INIT"]' --namespace-id "$USERS_NS_ID" --remote

echo "  Coordinator created: ${COORD_NAME} (access key: ${ACCESS_KEY}, PRF: ${COORD_PRF})"
echo "  ⚠  No PIN set — coordinator must use the access key to log in first,"
echo "     then set a PIN via Admin → Users."

# ── 5. Add GitHub Action deploy step ─────────────────────────────────────────

echo ""
echo "Adding deploy step to GitHub Action..."

# Insert before the last line (which closes the file)
DEPLOY_STEP=$(cat <<YAML

  deploy-${SLUG}:
    name: Deploy ${SCHEME_NAME}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Wrangler
        run: npm install -g wrangler
      - name: Deploy to ${PAGES_PROJECT}
        run: |
          cp wrangler.${SLUG}.toml wrangler.toml
          wrangler pages deploy . --project-name ${PAGES_PROJECT}
YAML
)

echo "$DEPLOY_STEP" >> "$WORKFLOW_FILE"
echo "  Added deploy-${SLUG} job to $WORKFLOW_FILE"

# ── Done — print remaining manual steps ───────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Automated steps complete. Manual steps remaining:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  1. Create the Cloudflare Pages project:"
echo "     → dash.cloudflare.com → Workers & Pages → Create"
echo "     → Pages → Connect to Git → eccleshallcfrs-app repo"
echo "     → Branch: master, Project name: ${PAGES_PROJECT}"
echo "     → No build command needed"
echo ""
echo "  2. Add DVLA_API_KEY secret to the new Pages project:"
echo "     → Pages project → Settings → Environment Variables"
echo "     → Add: DVLA_API_KEY (same value as other projects)"
echo ""
echo "  3. Commit and push:"
echo "     git add wrangler.${SLUG}.toml ${WORKFLOW_FILE}"
echo "     git commit -m 'Add ${SCHEME_NAME} group'"
echo "     git push"
echo "     (GitHub Action will deploy all groups automatically)"
echo ""
echo "  4. The coordinator logs in with access key: ${ACCESS_KEY}"
echo "     and sets their PIN via Admin → Users → Edit."
echo ""
echo "════════════════════════════════════════════════════════════"
