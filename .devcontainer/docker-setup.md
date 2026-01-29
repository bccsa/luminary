# Docker Development Setup

Run Luminary with Docker — works on Windows, Mac, and Linux.

## Quick Start (Using Setup Wizard)

The easiest way to get started is using the setup wizard inside the dev container:

```bash
# 1. Open in VS Code
cd luminary
code .

# 2. Click "Reopen in Container" when prompted
# Wait for container to start (~2-3 minutes first time)

# 3. Run the setup wizard (in VS Code terminal inside container)
cd .devcontainer
node setup-wizard.js
```

**First run takes 2-3 minutes** — Docker builds containers and installs dependencies.

### Access Points

| Service       | URL                           | Credentials             |
| ------------- | ----------------------------- | ----------------------- |
| App           | http://localhost:4174         | (Auth0 login)           |
| CMS           | http://localhost:4175         | (Auth0 login)           |
| API           | http://localhost:3000         | -                       |
| CouchDB Admin | http://localhost:5984/\_utils | admin / password        |
| MinIO Console | http://localhost:9001         | minioadmin / minioadmin |

---

## Manual Setup (Without Wizard)

If you prefer to configure manually:

```bash
# 1. Copy environment file
cp .devcontainer/.env.example .devcontainer/.env

# 2. Edit .devcontainer/.env and fill in Auth0 values (see Auth0 Setup below)

# 3. Start Docker services
docker compose -f .devcontainer/docker-compose.yml up --build
```

---

## Auth0 Setup

You need an Auth0 account. Free tier works fine.

### 1. Create Application

1. Go to **Auth0 Dashboard** → **Applications** → **Create Application**
2. Choose "Single Page Application"
3. Note the **Client ID** and **Domain** → add to `.env` as `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_DOMAIN`

### 2. Get JWT Certificate

1. Go to **Applications** → your app → **Settings**
2. Scroll to **Advanced Settings** → **Certificates**
3. **Download Certificate (PEM)**
4. Copy the entire certificate content (including `BEGIN/END CERTIFICATE` lines) → add to `LUMINARY_JWT_CERTIFICATE` in `.env`

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
