#!/usr/bin/env bash
# ============================================================
# Luminary worktree bootstrap — Orca "Setup Script"
# ============================================================
# Paste this whole file into Orca's Settings → Worktree Hooks → Setup Script
# box (it's saved on this machine, not committed by Orca). It runs right
# after Orca creates a new worktree, using the env vars Orca injects:
#
#   $ORCA_ROOT_PATH       main repo checkout (source for .env files)
#   $ORCA_WORKTREE_PATH   the new worktree Orca just created
#   $ORCA_WORKSPACE_NAME  human-readable workspace name (used in logs only)
#
# It does two things a fresh worktree needs before `npm run dev` works
# anywhere in it:
#
#   1. Copies each subproject's untracked .env (api/, app/, cms/) in from
#      $ORCA_ROOT_PATH, since `git worktree add` only checks out tracked
#      files.
#   2. Assigns this worktree a unique port band (api / api test / app / cms)
#      so its dev servers don't collide with the main checkout or with any
#      other worktree you have running at the same time, and patches the
#      copied .env files so app/cms/api still point at each other correctly.
#
# Idempotent: re-running on a worktree that already has a port assignment
# reuses the same ports and skips .env files that already exist (set
# LUMINARY_FORCE_ENV=1 in Orca's env var config to re-copy+re-patch anyway).
#
# Tune via env vars if you add them in Orca's Setup Script env config:
#   LUMINARY_PORT_STATE_FILE  Where port-band assignments are remembered.
#                             Default: ~/.luminary-worktree-ports.tsv
#   LUMINARY_PORT_STEP        Spacing between worktrees' port bands.
#                             Default: 10
# ============================================================

set -euo pipefail

info()    { echo -e "\033[1;34m[INFO]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $*"; }
error()   { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }
success() { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }

: "${ORCA_ROOT_PATH:?ORCA_ROOT_PATH not set — run this as an Orca worktree Setup Script}"
: "${ORCA_WORKTREE_PATH:?ORCA_WORKTREE_PATH not set — run this as an Orca worktree Setup Script}"
: "${ORCA_WORKSPACE_NAME:=$ORCA_WORKTREE_PATH}"
: "${LUMINARY_FORCE_ENV:=0}"
: "${LUMINARY_PORT_STATE_FILE:=$HOME/.luminary-worktree-ports.tsv}"
: "${LUMINARY_PORT_STEP:=10}"

MAIN_WORKTREE="$(cd "$ORCA_ROOT_PATH" && pwd)"
WORKTREE_DIR="$(cd "$ORCA_WORKTREE_PATH" && pwd)"

if [[ ! -d "$WORKTREE_DIR/api" || ! -d "$WORKTREE_DIR/app" || ! -d "$WORKTREE_DIR/cms" ]]; then
    error "'$WORKTREE_DIR' doesn't look like a luminary worktree root (expected api/, app/, cms/)."
    exit 1
fi
if [[ "$WORKTREE_DIR" == "$MAIN_WORKTREE" ]]; then
    warn "ORCA_WORKTREE_PATH is the main checkout — nothing to bootstrap. Exiting."
    exit 0
fi

info "Workspace: $ORCA_WORKSPACE_NAME"
info "Source checkout for .env files: $MAIN_WORKTREE"
touch "$LUMINARY_PORT_STATE_FILE"

# --- Allocate (or reuse) a port-band slot for this worktree ----------------
SLOT=""
if grep -qF "$WORKTREE_DIR"$'\t' "$LUMINARY_PORT_STATE_FILE" 2>/dev/null; then
    SLOT="$(grep -F "$WORKTREE_DIR"$'\t' "$LUMINARY_PORT_STATE_FILE" | tail -1 | cut -f2)"
    info "Reusing previously assigned slot $SLOT for this worktree."
else
    LAST_SLOT="$(cut -f2 "$LUMINARY_PORT_STATE_FILE" 2>/dev/null | sort -n | tail -1)"
    SLOT=$((${LAST_SLOT:-0} + 1))
    printf '%s\t%s\n' "$WORKTREE_DIR" "$SLOT" >> "$LUMINARY_PORT_STATE_FILE"
    info "Assigned new slot $SLOT to this worktree (recorded in $LUMINARY_PORT_STATE_FILE)."
fi

OFFSET=$((SLOT * LUMINARY_PORT_STEP))
API_PORT=$((3000 + OFFSET))
API_TEST_PORT=$((3002 + OFFSET))
APP_PORT=$((4174 + OFFSET))
CMS_PORT=$((4175 + OFFSET))

info "Port band for slot $SLOT: api=$API_PORT api-test=$API_TEST_PORT app=$APP_PORT cms=$CMS_PORT"

# --- Copy + patch each subproject's .env ------------------------------------
copy_env() {
    local rel_path="$1" # e.g. api/.env
    local src="$MAIN_WORKTREE/$rel_path"
    local dest="$WORKTREE_DIR/$rel_path"

    if [[ -f "$dest" && "$LUMINARY_FORCE_ENV" -ne 1 ]]; then
        warn "$rel_path already exists, leaving it alone (set LUMINARY_FORCE_ENV=1 to overwrite)."
        return 1
    fi
    if [[ ! -f "$src" ]]; then
        # Fall back to the package's .env.example so the worktree at least boots.
        src="${src}.example"
        if [[ ! -f "$src" ]]; then
            warn "No $rel_path or $rel_path.example found in source checkout, skipping."
            return 1
        fi
        warn "$rel_path not found in source checkout, seeding from $(basename "$src") instead."
    fi
    cp "$src" "$dest"
    return 0
}

# api/.env
if copy_env "api/.env"; then
    sed -i.bak -E "s#^PORT=.*#PORT=$API_PORT#" "$WORKTREE_DIR/api/.env"
    sed -i.bak -E "s#^CORS_ORIGIN=.*#CORS_ORIGIN=[\"http://localhost:$APP_PORT\",\"http://localhost:$CMS_PORT\",\"https://examplewebsite.com\"]#" "$WORKTREE_DIR/api/.env"
    rm -f "$WORKTREE_DIR/api/.env.bak"
fi

# api/.env.test
if copy_env "api/.env.test"; then
    sed -i.bak -E "s#^PORT=.*#PORT=$API_TEST_PORT#" "$WORKTREE_DIR/api/.env.test"
    rm -f "$WORKTREE_DIR/api/.env.test.bak"
fi

# app/.env
if copy_env "app/.env"; then
    sed -i.bak -E "s#^VITE_API_URL=.*#VITE_API_URL=\"http://localhost:$API_PORT\"#" "$WORKTREE_DIR/app/.env"
    rm -f "$WORKTREE_DIR/app/.env.bak"
fi

# cms/.env
if copy_env "cms/.env"; then
    sed -i.bak -E "s#^VITE_API_URL=.*#VITE_API_URL=\"http://localhost:$API_PORT\"#" "$WORKTREE_DIR/cms/.env"
    sed -i.bak -E "s#^VITE_CLIENT_APP_URL=.*#VITE_CLIENT_APP_URL=\"http://localhost:$APP_PORT\"#" "$WORKTREE_DIR/cms/.env"
    rm -f "$WORKTREE_DIR/cms/.env.bak"
fi

# --- Write a summary file + launcher scripts --------------------------------
# app/ and cms/ hardcode their vite `server.port` (with strictPort) in
# vite.config.ts, so .env alone can't move them — the port has to be passed
# on the CLI, where it overrides the config. These wrapper scripts do that so
# you (or an Orca run config for this workspace) don't have to remember the
# numbers.

PORTS_FILE="$WORKTREE_DIR/.worktree-ports.env"
cat > "$PORTS_FILE" <<EOF
# Generated by the Orca worktree Setup Script — safe to delete/regenerate.
LUMINARY_WORKTREE_SLOT=$SLOT
API_PORT=$API_PORT
API_TEST_PORT=$API_TEST_PORT
APP_PORT=$APP_PORT
CMS_PORT=$CMS_PORT
EOF

cat > "$WORKTREE_DIR/dev-api.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE_DIR/api"
npm run start:dev
EOF

cat > "$WORKTREE_DIR/dev-app.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE_DIR/app"
npm run dev -- --port $APP_PORT
EOF

cat > "$WORKTREE_DIR/dev-cms.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE_DIR/cms"
npm run dev -- --port $CMS_PORT
EOF

chmod +x "$WORKTREE_DIR/dev-api.sh" "$WORKTREE_DIR/dev-app.sh" "$WORKTREE_DIR/dev-cms.sh"

success "Worktree bootstrapped: $ORCA_WORKSPACE_NAME ($WORKTREE_DIR)"
echo
echo "  api  http://localhost:$API_PORT   ./dev-api.sh"
echo "  app  http://localhost:$APP_PORT   ./dev-app.sh"
echo "  cms  http://localhost:$CMS_PORT   ./dev-cms.sh"
echo
echo "Point Orca's run configs for this workspace at those three scripts (or"
echo "at '$PORTS_FILE' if you'd rather template the --port flags directly)."
echo
warn "CouchDB/MinIO are NOT per-worktree — this worktree still talks to the"
warn "shared instance from api/.env's DB_CONNECTION_STRING / S3_* vars."
