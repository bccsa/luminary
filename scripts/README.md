# Luminary Setup Scripts

Automated setup wizard for the Luminary project that configures your local development environment.

## 📋 Table of Contents

- [What This Does](#what-this-does)
- [Before You Start](#before-you-start)
- [Quick Start](#quick-start)
- [Getting Your Auth0 Credentials](#getting-your-auth0-credentials)
- [Environment Variables Explained](#environment-variables-explained)
- [Common Issues](#common-issues)
- [Manual Setup](#manual-setup)

## 🎯 What This Does

This script will automatically:

1. ✅ Set up CouchDB (database) and MinIO (file storage) using Docker
2. ✅ Create `.env` configuration files for the API, app, and CMS
3. ✅ Install all Node.js dependencies in the correct order
4. ✅ Set up a Git hook to keep your shared library up-to-date
5. ✅ Sync database and storage credentials automatically

**Time to complete**: 5-10 minutes

## 📦 Before You Start

Make sure you have these installed:

### Required

- **Node.js** v24.12.0 or newer - [Download here](https://nodejs.org/)
- **npm** v10+ (comes with Node.js)
- **Git** (you already have this if you cloned the project!)

### Recommended

- **Docker** - [Download here](https://www.docker.com/get-started)
  - Needed to run the database and file storage locally
  - Without Docker, you'll need to provide your own database/storage URLs

### For macOS Users

- **Homebrew** - [Install here](https://brew.sh/)
  - Used to install the MinIO client tool

### For Windows Users

- **WSL (Windows Subsystem for Linux)** - [Install guide](https://learn.microsoft.com/en-us/windows/wsl/install)
  - This script runs on Unix-based systems (Linux, macOS, WSL)

## 🚀 Quick Start

1. Open your terminal and navigate to the scripts folder:

```bash
cd luminary/scripts
```

2. Run the setup wizard:

```bash
./automate-luminary.sh setup
```

3. Follow the prompts - the wizard will ask you for:
   - Auth0 credentials (see below for where to find these)
   - JWT secret key
   - Database passwords
   - Storage passwords

That's it! The script handles everything else.

## � Getting Your Auth0 Credentials

Auth0 handles user authentication (login/logout) for Luminary. You'll need to create a free Auth0 account and set up two things: an **Application** and an **API**.

### Step 1: Create an Auth0 Account

1. Go to [auth0.com](https://auth0.com/) and sign up for a free account
2. After signing up, you'll be taken to your Auth0 Dashboard

### Step 2: Create an Application (for the frontend)

1. In your [Auth0 Dashboard](https://manage.auth0.com/), click **Applications** in the left sidebar
2. Click **Create Application**
3. Name it "Luminary" and select **Single Page Web Applications**
4. Click **Create**
5. Go to the **Settings** tab and scroll down
6. Find and copy these values (you'll need them):
   - **Domain** → This is your `AUTH0_DOMAIN` (looks like `dev-abc123.us.auth0.com`)
   - **Client ID** → This is your `AUTH0_CLIENT_ID` (a long string)
7. Scroll down to **Application URIs** and set:
   - **Allowed Callback URLs**: `http://localhost:4174, http://localhost:4175`
   - **Allowed Logout URLs**: `http://localhost:4174, http://localhost:4175`
   - **Allowed Web Origins**: `http://localhost:4174, http://localhost:4175`
8. Click **Save Changes**

### Step 3: Create an API (for the backend)

1. In your Auth0 Dashboard, click **Applications** → **APIs** in the left sidebar
2. Click **Create API**
3. Set these values:
   - **Name**: "Luminary API"
   - **Identifier**: `https://luminary-api.local` (or any unique URL - doesn't need to be real)
   - **Signing Algorithm**: Keep as RS256
4. Click **Create**
5. Copy the **Identifier** → This is your `AUTH0_AUDIENCE`

### Step 4: Get Your JWT Secret

1. In your API settings (from Step 3), click the **Test** tab
2. Scroll down to find your **Access Token** or **Certificate**
3. Copy this value → This is your `JWT_SECRET`

**That's it!** The setup wizard will ask you for these values:

- `AUTH0_DOMAIN` - From Application Settings
- `AUTH0_CLIENT_ID` - From Application Settings
- `AUTH0_AUDIENCE` - From API Identifier
- `JWT_SECRET` - From API Test tab

## 🔑 Environment Variables

The setup wizard configures environment variables across three sub-projects: **api**, **app**, and **cms**.

### API Environment Variables (`api/.env`)

#### Authentication & Security

| Va� Environment Variables Explained

The wizard will ask you for these values. Here's what each one does:

### For the App and CMS

**`VITE_AUTH0_DOMAIN`** - Your Auth0 tenant domain

- Example: `dev-abc123.us.auth0.com`
- Where to find it: Auth0 Dashboard → Applications → Your App → Settings → Domain

**`VITE_AUTH0_CLIENT_ID`** - Your application's unique ID in Auth0

- Example: A long alphanumeric string like `aBcDeFgHiJkLmNoPqRsTuVwXyZ`
- Where to find it: Same place as Domain, labeled "Client ID"

**`VITE_AUTH0_AUDIENCE`** - Your API identifier

- Example: `https://luminary-api.local`
- Where to find it: Auth0 Dashboard → Applications → APIs → Your API → Settings → Identifier

### For the API

**`JWT_SECRET`** - The secret key for verifying user tokens

- Can be single-line or multi-line
- Where to find it: Auth0 Dashboard → Applications → APIs → Your API → Test tab
- The wizard supports pasting multi-line certificates

**`ENCRYPTION_KEY`** - For encrypting sensitive data in the database

- The wizard can auto-generate this for you (recommended)
- If generated, **save it securely** - you'll need it to decrypt your data later

**`DB_CONNECTION_STRING`** - Database connection URL

- Auto-filled by the wizard using your chosen database password
- Example: `http://admin:yourpassword@127.0.0.1:5984`

**`S3_*` variables** - File storage configuration

- Auto-filled by the wizard using your MinIO credentials
- Used for storing uploaded images and files
- `4174` - App (Vite dev server)
- `4175` - CMS (Vite dev server)
- `5984` - CouchDB HTTP API
- `9000` - MinIO S3 API
- `9001` - MinIO Console UI

**Solution**:

```bash
# Find what's using a port (macOS/Linux)
lsof -i :3000

# Kill process by PID
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

###🆘 Common Issues

### "Port already in use" error

The script checks if these ports are available:

- `3000` - API server
- `4174` - App
- `4175` - CMS
- `5984` - Database
- `9000`, `9001` - File storage

**Fix**: Find and stop what's using the port:

```bash
# See what's using port 3000
lsof -i :3000

# Stop it (replace <PID> with the number shown)
kill -9 <PID>
```

### Docker containers won't start

**Fix**: Remove old containers and try again:

```bash
docker stop luminary-couchdb luminary-storage
docker rm luminary-couchdb luminary-storage
./automate-luminary.sh setup
```

### "Name or password is incorrect" when seeding database

This means your database password in the `.env` file doesn't match the Docker container.

**Fix**: The script automatically syncs these now, but if you're seeing this:

```bash
# Re-run the setup to sync credentials
./automate-luminary.sh setup
```

### Multi-line JWT secret not working

When pasting a multi-line certificate:

1. Choose "yes" when asked about multi-line input
2. Paste your entire certificate
3. Type `END` on a new line and press Enter
4. Don't add quotes or any extra characters- **MinIO/S3**: Update `S3_ENDPOINT`, `S3_PORT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` with your S3-compatible service

### Manual Dependency Installation

The recommended workflow (handled by the wizard):

````bash
# 1. Build shared library first
cd shared
npm ci
npm run build

# 2🛠️ Manual Setup

If you prefer to do things manually or the wizard doesn't work:

### 1. Install Dependencies Manually

```bash
# Build the shared library first (important!)
cd shared
npm ci
npm run build

# Install app and cms (note the --install-links flag)
cd ../app
npm ci --install-links

cd ../cms
npm ci --install-links

# Install API dependencies
cd ../api
npm ci
````

### 2. Create Environment Files

Create these three files:

- `api/.env`
- `app/.env`
- `cms/.env`

Copy the values from `.env.example` files if they exist, or use the templates in the [Environment Variables](#environment-variables-explained) section above.

### 3. Start Services with Docker

```bash
# Start database
docker run -d \
  --name luminary-couchdb \
  -p 5984:5984 \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=yourpassword \
  couchdb:latest

# Start file storage
docker run -d \
  --name luminary-storage \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minio \
  -e MINIO_ROOT_PASSWORD=minio123 \
  quay.io/minio/minio:latest server /data --console-address ":9001"
```

### 4. Install Git Hook

```bash
cp scripts/post-checkout .git/hooks/post-checkout
chmod +x .git/hooks/post-checkout
```

## 📚 Learn More

- **Auth0 Documentation**: [auth0.com/docs](https://auth0.com/docs)
- **CouchDB Guide**: [docs.couchdb.org](https://docs.couchdb.org/)
- **MinIO Documentation**: [min.io/docs](https://min.io/docs/)
- **Report Issues**: [github.com/bccsa/luminary/issues](https://github.com/bccsa/luminary/issues)

## 💡 Tips

- **Security First**: Never commit `.env` files to Git (they're already in `.gitignore`)
- **Save Your Keys**: If the wizard generates an `ENCRYPTION_KEY` for you, save it somewhere safe
- **Need Help?**: The wizard shows helpful messages in blue, warnings in yellow, and errors in red
- **Re-run Anytime**: You can run the setup wizard again if you need to change settings

---

**Questions?** Open an issue on GitHub or check the `/docs` folder for more detailed documentation.

**Last Updated**: January 2026
