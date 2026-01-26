# Docker Development Setup

Run Luminary with Docker — works on Windows, Mac, and Linux.

## Quick Start

```bash
# 1. Copy environment file
cp .devcontainer/.env.example .devcontainer/.env

# 2. Fill in Auth0 values in .devcontainer/.env (see Auth0 Setup below)

# 3. Start everything
docker compose -f .devcontainer/docker-compose.yml up --build
```

**First run takes a few minutes** — it installs dependencies and seeds the database.

### Access Points

| Service | URL                           |
| ------- | ----------------------------- |
| App     | http://localhost:4174         |
| CMS     | http://localhost:4175         |
| API     | http://localhost:3000         |
| CouchDB | http://localhost:5984/\_utils |
| MinIO   | http://localhost:9001         |

> **Credentials:** CouchDB: `admin` / `password` • MinIO: `minioadmin` / `minioadmin`

---

## Auth0 Setup

You need an Auth0 account. Free tier works fine.

### 1. Create Application

1. Go to **Auth0 Dashboard** → **Applications** → **Create Application**
2. Choose "Single Page Application"
3. Note the **Client ID** and **Domain** → add to `.env`

### 2. Get JWT Secret

1. Go to **Applications** → your app → **Settings**
2. Scroll to **Advanced Settings** → **Certificates**
3. **Download Certificate (PEM)**
4. Copy the entire certificate content (including `BEGIN/END CERTIFICATE` lines) → add to `JWT_SECRET` in `.env`

### 3. Configure Callback URLs

In **Applications** → your app → **Settings**:

| Field                 | Value                                          |
| --------------------- | ---------------------------------------------- |
| Allowed Callback URLs | `http://localhost:4174, http://localhost:4175` |
| Allowed Logout URLs   | `http://localhost:4174, http://localhost:4175` |
| Allowed Web Origins   | `http://localhost:4174, http://localhost:4175` |

### 4. Create API

1. Go to **APIs** → **Create API**
2. Set identifier (e.g., `https://luminary-dev.com/api`)
3. Copy the identifier → add to `VITE_AUTH0_AUDIENCE` in `.env`

### 5. Add Auth0 Action (Required for JWT Mappings)

This adds user metadata to the JWT token.

1. Go to **Actions** → **Library** → **Build Custom**
2. Name: `Add Luminary Metadata`
3. Trigger: **Login / Post Login**
4. Paste this code:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://luminary-dev.com/metadata";

  api.accessToken.setCustomClaim(namespace, {
    userId: event.user.user_id,
    email: event.user.email,
    username: event.user.name || event.user.nickname,
  });
};
```

5. **Deploy** the action
6. Go to **Actions** → **Triggers** → **post-login**
7. Drag your action into the flow and **Apply**

---

## VS Code Dev Container

For integrated development with VS Code:

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Open this folder in VS Code
3. Click "Reopen in Container" when prompted

---

## Custom Environment Variables

### Option 1: Edit `.env` file (Recommended)

Add any variable to `.devcontainer/.env`:

```bash
# Your custom values
MY_CUSTOM_VAR=my-value
JWT_SECRET="your-secret-here"
```

### Option 2: Command line

Pass variables when starting:

```bash
JWT_SECRET="my-secret" docker compose -f .devcontainer/docker-compose.yml up
```

### Option 3: Per-service overrides

Create a `docker-compose.override.yml` in `.devcontainer/`:

```yaml
services:
  api:
    environment:
      - MY_CUSTOM_VAR=my-value
      - ANOTHER_VAR=another-value
```

Docker Compose automatically merges this with `docker-compose.yml`.

---

## Common Commands

```bash
# Stop everything
docker compose -f .devcontainer/docker-compose.yml down

# Reset everything (delete all data)
docker compose -f .devcontainer/docker-compose.yml down -v

# View logs
docker compose -f .devcontainer/docker-compose.yml logs -f api

# Rebuild after Dockerfile changes
docker compose -f .devcontainer/docker-compose.yml up --build
```

---

## Troubleshooting

**Port already in use?**  
Stop any local instances of the API/app/CMS first.

**Dependencies not installing?**  
Delete volumes and rebuild: `docker compose -f .devcontainer/docker-compose.yml down -v && docker compose -f .devcontainer/docker-compose.yml up --build`

**Shared library changes not reflected?**  
Restart the containers: `docker compose -f .devcontainer/docker-compose.yml restart`
