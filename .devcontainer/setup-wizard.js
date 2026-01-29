#!/usr/bin/env node

/**
 * Luminary Docker Dev Environment Setup Wizard
 *
 * Simple setup wizard that configures Auth0 credentials.
 * Database (CouchDB) and Storage (MinIO) are pre-configured by Docker.
 *
 * Usage:
 *   node setup-wizard.js          Run the interactive setup
 *   node setup-wizard.js --help   Show this help message
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Check for help flag
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
\x1b[1;36mLuminary Docker Dev Environment Setup Wizard\x1b[0m

\x1b[1mUsage:\x1b[0m
  node setup-wizard.js          Run the interactive setup
  node setup-wizard.js --help   Show this help message

\x1b[1mWhat this wizard does:\x1b[0m
  • Prompts for Auth0 credentials (required)
  • Auto-configures CouchDB database (admin/password)
  • Auto-configures MinIO storage (minioadmin/minioadmin)
  • Creates .env file in .devcontainer/

\x1b[1mPrerequisites:\x1b[0m
  • Docker Desktop installed and running
  • Auth0 account with application credentials
  • Get credentials from: https://manage.auth0.com/

\x1b[1mYou'll need:\x1b[0m
  • Auth0 Domain (e.g., yourapp.auth0.com)
  • Auth0 Client ID
  • Auth0 API Audience
  • Auth0 Certificate (PEM format)

\x1b[1mNext steps after setup:\x1b[0m
  1. Open project in VS Code: code .
  2. Click "Reopen in Container" when prompted
  3. Wait ~2-3 minutes for startup
  4. Access: http://localhost:4174 (App) and http://localhost:4175 (CMS)

\x1b[1mMore info:\x1b[0m
  • Full guide: .devcontainer/SETUP_GUIDE.md
  • Architecture: .devcontainer/README.md
  • Main README: ../README.md
`);
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// --- Helper Functions ---
const log = {
  info: (msg) => console.log(`\x1b[34mℹ\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`),
  section: (msg) => console.log(`\n\x1b[1;36m${msg}\x1b[0m`),
};

const prompt = (question) =>
  new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });

const findLuminayRoot = () => {
  let dir = process.cwd();
  let prevDir = null;

  // Loop until we reach the filesystem root (works on Windows and Unix)
  while (dir !== prevDir) {
    if (
      fs.existsSync(path.join(dir, ".git")) &&
      fs.existsSync(path.join(dir, ".devcontainer"))
    ) {
      return dir;
    }
    prevDir = dir;
    dir = path.dirname(dir);
  }

  log.error("Could not find Luminary root directory");
  log.info("Make sure you run this script from within the luminary repository");
  process.exit(1);
};

const checkRequirements = () => {
  // Check if we're running inside a container (has /.dockerenv or /run/.containerenv)
  const isInContainer =
    fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv");

  if (isInContainer) {
    log.success("Running inside dev container");
    return;
  }

  // If not in container, check if Docker is available
  try {
    const { execSync } = require("child_process");
    execSync("docker --version", { stdio: "ignore" });
    log.warn(
      "Docker is available, but you should run this inside the dev container",
    );
    log.info("Open VS Code and click 'Reopen in Container' first");
  } catch {
    log.error("Docker is not installed or not in PATH");
    log.info(
      "Install Docker Desktop: https://www.docker.com/products/docker-desktop",
    );
    process.exit(1);
  }
};

// --- Main Setup ---
const setupAuth0 = async () => {
  log.section("═══ Luminary Dev Environment Setup ═══");
  console.log("\nThis wizard will configure your Auth0 credentials.");
  console.log("Database and storage are automatically configured by Docker.\n");

  log.info("Get your Auth0 credentials from: https://manage.auth0.com/\n");

  const auth0Domain = await prompt("Auth0 Domain (e.g., yourapp.auth0.com): ");
  const auth0ClientId = await prompt("Auth0 Client ID: ");
  const auth0Audience = await prompt("Auth0 API Audience: ");

  console.log("\n");
  log.info("Paste your Auth0 Certificate (PEM format).");
  log.info("Press Enter twice when done:\n");

  let certificate = "";
  let emptyLineCount = 0;

  while (emptyLineCount < 2) {
    const line = await prompt("");
    if (line === "") {
      emptyLineCount++;
    } else {
      emptyLineCount = 0;
      certificate += line + "\n";
    }
  }

  if (!auth0Domain || !auth0ClientId || !auth0Audience || !certificate.trim()) {
    log.error("All Auth0 fields are required!");
    process.exit(1);
  }

  return {
    VITE_AUTH0_DOMAIN: auth0Domain,
    VITE_AUTH0_CLIENT_ID: auth0ClientId,
    VITE_AUTH0_AUDIENCE: auth0Audience,
    LUMINARY_JWT_CERTIFICATE: certificate.trim(),

    // Docker defaults (matches docker-compose.yml)
    COUCHDB_USER: "admin",
    COUCHDB_PASSWORD: "password",
    MINIO_ROOT_USER: "minioadmin",
    MINIO_ROOT_PASSWORD: "minioadmin",
    VITE_API_URL: "http://localhost:3000",
    API_PORT: "3000",
    DB_CONNECTION_STRING: "http://admin:password@couchdb:5984",
    DB_DATABASE: "luminary-local",
    S3_ENDPOINT: "minio",
    S3_PORT: "9000",
    S3_USE_SSL: "false",
    S3_ACCESS_KEY: "minioadmin",
    S3_SECRET_KEY: "minioadmin",
    S3_IMG_BUCKET: "luminary",
    DEV: "true",
  };
};

// --- Write .env File ---
const writeEnvFile = (envPath, config) => {
  const lines = [];

  lines.push("# Auth0 Configuration");
  lines.push(`VITE_AUTH0_DOMAIN=${config.VITE_AUTH0_DOMAIN}`);
  lines.push(`VITE_AUTH0_CLIENT_ID=${config.VITE_AUTH0_CLIENT_ID}`);
  lines.push(`VITE_AUTH0_AUDIENCE=${config.VITE_AUTH0_AUDIENCE}`);
  lines.push(`LUMINARY_JWT_CERTIFICATE=${config.LUMINARY_JWT_CERTIFICATE}`);
  lines.push("");

  lines.push("# Database (CouchDB) - Auto-configured by Docker");
  lines.push(`COUCHDB_USER=${config.COUCHDB_USER}`);
  lines.push(`COUCHDB_PASSWORD=${config.COUCHDB_PASSWORD}`);
  lines.push(`DB_CONNECTION_STRING=${config.DB_CONNECTION_STRING}`);
  lines.push(`DB_DATABASE=${config.DB_DATABASE}`);
  lines.push("");

  lines.push("# Storage (MinIO/S3) - Auto-configured by Docker");
  lines.push(`S3_ENDPOINT=${config.S3_ENDPOINT}`);
  lines.push(`S3_PORT=${config.S3_PORT}`);
  lines.push(`S3_USE_SSL=${config.S3_USE_SSL}`);
  lines.push(`S3_ACCESS_KEY=${config.S3_ACCESS_KEY}`);
  lines.push(`S3_SECRET_KEY=${config.S3_SECRET_KEY}`);
  lines.push(`S3_IMG_BUCKET=${config.S3_IMG_BUCKET}`);
  lines.push("");

  lines.push("# API Configuration");
  lines.push(`API_PORT=${config.API_PORT}`);
  lines.push(`VITE_API_URL=${config.VITE_API_URL}`);
  lines.push(`DEV=${config.DEV}`);

  fs.writeFileSync(envPath, lines.join("\n") + "\n");
  log.success(`Configuration saved to: ${envPath}`);
};

// --- Setup Git Hooks ---
const setupGitHooks = (luminayRoot) => {
  log.info("Setting up git post-checkout hook...");

  const gitDir = path.join(luminayRoot, ".git");
  const hooksDir = path.join(gitDir, "hooks");

  if (!fs.existsSync(gitDir)) {
    log.warn("Not a git repository. Skipping git hooks.");
    return false;
  }

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const postCheckoutHook = path.join(hooksDir, "post-checkout");
  const hookContent = `#!/bin/bash
# Post-checkout hook: Rebuild shared library when branch changes
set -euo pipefail

LUMINARY_ROOT="$(git rev-parse --show-toplevel)"

if git diff-tree -r HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "^shared/"; then
  echo "[INFO] Shared library files changed. Rebuilding..."
  cd "$LUMINARY_ROOT/shared"
  npm ci > /dev/null 2>&1 && npm run build > /dev/null 2>&1 && echo "[SUCCESS] Shared library rebuilt." || echo "[WARN] Failed to rebuild shared library."
fi

exit 0
`;

  fs.writeFileSync(postCheckoutHook, hookContent);
  fs.chmodSync(postCheckoutHook, "755");

  log.success("Git post-checkout hook installed");
  return true;
};

// --- Build Shared Library ---
const buildSharedLibrary = async (luminayRoot) => {
  console.log("");
  log.section("Shared Library Setup");
  console.log("Would you like to build the shared library now?");
  console.log("This is required for the app and CMS to work properly.\n");

  const answer = await prompt("Build shared library? (y/n): ");

  if (!answer.toLowerCase().startsWith("y")) {
    log.warn("Skipping shared library build");
    log.warn("You'll need to build it later with: cd shared && npm run build");
    return;
  }

  try {
    const { execSync } = require("child_process");

    log.info("Building shared library...");
    const sharedDir = path.join(luminayRoot, "shared");

    execSync("npm ci", {
      cwd: sharedDir,
      stdio: "inherit",
    });

    execSync("npm run build", {
      cwd: sharedDir,
      stdio: "inherit",
    });

    log.success("Shared library built successfully");
  } catch (error) {
    log.error("Failed to build shared library");
    log.info(
      "You can build it manually later with: cd shared && npm run build",
    );
  }
};

// --- Main Execution ---
const main = async () => {
  try {
    console.clear();
    checkRequirements();

    const luminayRoot = findLuminayRoot();
    const config = await setupAuth0();

    const envPath = path.join(luminayRoot, ".devcontainer", ".env");
    writeEnvFile(envPath, config);

    // Automatic setup steps
    console.log("");
    setupGitHooks(luminayRoot);
    await buildSharedLibrary(luminayRoot);

    // Success summary
    log.section("═══ Setup Complete! ═══");
    console.log("");
    log.success("Environment configured successfully");
    log.info("Database: CouchDB (admin/password)");
    log.info("Storage: MinIO (minioadmin/minioadmin)");
    log.info("Git hooks: Installed (auto-rebuilds shared library)");
    console.log("");
    console.log("\x1b[1mNext steps:\x1b[0m");
    console.log("  1. Install dependencies:");
    console.log("     cd /workspace/app && npm ci");
    console.log("     cd /workspace/cms && npm ci");
    console.log("     cd /workspace/api && npm ci");
    console.log("");
    console.log("  2. Start your services:");
    console.log("     cd /workspace/app && npm run dev");
    console.log("     cd /workspace/cms && npm run dev");
    console.log("     cd /workspace/api && npm run start:dev");
    console.log("");
    console.log("\x1b[1mAccess your services:\x1b[0m");
    console.log("  • App:     http://localhost:4174");
    console.log("  • CMS:     http://localhost:4175");
    console.log("  • API:     http://localhost:3000");
    console.log("  • MinIO:   http://localhost:9001 (minioadmin/minioadmin)");
    console.log("  • CouchDB: http://localhost:5984/_utils (admin/password)");
    console.log("");

    rl.close();
  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    rl.close();
    process.exit(1);
  }
};

main();
