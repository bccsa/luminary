<img src="https://github.com/bccsa/luminary/blob/main/logo.svg?raw=true" width="200" style="margin-bottom: 10px;">

Offline-first content platform consisting of an API, CMS and web app.

![API](https://github.com/bccsa/luminary/actions/workflows/api-unit-tests.yml/badge.svg) ![Shared library](https://github.com/bccsa/luminary/actions/workflows/shared-unit-tests.yml/badge.svg) ![CMS](https://github.com/bccsa/luminary/actions/workflows/cms-unit-tests.yml/badge.svg) ![App](https://github.com/bccsa/luminary/actions/workflows/app-unit-tests.yml/badge.svg)

## Name

lu·​mi·​nary - ˈlü-mə-ˌner-ē

1. a person of prominence or brilliant achievement
2. a body that gives light

## Folder structure

- `api`: API layer over CouchDB
- `app`: Web and native frontend app
- `cms`: Backend CMS for managing content
- `shared`: Shared library used by the CMS and app
- `docs`: Documentation, including ADRs

## Architectural Decision Records

We record our decisions in the `docs/adr` folder. See the [first ADR](./docs/adr/0001-record-architecture-decisions.md) for more information on this process. You can install [adr-tools](https://github.com/npryce/adr-tools) to manage ADRs locally, such as creating one with this command:

```sh
adr new Branching strategy
```

## Getting Started

### � Quick Start Checklist

Before you begin, make sure you have:

- [ ] Docker Desktop installed AND running (see the Docker icon in your system tray)
- [ ] VS Code installed with Dev Containers extension
- [ ] Auth0 account created (free tier works - sign up at https://auth0.com)
- [ ] 10-15 minutes for first-time setup

**⚠️ IMPORTANT:** If you skip any prerequisite above, setup WILL fail!

---

### 🐳 Docker Development Setup (5 Steps)

**Works on Windows, macOS, and Linux**

#### Prerequisites (DO THIS FIRST!)

1. **Install Docker Desktop**
   - Download: https://www.docker.com/products/docker-desktop
   - **CRITICAL:** Open Docker Desktop and wait until it says "Engine running"
   - On Windows: Enable WSL 2 backend in Settings for best performance

2. **Install VS Code + Extension**
   - Download VS Code: https://code.visualstudio.com/
   - Install "Dev Containers" extension: https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers
   - **Verify:** Click the green button in bottom-left corner of VS Code - you should see container options

3. **Get Auth0 Credentials** (takes 5 minutes)

   Go to https://manage.auth0.com/dashboard and:

   **a) Create Application:**
   - Applications → Create Application → "Single Page Application"
   - Save these from the Settings tab:
     - **Domain** (looks like: `yourapp.auth0.com` or `yourapp.us.auth0.com`)
     - **Client ID** (long alphanumeric string)

   **b) Create API:**
   - Applications → APIs → Create API
   - Give it any name (e.g., "Luminary API")
   - Save the **Identifier** - this is your **API Audience** (looks like: `https://api.yourapp.com`)

   **c) Download Certificate:**
   - Applications → Your App → Settings → Advanced Settings → Certificates
   - Click **"Download Certificate"** and choose **"PEM"** format
   - Open the downloaded `.pem` file in a text editor - you'll paste this later

   **d) Configure URLs** (CRITICAL - auth won't work without this!)
   - In your Auth0 Application Settings, add these EXACTLY:
   - **Allowed Callback URLs:** `http://localhost:4174, http://localhost:4175`
   - **Allowed Logout URLs:** `http://localhost:4174, http://localhost:4175`
   - **Allowed Web Origins:** `http://localhost:4174, http://localhost:4175`
   - Click **"Save Changes"** at the bottom

   ✅ **You should now have:** Domain, Client ID, API Audience, and Certificate file content

---

#### Step-by-Step Setup

**Step 1: Clone and Open Repository**

```bash
git clone https://github.com/bccsa/luminary.git
cd luminary
code .
```

**What happens:** VS Code opens the project folder.

---

**Step 2: Reopen in Container** ⚠️ **CRITICAL STEP**

VS Code will show a popup: **"Reopen in Container"**

- Click it immediately
- If you missed it: Press `F1` → Type "Reopen in Container" → Press Enter

**What happens:**

- Docker builds the dev container (2-4 minutes first time)
- You'll see "Starting Dev Container" in bottom-right
- Wait until you see "Dev Container: Luminary" in bottom-left corner
- **DO NOT PROCEED** until you see this!

**Troubleshooting:**

- No popup? Make sure Docker Desktop is running!
- Build fails? Check Docker has enough disk space (need ~5GB free)

---

**Step 3: Run Setup Wizard** (Inside the Container Terminal!)

⚠️ **IMPORTANT:** Make sure you're in the VS Code terminal INSIDE the container (you should see `root@[container-id]` in the prompt)

```bash
cd .devcontainer
node setup-wizard.js
```

**What you'll be asked:**

1. **Auth0 Domain** - Paste it (e.g., `yourapp.auth0.com`)
2. **Auth0 Client ID** - Paste it
3. **Auth0 API Audience** - Paste it
4. **Auth0 Certificate** - Open your `.pem` file, copy EVERYTHING including the `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----` lines, paste it, then press **Enter twice**
5. **Build shared library now?** - Type `y` (required for first run)

**What happens automatically:**

- ✅ Creates `.env` configuration file
- ✅ Installs git post-checkout hook (auto-rebuilds shared library on branch switch)
- ✅ Builds shared library if you chose 'y'

**Expected output:**

```
✓ Running inside dev container
✓ Configuration saved
✓ Git post-checkout hook installed
✓ Shared library built successfully
```

**If something fails:**

- Certificate error? Make sure you copied the ENTIRE file including BEGIN/END lines
- Build error? Run `luminary-dev install` manually (see Step 4)

---

**Step 4: Install Dependencies**

```bash
luminary-dev install
```

**What happens:** Installs npm packages for api, app, cms, shared (~2-3 minutes)

**Expected output:**

```
ℹ Installing all dependencies...
ℹ Installing shared...
ℹ Installing app...
ℹ Installing cms...
ℹ Installing api...
✓ All dependencies installed
```

---

**Step 5: Start Services**

Open **3 separate terminals** in VS Code (Terminal → New Terminal):

**Terminal 1 - API:**

```bash
luminary-dev start api
```

**Terminal 2 - App:**

```bash
luminary-dev start app
```

**Terminal 3 - CMS:**

```bash
luminary-dev start cms
```

**What happens:** Each service starts and shows compilation/startup logs

**Expected output:**

- API: `Nest application successfully started`
- App: `Local: http://localhost:4174/`
- CMS: `Local: http://localhost:4175/`

⚠️ **Wait until all 3 show "ready" before testing!**

---

#### ✅ Verify Everything Works

Open these URLs in your browser:

| Service     | URL                           | What You Should See                        |
| ----------- | ----------------------------- | ------------------------------------------ |
| **App**     | http://localhost:4174         | Auth0 login screen                         |
| **CMS**     | http://localhost:4175         | Auth0 login screen                         |
| **API**     | http://localhost:3000         | JSON response `{"status":"ok"}` or similar |
| **MinIO**   | http://localhost:9001         | MinIO login (minioadmin/minioadmin)        |
| **CouchDB** | http://localhost:5984/\_utils | Fauxton UI (admin/password)                |

**Test Login:**

1. Go to http://localhost:4174
2. Click login - should redirect to Auth0
3. Create an account or log in
4. Should redirect back to the app

🎉 **If all the above works, you're done!**

---

#### 🆘 Troubleshooting

**"Container failed to start"**

- Docker Desktop running? Check the system tray icon
- Enough disk space? Need ~5GB free
- Restart Docker Desktop and try again

**"Auth0 login fails with 'callback mismatch'"**

- Did you add callback URLs in Auth0 dashboard? (See Step 3d in Prerequisites)
- Did you save changes in Auth0 dashboard?
- URLs must be EXACTLY: `http://localhost:4174, http://localhost:4175`

**"Cannot connect to database"**

- Wait 30 seconds for CouchDB to fully start
- Check: http://localhost:5984/\_utils (should show Fauxton UI)
- Still broken? Run: `docker restart luminary-couchdb-1`

**"Port already in use"**

- Something else using port 4174, 4175, or 3000?
- Stop other dev servers or change ports in code

**"Shared library build failed"**

- Make sure you ran `luminary-dev install` first
- Try manually: `cd /workspace/shared && npm ci && npm run build`

**Still stuck?**

- Check [.devcontainer/SETUP_GUIDE.md](./.devcontainer/SETUP_GUIDE.md) for detailed troubleshooting
- Run `luminary-dev status` to see what's running
- Check logs in the terminal windows

---

#### 📖 Additional Resources

**Helper Commands:**

```bash
luminary-dev help          # Show all commands
luminary-dev status        # Check what's running
luminary-dev reset-db      # Reset database
luminary-dev build-shared  # Rebuild shared library
```

**Documentation:**

- [Complete Setup Guide](./.devcontainer/SETUP_GUIDE.md) - Detailed instructions with screenshots
- [Architecture Details](./.devcontainer/README.md) - How the Docker setup works
- [Helper Script Reference](./.devcontainer/SETUP_GUIDE.md#-common-commands) - All luminary-dev commands

---

### 💻 Manual Local Setup

For developers who prefer running services locally without Docker.

For Visual Studio Code users, `./.vscode/launch.json` includes debug configurations for the API, CMS and reference App.

### API

See the [API readme](./api/README.md)

### CMS

See the [CMS readme](./cms/README.md)

### App

See the [App readme](./app/README.md)

### Shared library

See the [Shared readme](./shared/README.md)

### Project automation

See the [Project automation readme](./docs/project-addons/automation/project-automation.md)
