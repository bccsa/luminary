#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Luminary CLI - Cross-platform Setup & Management
# ============================================================
# This script automates the setup and management of the Luminary
# project across Linux, macOS, and Windows (WSL/Git Bash).
# It guides developers through environment configuration, service
# setup (CouchDB, MinIO), and project initialization.

# --- Logging utilities with colored output ---
info()    { echo -e "\033[1;34m[INFO]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $*"; }
error()   { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }
success() { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }

# --- OS Detection ---
# Detect the platform to provide OS-specific installation guidance
OS="$(uname -s)"
case "$OS" in
  Linux*)     PLATFORM="linux";;
  Darwin*)    PLATFORM="macos";;
  CYGWIN*|MINGW*|MSYS*) PLATFORM="windows";;
  *) error "Unsupported OS: $OS"; exit 1;;
esac
info "Detected platform: $PLATFORM"

# --- Default environment variables for database services ---
# These can be overridden at runtime, but sensible defaults are provided
# for local development. DO NOT use these credentials in production.
: "${LUMINARY_COUCHDB_USER:=admin}"
: "${LUMINARY_COUCHDB_PASSWORD:=yourpassword}"
: "${LUMINARY_MINIO_ROOT_USER:=minio}"
: "${LUMINARY_MINIO_ROOT_PASSWORD:=minio123}"

JWT_MAPPINGS_JSON='{"groups":{"group-super-admins":"(jwt) => true"},"userId":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].userId","email":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].email","name":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].username"}'

# ============================================================
# PREREQUISITE CHECKS
# ============================================================

# Check for Node.js (npm comes with Node.js installation)
# Node.js is mandatory because the project uses npm for dependency management
# across all three subprojects (api, cms, app) and shared library builds.
check_node() {
  if ! command -v node &>/dev/null; then
    error "Node.js is not installed."
    if [[ "$PLATFORM" == "macos" ]]; then
      warn "Install via Homebrew: brew install node"
      warn "Or download from: https://nodejs.org/"
    elif [[ "$PLATFORM" == "linux" ]]; then
      warn "Install via nvm (recommended): curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
      warn "Or install via package manager: sudo apt-get install nodejs npm"
    else
      warn "Install from: https://nodejs.org/"
    fi
    exit 1
  fi
  success "Node.js found: $(node --version)"
}

# Check if Docker is available; warn if missing but allow native setup fallback
check_docker() {
  if ! command -v docker &>/dev/null; then
    warn "Docker is not installed."
    warn "Docker is preferred for running CouchDB and MinIO."
    warn "You can:"
    warn "  1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    warn "  2. Or proceed with native installation for database services (slower, local-only)."
    return 1
  fi
  success "Docker found: $(docker --version)"
  return 0
}

# ============================================================
# LUMINARY ROOT DETECTION
# ============================================================

find_luminary_root() {
  # Allow explicit override via LUMINARY_ROOT environment variable
  # Useful for testing or non-standard project layouts.
  if [[ -n "${LUMINARY_ROOT:-}" ]]; then
    info "Using LUMINARY_ROOT override: $LUMINARY_ROOT"
    echo "$LUMINARY_ROOT"
    return
  fi

  # Walk up directory tree looking for the luminary project root
  # (characterized by the presence of api/, app/, cms/, shared/ directories)
  local dir="$(pwd)"
  while [[ "$dir" != "/" && "$dir" != "" ]]; do
    if [[ -d "$dir/api" && -d "$dir/app" && -d "$dir/cms" && -d "$dir/shared" ]]; then
      echo "$dir"
      return
    fi
    dir="$(dirname "$dir")"
  done

  error "Could not find Luminary project root. Make sure you run this from within the project directory."
  exit 1
}
LUMINARY_ROOT="$(find_luminary_root)"
info "Found Luminary project at: $LUMINARY_ROOT"

# ============================================================
# ENVIRONMENT VARIABLE SETUP WIZARD
# ============================================================

# Interactive wizard that prompts for environment variables.
# Offers two modes:
# - Full Setup: Prompts for all variables, allowing customization
# - Critical Only: Prompts only for sensitive/mandatory variables (Auth0 keys, encryption)
#   and generates reasonable defaults for the rest.
setup_env_wizard() {
  local project="$1"
  local env_file="$LUMINARY_ROOT/$project/.env.example"
  local output_file="$LUMINARY_ROOT/$project/.env"

  if [[ ! -f "$env_file" ]]; then
    warn "No .env.example found for $project. Skipping environment setup."
    return
  fi

  info "Setting up environment for $project..."
  echo ""
  echo "Choose setup mode for $project:"
  echo "  1) Full Setup - Customize all variables"
  echo "  2) Critical Only - Mandatory variables only (Auth0, encryption keys)"
  echo ""
  read -rp "Select mode (1 or 2): " setup_mode

  if [[ "$setup_mode" == "1" ]]; then
    info "Full Setup mode for $project"
    cp "$env_file" "$output_file"
    info "Copied .env.example to .env"
    warn "Please edit $output_file and fill in all required variables."
    warn "Critical variables include: Auth0 domain, client ID, encryption keys."
  else
    info "Critical Only mode for $project"
    # Copy the example file as base
    cp "$env_file" "$output_file"

    success ".env file created for $project with defaults"
  fi

  apply_auth0_env "$output_file"

  if [[ "$project" == "api" ]]; then
    apply_api_env_defaults "$output_file"
  fi
  echo ""
}

apply_auth0_env() {
  local output_file="$1"

  if grep -q "VITE_AUTH0_DOMAIN" "$output_file" || grep -q "AUTH0_DOMAIN" "$output_file"; then
    echo ""
    warn "Auth0 is required. Please provide your Auth0 credentials."
    warn "If you have a certificate from the Auth0 dashboard, paste it into the relevant field when prompted."
    read -rp "Auth0 Domain (e.g., your-domain.auth0.com): " auth0_domain
    sed -i.bak "s|VITE_AUTH0_DOMAIN=.*|VITE_AUTH0_DOMAIN=$auth0_domain|g" "$output_file"
    sed -i.bak "s|AUTH0_DOMAIN=.*|AUTH0_DOMAIN=$auth0_domain|g" "$output_file"
    rm -f "$output_file.bak"

    read -rp "Auth0 Client ID: " auth0_client_id
    sed -i.bak "s|VITE_AUTH0_CLIENT_ID=.*|VITE_AUTH0_CLIENT_ID=$auth0_client_id|g" "$output_file"
    sed -i.bak "s|AUTH0_CLIENT_ID=.*|AUTH0_CLIENT_ID=$auth0_client_id|g" "$output_file"
    rm -f "$output_file.bak"

    read -rp "Auth0 Audience (e.g., https://your.audience/api): " auth0_audience
    sed -i.bak "s|VITE_AUTH0_AUDIENCE=.*|VITE_AUTH0_AUDIENCE=$auth0_audience|g" "$output_file"
    sed -i.bak "s|AUTH0_AUDIENCE=.*|AUTH0_AUDIENCE=$auth0_audience|g" "$output_file"
    rm -f "$output_file.bak"
  fi
}

escape_env_value() {
  python3 - <<'PY' <<<"$1"
import sys
value = sys.stdin.read()
value = value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
sys.stdout.write(value)
PY
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|g" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
  rm -f "$file.bak"
}

prompt_multiline_value() {
  local prompt="$1"
  local value=""

  info "$prompt"
  info "Paste the value now."
  info "Finish by typing END on its own line and pressing Enter, or press Ctrl+D."

  while IFS= read -r line; do
    if [[ "$line" == "END" ]]; then
      break
    fi
    value+="$line"$'\n'
  done || true

  value="${value%$'\n'}"
  echo "$value"
}

prompt_jwt_secret() {
  local jwt_secret=""
  local use_multiline=""

  echo ""
  warn "JWT_SECRET is required for API authentication (not the Auth0 certificate)."

  while [[ ! "$use_multiline" =~ ^[YyNn]$ ]]; do
    read -rp "Use multiline input? (y/n): " -n 1 -r use_multiline
    echo ""
  done

  if [[ "$use_multiline" =~ ^[Yy]$ ]]; then
    info "Waiting for JWT_SECRET input..."
    jwt_secret=$(prompt_multiline_value "Paste JWT_SECRET")
  else
    read -rp "JWT_SECRET (single line): " jwt_secret
  fi

  echo "$jwt_secret"
}

apply_api_env_defaults() {
  local output_file="$1"

  if grep -q "JWT_SECRET" "$output_file"; then
    local jwt_secret=""
    while [[ -z "$jwt_secret" ]]; do
      jwt_secret=$(prompt_jwt_secret)
      if [[ -z "$jwt_secret" ]]; then
        warn "JWT_SECRET cannot be empty."
      fi
    done
    local jwt_secret_escaped
    jwt_secret_escaped=$(escape_env_value "$jwt_secret")
    upsert_env_var "$output_file" "JWT_SECRET" "\"$jwt_secret_escaped\""
  fi

  if grep -q "ENCRYPTION_KEY" "$output_file"; then
    local encryption_key=""
    while [[ -z "$encryption_key" ]]; do
      echo ""
      warn "ENCRYPTION_KEY is required for data security."
      read -rp "Enter a 32-byte encryption key (or press Enter to generate one): " encryption_key
      if [[ -z "$encryption_key" ]]; then
        encryption_key=$(openssl rand -hex 32)
        info "Generated encryption key: $encryption_key"
      fi
    done
    upsert_env_var "$output_file" "ENCRYPTION_KEY" "\"$encryption_key\""
  fi

  upsert_env_var "$output_file" "JWT_MAPPINGS" "'$JWT_MAPPINGS_JSON'"

  local db_connection
  db_connection="http://${LUMINARY_COUCHDB_USER}:${LUMINARY_COUCHDB_PASSWORD}@127.0.0.1:5984"
  upsert_env_var "$output_file" "DB_CONNECTION_STRING" "\"$db_connection\""

  upsert_env_var "$output_file" "S3_ENDPOINT" "127.0.0.1"
  upsert_env_var "$output_file" "S3_PORT" "9000"
  upsert_env_var "$output_file" "S3_USE_SSL" "false"
  upsert_env_var "$output_file" "S3_ACCESS_KEY" "\"$LUMINARY_MINIO_ROOT_USER\""
  upsert_env_var "$output_file" "S3_SECRET_KEY" "\"$LUMINARY_MINIO_ROOT_PASSWORD\""
  upsert_env_var "$output_file" "S3_IMG_BUCKET" "\"luminary-images\""
}

prompt_service_credentials() {
  echo ""
  read -rp "CouchDB admin username [${LUMINARY_COUCHDB_USER}]: " couchdb_user_input
  if [[ -n "$couchdb_user_input" ]]; then
    LUMINARY_COUCHDB_USER="$couchdb_user_input"
  fi

  info "Enter CouchDB admin password (input hidden). Press Enter to keep current value."
  read -rsp "CouchDB admin password [hidden]: " couchdb_password_input
  echo ""
  if [[ -n "$couchdb_password_input" ]]; then
    LUMINARY_COUCHDB_PASSWORD="$couchdb_password_input"
  fi

  read -rp "MinIO root user [${LUMINARY_MINIO_ROOT_USER}]: " minio_user_input
  if [[ -n "$minio_user_input" ]]; then
    LUMINARY_MINIO_ROOT_USER="$minio_user_input"
  fi

  info "Enter MinIO root password (input hidden). Press Enter to keep current value."
  read -rsp "MinIO root password [hidden]: " minio_password_input
  echo ""
  if [[ -n "$minio_password_input" ]]; then
    LUMINARY_MINIO_ROOT_PASSWORD="$minio_password_input"
  fi
}

# ============================================================
# GIT HOOK SETUP
# ============================================================

# Install the post-checkout git hook to the .git/hooks directory.
# This hook rebuilds the shared library when developers switch branches,
# preventing version mismatches between app/cms and shared library.
setup_git_hooks() {
  local hook_source="$LUMINARY_ROOT/scripts/post-checkout"
  local hook_dest="$LUMINARY_ROOT/.git/hooks/post-checkout"

  if [[ ! -f "$hook_source" ]]; then
    warn "post-checkout hook not found at $hook_source. Skipping git hooks setup."
    return
  fi

  info "Installing git hook (post-checkout)..."
  mkdir -p "$LUMINARY_ROOT/.git/hooks"
  cp "$hook_source" "$hook_dest"
  chmod +x "$hook_dest"
  success "Git hook installed and made executable."
}

# ============================================================
# PORT AVAILABILITY CHECK
# ============================================================

# Warn the user if required ports are already in use.
# This prevents service startup failures and helps diagnose port conflicts.
# Required ports:
# - 3000: API server
# - 4174: Client app (Vite dev server)
# - 4175: CMS app (Vite dev server)
# - 5984: CouchDB HTTP API
# - 9000: MinIO S3 API
# - 9001: MinIO Console UI
check_ports() {
  local required_ports=(3000 4174 4175 5984 9000 9001)
  local in_use=()

  warn "Checking for port availability..."
  for port in "${required_ports[@]}"; do
    if lsof -Pi ":$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      in_use+=("$port")
    fi
  done

  if [[ ${#in_use[@]} -gt 0 ]]; then
    warn "The following ports are already in use: ${in_use[*]}"
    warn "Please close any applications using these ports before continuing."
    read -rp "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      error "Setup cancelled. Please free up the ports and try again."
      exit 1
    fi
  else
    success "All required ports are available."
  fi
}

# ============================================================
# DOCKER-BASED DATABASE SETUP
# ============================================================

# Start CouchDB via Docker container.
# CouchDB is the primary database for all Luminary data.
# Runs on port 5984 with credentials from environment variables.
setup_couchdb_docker() {
  info "Starting CouchDB container..."
  if docker ps -a --format '{{.Names}}' | grep -q '^luminary-couchdb$'; then
    warn "CouchDB container already exists."
    if ! docker ps --format '{{.Names}}' | grep -q '^luminary-couchdb$'; then
      info "Starting existing CouchDB container..."
      docker start luminary-couchdb
    else
      info "CouchDB container is already running."
    fi
  else
    info "Creating new CouchDB container..."
    docker run -d \
      --name luminary-couchdb \
      -p 5984:5984 \
      -e COUCHDB_USER="$LUMINARY_COUCHDB_USER" \
      -e COUCHDB_PASSWORD="$LUMINARY_COUCHDB_PASSWORD" \
      couchdb:latest
  fi
  success "CouchDB running at http://localhost:5984"
}

# Start MinIO via Docker container.
# MinIO provides S3-compatible object storage for media uploads.
# Runs on port 9000 (API) and 9001 (Console UI).
setup_minio_docker() {
  info "Starting MinIO container..."
  if docker ps -a --format '{{.Names}}' | grep -q '^luminary-storage$'; then
    warn "MinIO container already exists."
    if ! docker ps --format '{{.Names}}' | grep -q '^luminary-storage$'; then
      info "Starting existing MinIO container..."
      docker start luminary-storage
    else
      info "MinIO container is already running."
    fi
  else
    info "Creating new MinIO container..."
    docker run -d \
      -p 9000:9000 \
      -p 9001:9001 \
      --name luminary-storage \
      -e "MINIO_ROOT_USER=$LUMINARY_MINIO_ROOT_USER" \
      -e "MINIO_ROOT_PASSWORD=$LUMINARY_MINIO_ROOT_PASSWORD" \
      quay.io/minio/minio:latest server /data --console-address ":9001"
  fi
  success "MinIO running at http://localhost:9001 (Console)"
}

# ============================================================
# NATIVE DATABASE SETUP (Linux/macOS fallback)
# ============================================================

# Install CouchDB from system package manager (Linux) or Homebrew (macOS).
# This provides a local database instance for developers without Docker.
# Warning: Native installations are single-machine only and not ideal for team development.
setup_couchdb_native() {
  info "Setting up CouchDB via native installation..."
  
  if [[ "$PLATFORM" == "macos" ]]; then
    if ! command -v couchdb &>/dev/null; then
      info "Installing CouchDB via Homebrew..."
      HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1 brew install couchdb
      info "Starting CouchDB..."
      brew services start couchdb
      success "CouchDB installed and started on macOS"
    else
      info "CouchDB already installed. Starting service..."
      brew services start couchdb || true
      success "CouchDB is running"
    fi
  elif [[ "$PLATFORM" == "linux" ]]; then
    info "Installing CouchDB via apt-get (Ubuntu/Debian)..."
    sudo apt-get update
    sudo apt-get install -y couchdb
    info "Starting CouchDB..."
    sudo systemctl start couchdb
    sudo systemctl enable couchdb
    success "CouchDB installed and started on Linux"
  fi
  
  success "CouchDB running at http://localhost:5984"
}

# Install MinIO from binaries (macOS) or system package manager (Linux).
# MinIO is simpler than CouchDB to install natively.
# Warning: Native MinIO is not persistent across restarts without additional setup.
setup_minio_native() {
  info "Setting up MinIO via native installation..."
  
  if [[ "$PLATFORM" == "macos" ]]; then
    if ! command -v minio &>/dev/null; then
      info "Installing MinIO via Homebrew..."
      HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1 brew install minio/stable/minio
      success "MinIO installed"
      warn "Start MinIO manually with: minio server --console-address :9001 /data"
    else
      info "MinIO already installed."
      warn "Start MinIO manually with: minio server --console-address :9001 /data"
    fi
  elif [[ "$PLATFORM" == "linux" ]]; then
    info "Installing MinIO binary..."
    local minio_path="/usr/local/bin/minio"
    if [[ ! -f "$minio_path" ]]; then
      curl -o "$minio_path" https://dl.min.io/server/minio/release/linux-amd64/minio
      chmod +x "$minio_path"
      success "MinIO binary installed to $minio_path"
    fi
    warn "Start MinIO manually with: minio server --console-address :9001 /data"
  fi
  
  warn "NOTE: Native MinIO requires manual startup and may not persist across reboots."
  warn "Docker setup is strongly recommended for production-like environments."
}

install_minio_client() {
  if command -v mc &>/dev/null; then
    success "MinIO client (mc) is already installed."
    return
  fi

  info "Installing MinIO client (mc)..."

  if [[ "$PLATFORM" == "macos" ]] && command -v brew &>/dev/null; then
    HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1 brew install minio/stable/mc
    success "MinIO client installed via Homebrew."
    return
  fi

  local target_dir="/usr/local/bin"
  if [[ ! -w "$target_dir" ]]; then
    target_dir="$HOME/.local/bin"
    mkdir -p "$target_dir"
    warn "Installing mc to $target_dir. Ensure this is in your PATH."
  fi

  local arch="amd64"
  local os="linux"
  if [[ "$PLATFORM" == "macos" ]]; then
    os="darwin"
  fi

  local target="$target_dir/mc"
  curl -fsSL -o "$target" "https://dl.min.io/client/mc/release/${os}-${arch}/mc"
  chmod +x "$target"
  success "MinIO client installed at $target"
}

# ============================================================
# PROJECT BUILD & INITIALIZATION
# ============================================================

# Install dependencies and build all subprojects.
# Order matters: shared must be built first (it's a dependency of app/cms).
# Then install app and cms with --install-links to use the local shared build.
# Finally, seed the API database with initial data.
setup_projects() {
  info "Installing and building all Luminary subprojects..."
  cd "$LUMINARY_ROOT"

  # Build shared library first (used by app and cms)
  info "Building shared library..."
  cd "$LUMINARY_ROOT/shared"
  npm ci || npm install
  npm run build
  success "Shared library built"

  # Install and link app (uses shared as dependency)
  info "Installing app with shared library link..."
  cd "$LUMINARY_ROOT/app"
  npm ci --install-links || npm install
  success "App installed"

  # Install and link cms (uses shared as dependency)
  info "Installing cms with shared library link..."
  cd "$LUMINARY_ROOT/cms"
  npm ci --install-links || npm install
  success "CMS installed"

  # Install API and seed database with initial data
  info "Installing API..."
  cd "$LUMINARY_ROOT/api"
  npm ci || npm install
  
  # Only seed if .env exists (created during environment setup)
  if [[ -f "$LUMINARY_ROOT/api/.env" ]]; then
    info "Seeding database..."
    npm run seed || warn "Database seeding failed. You may need to seed manually later."
  fi
  
  success "All subprojects installed and built."
}

# ============================================================
# SERVICE MANAGEMENT
# ============================================================

# Start all services in the background: API server + dev servers for CMS and App.
# API runs on 3000, CMS on 4175, App on 4174.
start_all() {
  info "Starting all services..."
  (cd "$LUMINARY_ROOT/api" && npm run start:dev) &
  (cd "$LUMINARY_ROOT/cms" && npm run dev) &
  (cd "$LUMINARY_ROOT/app" && npm run dev) &
  success "Services started:"
  success "  API    → http://localhost:3000"
  success "  CMS    → http://localhost:4175"
  success "  App    → http://localhost:4174"
  wait
}

# Restart all services by killing existing processes and restarting them.
restart_all() {
  warn "Stopping all services..."
  pkill -f "npm run start:dev" || true
  pkill -f "npm run dev" || true
  sleep 1
  start_all
}

# Restart only the API service (useful during backend development).
restart_api() {
  pgrep -f "$LUMINARY_ROOT/api.*npm run start:dev" | xargs -r kill || true
  sleep 1
  info "Starting API..."
  (cd "$LUMINARY_ROOT/api" && npm run start:dev) &
  success "API restarted at http://localhost:3000"
}

# Restart only the CMS service (useful during CMS frontend development).
restart_cms() {
  pgrep -f "$LUMINARY_ROOT/cms.*npm run dev" | xargs -r kill || true
  sleep 1
  info "Starting CMS..."
  (cd "$LUMINARY_ROOT/cms" && npm run dev) &
  success "CMS restarted at http://localhost:4175"
}

# Restart only the App service (useful during app frontend development).
restart_app() {
  pgrep -f "$LUMINARY_ROOT/app.*npm run dev" | xargs -r kill || true
  sleep 1
  info "Starting App..."
  (cd "$LUMINARY_ROOT/app" && npm run dev) &
  success "App restarted at http://localhost:4174"
}

# Start only the API server (useful for testing backend in isolation).
start_api() {
  cd "$LUMINARY_ROOT/api"
  npm run start:dev
}

# ============================================================
# DATABASE RESET & MAINTENANCE
# ============================================================

# Delete, recreate, and reseed the CouchDB database.
# This is useful for testing and cleaning up corrupted/stale data.
# Requires CouchDB to be running and credentials from .env file.
reset_database() {
  local env_file="$LUMINARY_ROOT/api/.env"
  if [[ ! -f "$env_file" ]]; then
    error ".env file not found in API folder. Cannot reset database."
    exit 1
  fi

  local db_name
  db_name=$(grep -E '^DB_DATABASE=' "$env_file" | cut -d '=' -f2 || echo "luminary_db")
  info "Resetting CouchDB database: $db_name"

  # Extract credentials from .env or use defaults
  local user="${LUMINARY_COUCHDB_USER:-admin}"
  local pass="${LUMINARY_COUCHDB_PASSWORD:-yourpassword}"
  local url="http://localhost:5984/$db_name"

  # Delete existing database if it exists
  if curl -s -f -u "$user:$pass" "$url" >/dev/null 2>&1; then
    info "Deleting existing database..."
    curl -s -X DELETE -u "$user:$pass" "$url"
    success "Database deleted."
  else
    warn "Database does not exist or is unreachable. Skipping delete."
  fi

  # Recreate database
  info "Creating new database..."
  curl -s -X PUT -u "$user:$pass" "$url"
  success "Database recreated."

  # Reseed with initial data
  info "Seeding database with initial data..."
  cd "$LUMINARY_ROOT/api"
  npm run seed
  success "Database reseeded successfully."
}

# ============================================================
# HELP & USAGE
# ============================================================

usage() {
  cat <<EOF
Luminary CLI - Setup & Management Tool
========================================

COMMANDS:

  setup               Complete setup: prerequisites, environment, git hooks,
                      database services, and project builds

  start               Start all services (API, CMS, App)
  restart             Restart all services
  
  restart-api         Restart only the API server
  restart-cms         Restart only the CMS frontend
  restart-app         Restart only the App frontend
  
  start-api           Start only the API server (blocking)
  
  reset-db            Delete, recreate, and reseed the CouchDB database
                      (requires CouchDB to be running)

ENVIRONMENT VARIABLES (optional):

  LUMINARY_ROOT                 Override the project root directory
  LUMINARY_COUCHDB_USER         CouchDB admin username (default: admin)
  LUMINARY_COUCHDB_PASSWORD     CouchDB admin password (default: yourpassword)
  LUMINARY_MINIO_ROOT_USER      MinIO root user (default: minio)
  LUMINARY_MINIO_ROOT_PASSWORD  MinIO root password (default: minio123)

EXAMPLES:

  # Full setup from scratch
  ./scripts/automate-luminary.sh setup

  # Restart backend after code changes
  ./scripts/automate-luminary.sh restart-api

  # Reset database and reseed
  ./scripts/automate-luminary.sh reset-db

EOF
}

# ============================================================
# MAIN ENTRY POINT
# ============================================================

main() {
  case "${1:-}" in
    setup)
      info "Starting Luminary setup wizard..."
      check_node
      check_docker || warn "Docker not available; will offer native setup alternatives"
      check_ports
      
      echo ""
      read -rp "Would you like to set up CouchDB and MinIO? (y/n): " -n 1 -r
      echo ""
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        prompt_service_credentials
        if check_docker; then
          read -rp "Use Docker for databases (recommended)? (y/n): " -n 1 -r
          echo ""
          if [[ $REPLY =~ ^[Yy]$ ]]; then
            setup_couchdb_docker
            setup_minio_docker
            install_minio_client
          else
            setup_couchdb_native
            setup_minio_native
            install_minio_client
          fi
        else
          warn "Using native installation (Docker not available)..."
          setup_couchdb_native
          setup_minio_native
          install_minio_client
        fi
      fi

      # Environment setup for all subprojects
      for project in api cms app; do
        setup_env_wizard "$project"
      done

      setup_git_hooks
      setup_projects
      
      success "Luminary setup complete!"
      info "Next steps:"
      info "  1. Verify .env files in api/, cms/, and app/ folders"
      info "  2. Run './scripts/automate-luminary.sh start' to launch services"
      info "  3. Access: API (3000), CMS (4175), App (4174)"
      ;;

    start)
      start_all
      ;;

    restart)
      restart_all
      ;;

    restart-api)
      restart_api
      ;;

    restart-cms)
      restart_cms
      ;;

    restart-app)
      restart_app
      ;;

    start-api)
      start_api
      ;;

    reset-db)
      reset_database
      ;;

    *)
      usage
      ;;
  esac
}

main "$@"
