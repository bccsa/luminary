# Improved Setup Wizard: Project-Specific .env Files

## The Improvement

The setup wizard now writes environment variables **directly to each project's individual .env file** instead of trying to manage everything from a single shared file in `.devcontainer/.env`.

### Architecture Benefits

**Before:**

- Single shared `.devcontainer/.env` file
- Projects had to rely on shared environment or use symlinks
- Certificate format conflicts (escaped `\n` vs real newlines)
- Difficult to manage project-specific overrides

**After:**

- `/workspace/api/.env` - API configuration with JWT verification
- `/workspace/app/.env` - Frontend app Auth0 and branding
- `/workspace/cms/.env` - CMS Auth0 and settings
- `.devcontainer/.env` - Container-level defaults (for backward compatibility)

## What Gets Written to Each File

### API `.env` → `/workspace/api/.env`

```
PORT=3000
CORS_ORIGIN=[...]
JWT_SECRET="<actual Auth0 certificate>"  ← CRITICAL: Real certificate for JWT.verify()
ENCRYPTION_KEY="<generated 32-byte key>"
DB_CONNECTION_STRING=http://admin:password@couchdb:5984
DB_DATABASE=luminary-local
S3_* settings
JWT_MAPPINGS='{...}'                     ← Auth0 token claim mappings
```

### App Frontend `.env` → `/workspace/app/.env`

```
VITE_APP_NAME="Luminary App"
VITE_API_URL=http://localhost:3000
VITE_AUTH0_DOMAIN=<your Auth0 domain>
VITE_AUTH0_CLIENT_ID=<your client ID>
VITE_AUTH0_AUDIENCE=<your API audience>
VITE_LOGO paths, analytics settings, etc.
```

### CMS Frontend `.env` → `/workspace/cms/.env`

```
VITE_APP_NAME="Luminary CMS"
VITE_API_URL=http://localhost:3000
VITE_CLIENT_APP_URL=http://localhost:4174
VITE_AUTH0_DOMAIN, CLIENT_ID, AUDIENCE
VITE_INITIAL_PAGE=post/overview/blog
```

## Key Improvements

### 1. **Solves the JWT Certificate Problem**

- The API now gets `JWT_SECRET` with the actual Auth0 certificate (real newlines)
- No more "invalid algorithm" errors from jsonwebtoken
- Each project's config is independent and correct

### 2. **Respects Project Boundaries**

- App only gets `VITE_*` variables it needs
- CMS has its own customization options
- API has database and encryption keys separate from frontend
- No cross-contamination of config

### 3. **Easier Maintenance**

- Each team member managing API can tweak `/workspace/api/.env`
- Frontend team can modify `/workspace/app/.env` and `/workspace/cms/.env`
- Source of truth for each service is right next to the code

### 4. **Better Git Handling**

- Can `.gitignore` all `.env` files consistently
- Each `.env.example` serves as the template for its directory
- Clear inheritance: `.env.example` → local `.env`

### 5. **Backward Compatible**

- Still writes `.devcontainer/.env` for container-level access
- Existing scripts/imports from container environment still work
- No breaking changes to current setup

## How to Run

```bash
cd /workspace/.devcontainer
node setup-wizard.js
```

The wizard will:

1. Prompt for Auth0 credentials (domain, client ID, audience, certificate)
2. Create `/workspace/api/.env` with JWT verification config
3. Create `/workspace/app/.env` with Auth0 frontend config
4. Create `/workspace/cms/.env` with CMS-specific config
5. Create `.devcontainer/.env` for backward compatibility
6. Set up git hooks
7. Build shared library

## Next Steps

After running the wizard:

```bash
# Each project can be started independently
cd /workspace/api && npm run start:dev
cd /workspace/app && npm run dev
cd /workspace/cms && npm run dev
```

The API will now properly verify JWTs because `JWT_SECRET` contains the actual certificate!

## Code Changes

**File:** `/workspace/.devcontainer/setup-wizard.js`

**New Function:**

```javascript
const writeProjectEnvFiles = (rootDir, config) => {
  // Writes to:
  // - /workspace/api/.env
  // - /workspace/app/.env
  // - /workspace/cms/.env
};
```

**Main Execution:**
Now calls `writeProjectEnvFiles()` to write individual project configs, then calls legacy `writeEnvFile()` for backward compatibility.

## Testing the Configuration

To verify the setup is correct:

```bash
# Check JWT_SECRET is set (should be multi-line PEM certificate)
cat /workspace/api/.env | grep -A 20 "JWT_SECRET"

# Verify Auth0 domain is in frontend configs
grep "VITE_AUTH0_DOMAIN" /workspace/app/.env
grep "VITE_AUTH0_DOMAIN" /workspace/cms/.env

# Start API and check for JWT errors (should see none now)
cd /workspace/api && npm run start:dev
```

When socket.io clients connect, the API should now successfully verify JWTs instead of throwing "invalid algorithm" errors.
