# Luminary Setup Quick Reference

> **Platform Support:** Works on Windows, macOS, and Linux

## 🎯 One-Time Setup

### Step 1: Install Prerequisites

- ✅ [Docker Desktop](https://www.docker.com/products/docker-desktop) (required - Windows, Mac, or Linux)
- ✅ [VS Code](https://code.visualstudio.com/) with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- ✅ [Auth0 Account](https://auth0.com/) (free tier works)

> **Note:** No need to install Node.js on your machine! The setup wizard runs inside the Docker container.

### Step 2: Get Auth0 Credentials

1. **Create Auth0 Application**
   - Go to: https://manage.auth0.com/dashboard
   - Applications → Create Application → Single Page Application
   - Save these values:
     - **Domain** (e.g., `yourapp.auth0.com`)
     - **Client ID** (from Settings tab)

2. **Create Auth0 API**
   - Applications → APIs → Create API
   - Save the **API Audience** (e.g., `https://api.yourapp.com`)

3. **Download Certificate**
   - Applications → Your App → Settings → Advanced Settings → Certificates
   - Download Certificate (PEM format)
   - You'll paste this during setup

4. **Configure URLs** (IMPORTANT!)
   - In your Auth0 Application Settings, add:
   - **Allowed Callback URLs**: `http://localhost:4174, http://localhost:4175`
   - **Allowed Logout URLs**: `http://localhost:4174, http://localhost:4175`
   - **Allowed Web Origins**: `http://localhost:4174, http://localhost:4175`
   - Click **Save Changes**

### Step 3: Run Setup Wizard

**On Mac/Linux:**

```bash
cd luminary/.devcontainer
node setup-wizard.js
```

**On Windows (Command Prompt or PowerShell):**

### Step 3: Open in VS Code

```bash
cd luminary
code .
```

Click **"Reopen in Container"** when VS Code prompts you. Wait for the container to build and start (~2-3 minutes first time).

### Step 4: Run Setup Wizard (Inside Container)

Once the dev container is open, open a terminal in VS Code and run:

```bash
cd .devcontainer
node setup-wizard.js
```

The wizard will:

- Prompt for Auth0 credentials and create `.env` file
- **Automatically install git post-checkout hook** (auto-rebuilds shared library on branch switch)
- Optionally build the shared library now

> **Tip:** Run `node setup-wizard.js --help` to see all options

### Step 5: Start Your Services

After the wizard completes, you can start the development servers:

- Docker containers starting
- Dependencies installing
- Services becoming ready

---

## 🌐 Access Your Development Environment

Once setup completes, open these URLs:

| What                | URL                           | Login                   |
| ------------------- | ----------------------------- | ----------------------- |
| **App** (Frontend)  | http://localhost:4174         | Use Auth0               |
| **CMS** (Admin)     | http://localhost:4175         | Use Auth0               |
| **API** (Backend)   | http://localhost:3000         | (automatic)             |
| **MinIO** (Storage) | http://localhost:9001         | minioadmin / minioadmin |
| **CouchDB** (DB)    | http://localhost:5984/\_utils | admin / password        |

---

## 🔧 Common Commands

### Using the Helper Script

The dev container includes a `luminary-dev` helper script for common tasks:

```bash
# Install all dependencies
luminary-dev install

# Install specific project dependencies
luminary-dev install app
luminary-dev install cms

# Build shared library
luminary-dev build-shared

# Start services
luminary-dev start api
luminary-dev start app
luminary-dev start cms

# Reset and reseed database
luminary-dev reset-db

# Setup git hooks
luminary-dev setup-hooks

# Run tests
luminary-dev test
luminary-dev test api

# Check environment status
luminary-dev status

# Show help
luminary-dev help
```

### Manual Commands

```bash
# Start the App (frontend)
cd /workspace/app
npm run dev

# Start the CMS
cd /workspace/cms
npm run dev

# Start the API
cd /workspace/api
npm run start:dev

# Run tests
cd /workspace/app  # or cms, api, shared
npm test

# Build shared library
cd /workspace/shared
npm run build

# Build shared library (if you change it)
cd /workspace/shared
npm run build
```

### Outside Container (Docker Management)

```bash
# View running containers
docker ps

# View logs
docker logs luminary-dev
docker logs luminary-couchdb-1
docker logs luminary-minio-1

# Restart all services
docker compose -f .devcontainer/docker-compose.yml restart

# Stop all services
docker compose -f .devcontainer/docker-compose.yml down

# Stop and remove all data (fresh start)
docker compose -f .devcontainer/docker-compose.yml down -v
```

---

## ❓ Troubleshooting

### "Container failed to start"

- Check Docker Desktop is running
- Verify you have enough disk space (need ~5GB)
- Try: `docker compose -f .devcontainer/docker-compose.yml down -v` then rebuild

### "Auth0 login fails"

- Verify you added callback URLs in Auth0 dashboard
- Check Auth0 credentials in `.devcontainer/.env`
- Ensure certificate has BEGIN/END lines

### "Port already in use"

**Mac/Linux:**

- Check what's using the port: `lsof -i :4174`
- Stop the conflicting service or change port in docker-compose.yml

**Windows:**

- Check what's using the port: `netstat -ano | findstr :4174`
- Kill the process: `taskkill /PID <PID> /F` (replace `<PID>` with the number from previous command)

### "CouchDB connection error"

- Wait 30 seconds for CouchDB to fully start
- Check: http://localhost:5984/\_utils
- Verify credentials: `admin` / `password`

### "Files not syncing"

- In VS Code, reload window: Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows) → "Developer: Reload Window"
- Check Docker file sharing settings in Docker Desktop

### Windows-Specific Issues

**"node: command not found" or setup wizard won't run:**

- Make sure you're running the wizard **inside the dev container**, not on your host machine
- Open VS Code terminal after clicking "Reopen in Container"
- The dev container has Node.js pre-installed

**Line endings issues (Git):**

- If you see `^M` characters in files, run: `git config core.autocrlf true`
- Re-clone the repository

**Docker Desktop WSL 2 backend:**

- Recommended for best performance on Windows
- Enable in Docker Desktop → Settings → General → "Use WSL 2 based engine"

---

## 📚 Additional Resources

- [Detailed Docker Guide](./README.md)
- [Manual Setup Instructions](./docker-setup.md)
- [Architecture Decision Records](../docs/adr/)
- [API Documentation](../api/README.md)
- [App Documentation](../app/README.md)
- [CMS Documentation](../cms/README.md)

---

## 🆘 Need Help?

- Check existing [GitHub Issues](https://github.com/bccsa/luminary/issues)
- Review [Architecture Docs](../docs/)
- Ask in team chat or create a new issue

**Happy coding!** 🚀
