# Luminary Docker Development Environment

Welcome to Luminary! This guide explains the Docker development setup.

## 🚀 Quick Start

### Prerequisites

- Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))
- VS Code with **Dev Containers** extension ([Install](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers))
- Auth0 account and credentials

### Setup Steps

1. **Run the setup wizard**

   ```bash
   cd luminary/.devcontainer
   node setup-wizard.js
   ```

   The wizard will ask for:
   - Auth0 Domain (e.g., `yourapp.auth0.com`)
   - Auth0 Client ID
   - Auth0 API Audience
   - Auth0 Certificate (PEM format)

   Database and storage are automatically configured!

2. **Open in VS Code**

   ```bash
   cd luminary
   code .
   ```

3. **Reopen in Container**
   - VS Code will prompt: "Reopen in Container"
   - Click **"Reopen in Container"**
   - Or use Command Palette (Cmd+Shift+P) → "Dev Containers: Reopen in Container"

4. **Wait for initialization** (~2-3 minutes first run)
   - Docker containers start automatically
   - Dependencies install
   - Services become available

5. **Access your applications**
   - **App**: http://localhost:4174
   - **CMS**: http://localhost:4175
   - **API**: http://localhost:3000
   - **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
   - **CouchDB**: http://localhost:5984/\_utils (admin/password)

## 🛠️ What's Included

### Docker Services

- **CouchDB** (Database) - Credentials: `admin/password`
- **MinIO** (S3-compatible storage) - Credentials: `minioadmin/minioadmin`
- **Dev Container** - Your development environment with Node.js

### Pre-configured

- Database connection to CouchDB
- S3 storage with automatic bucket creation
- Hot reload for App, CMS, and API
- Debug ports exposed

VS Code's Dev Container runs:

- **App** (Vue 3 frontend) - Main application
- **CMS** (Vue 3 frontend) - Content management system
- Node.js dev servers for both

### What Runs Separately (but Connected)?

Docker Compose also starts:

- **API** (NestJS backend) - Runs in its own container, NOT indexed by VS Code
- **CouchDB** - Database
- **MinIO** - S3-compatible file storage

**Why this architecture?**

- ✅ **Fast VS Code IntelliSense** - Only indexes app/cms (2 projects, not 6)
- ✅ **Low RAM usage** - Skips indexing API, shared lib, docs (saves 2-3GB RAM)
- ✅ **Quick startup** - 4-5 minutes instead of 8-12 minutes
- ✅ **Shared library auto-rebuild** - Rebuilt on branch switches via git hook

### Resource Usage

| Profile         | Startup Time | RAM  | Disk  | Best For                         |
| --------------- | ------------ | ---- | ----- | -------------------------------- |
| Minimal         | 2-3 min      | 2GB  | 500MB | API-only work (rare)             |
| **Recommended** | 4-5 min      | 4GB  | 1.5GB | Frontend developers (default)    |
| Full            | 8-12 min     | 6GB+ | 3GB   | Backend developers or full-stack |

## 📝 Auth0 Configuration

The setup wizard requires Auth0 credentials. Here's where to find them:

### 1. Get Your Domain

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Select your application
3. Copy the **Domain** (e.g., `yourapp.auth0.com`)

### 2. Get Client ID

1. In the same application, find **Client ID**
2. Copy it

### 3. Get API Audience

1. Go to **APIs** in the sidebar
2. Select your API
3. Copy the **Identifier** (e.g., `https://api.yourapp.com`)

### 4. Get Certificate (PEM)

1. Go to **Applications → Your App → Advanced Settings → Certificates**
2. Download the **Public Key (PEM)**
3. Copy the entire content (including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`)

During setup, paste these values when prompted. They're saved in `.devcontainer/.env` (git-ignored).

## 🔄 Switching Branches

When you switch Git branches, the **shared library is automatically rebuilt**:

```bash
git checkout feature/some-feature
# → [INFO] Shared library files changed. Rebuilding...
# → [SUCCESS] Shared library rebuilt.
```

This happens via a git `post-checkout` hook (installed during setup). Disable it by removing `.git/hooks/post-checkout` if needed.

## 📦 Available Commands

### Inside VS Code Dev Container Terminal

```bash
# Development servers (already running, watch-mode)
# App server: http://localhost:4174
# CMS server: http://localhost:4175
# Available in the integrated terminal for debugging

# Rebuild shared library
npm run build --workspace shared

# Run API tests
npm run test --workspace api

# Run app tests
npm run test --workspace app

# Run CMS tests
npm run test --workspace cms
```

### Luminary CLI (from outside container)

If you installed the `automate-luminary` script:

```bash
luminary setup              # Initial setup
luminary start              # Start API + frontend services
luminary rebuild-shared     # Rebuild shared library
luminary reset-db          # Delete & reseed database
luminary setup-git-hooks   # Install auto-rebuild hook
```

## ⚙️ Customizing Environment Variables

### Quick Changes

Edit `.devcontainer/.env` directly and restart the container:

1. File → Reopen in Container
2. VS Code will reload and pick up new env vars

### Advanced: Docker Compose Overrides

Create `.devcontainer/docker-compose.override.yml` for persistent customizations:

```yaml
services:
  api:
    environment:
      - ENCRYPTION_KEY=your-custom-key
      - IMAGE_QUALITY=90
  couchdb:
    environment:
      - COUCHDB_PASSWORD=your-secure-password
```

## 🐛 Troubleshooting

### Issue: "Permission denied" on Windows Command Prompt

**Solution**: Use the `automate-luminary` script to avoid npm permission issues on Windows.

### Issue: VS Code is slow / high CPU usage

**Troubleshooting**:

1. Check if you have 8GB+ RAM (recommended minimum)
2. Verify `files.watcherExclude` in devcontainer settings (should skip api/, shared/, docs/)
3. Try disabling extensions temporarily in Dev Container
4. Consider using the Minimal profile (API-only) if you only need backend work

### Issue: "Cannot find Auth0 credentials"

**Solution**: Auth0 variables in `.devcontainer/.env` are empty or invalid. Run setup wizard again:

```bash
# Inside container terminal
node .devcontainer/setup-wizard.js
```

### Issue: Shared library not found (yarn workspaces error)

**Solution**: Rebuild shared library:

```bash
npm ci --workspace shared
npm run build --workspace shared
```

### Issue: API not responding (localhost:3000 refuses connection)

**Solution**:

1. Check if API container is running: `docker ps | grep luminary-api`
2. View API logs: `docker logs luminary-api -f`
3. Restart container: File → Reopen in Container

### Issue: Database connection failed

**Solution**:

1. Verify CouchDB is running: `docker ps | grep couchdb`
2. Check database credentials in `.env` match docker-compose.yml
3. Reset database: `luminary reset-db` (deletes and reseeds)

## 🔗 Documentation

- **Socket.io Messages**: [docs/socket.io-messages.md](../docs/socket.io-messages.md)
- **REST API Reference**: [docs/restApi.md](../docs/restApi.md)
- **S3 Architecture**: [docs/s3-multi-bucket-architecture.md](../docs/s3-multi-bucket-architecture.md)
- **Vue Setup Guide**: [docs/setup-vue-app.md](../docs/setup-vue-app.md)

## 💡 Tips for Frontend Developers

1. **Hot reload works** - Changes to Vue files auto-refresh (4174 and 4175)
2. **Use VS Code Debugger** - Set breakpoints in .vue files (F5 to start)
3. **Inspect network calls** - Use browser DevTools (F12) to debug API calls to localhost:3000
4. **Share .env setup** - New team members run setup wizard once, then `.devcontainer/.env` has all their credentials

## 📞 Getting Help

- **Discord/Slack**: #luminary-dev channel
- **GitHub Issues**: [bccsa/luminary/issues](https://github.com/bccsa/luminary/issues)
- **Pair Programming**: Ask in team chat for debugging help

---

**Last Updated**: January 2026  
**Docker Dev Container Version**: 1.0
