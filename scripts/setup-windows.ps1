# ============================================================
# Luminary Setup Wizard - Windows PowerShell Edition
# ============================================================
# This script automates the setup of the Luminary project
# on Windows machines (native or WSL). It guides developers through
# environment configuration, service setup (CouchDB, MinIO),
# and project initialization using PowerShell conventions.

# Requires PowerShell 5.0+ on Windows 10/11

# --- Logging utilities with colored output ---
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

# --- Script configuration ---
# These can be overridden at runtime but provide sensible defaults for local development
$global:COUCHDB_USER = "admin"
$global:COUCHDB_PASSWORD = "yourpassword"
$global:MINIO_USER = "minio"
$global:MINIO_PASSWORD = "minio123"

$global:JWT_MAPPINGS_JSON = '{"groups":{"group-super-admins":"(jwt) => true"},"userId":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].userId","email":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].email","name":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].username"}'

# ============================================================
# PREREQUISITE CHECKS
# ============================================================

# Check for Node.js (npm comes bundled with Node.js)
# Node.js is mandatory because the project uses npm for dependency management
# across all three subprojects (api, cms, app) and shared library builds.
function Test-NodeInstalled {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error-Custom "Node.js is not installed or not in PATH."
        Write-Warn "Install via one of these methods:"
        Write-Warn "  1. Using winget: winget install OpenJS.NodeJS"
        Write-Warn "  2. Download from: https://nodejs.org/"
        Write-Warn "  3. Using Chocolatey: choco install nodejs"
        exit 1
    }
    $nodeVersion = node --version
    Write-Success "Node.js found: $nodeVersion"
}

# Check if Docker is available; warn if missing but allow native setup fallback
function Test-DockerInstalled {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Warn "Docker is not installed."
        Write-Warn "Docker is preferred for running CouchDB and MinIO."
        Write-Warn "You can:"
        Write-Warn "  1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        Write-Warn "  2. Or proceed with native installation for database services"
        return $false
    }
    $dockerVersion = docker --version
    Write-Success "Docker found: $dockerVersion"
    return $true
}

# ============================================================
# LUMINARY ROOT DETECTION
# ============================================================

function Find-LuminaryRoot {
    # Allow explicit override via environment variable
    # Useful for testing or non-standard project layouts.
    if ($env:LUMINARY_ROOT) {
        Write-Info "Using LUMINARY_ROOT override: $env:LUMINARY_ROOT"
        return $env:LUMINARY_ROOT
    }

    # Walk up directory tree looking for the luminary project root
    # (characterized by the presence of api/, app/, cms/, shared/ directories)
    $dir = Get-Location
    $maxDepth = 20
    $depth = 0

    while ($depth -lt $maxDepth) {
        if ((Test-Path (Join-Path $dir "api")) -and
            (Test-Path (Join-Path $dir "app")) -and
            (Test-Path (Join-Path $dir "cms")) -and
            (Test-Path (Join-Path $dir "shared"))) {
            Write-Info "Found Luminary project at: $dir"
            return $dir
        }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) {
            break
        }
        $dir = $parent
        $depth++
    }

    Write-Error-Custom "Could not find Luminary project root."
    Write-Warn "Make sure you run this from within the project directory."
    exit 1
}

$global:LUMINARY_ROOT = Find-LuminaryRoot

# ============================================================
# ENVIRONMENT VARIABLE SETUP WIZARD
# ============================================================

# Interactive wizard that prompts for environment variables.
# Offers two modes:
# - Full Setup: Prompts for all variables, allowing customization
# - Critical Only: Prompts only for sensitive/mandatory variables (Auth0 keys)
#   and generates reasonable defaults for the rest.
function Setup-EnvironmentWizard {
    param(
        [string]$Project
    )

    $envExamplePath = Join-Path $LUMINARY_ROOT $Project ".env.example"
    $envOutputPath = Join-Path $LUMINARY_ROOT $Project ".env"

    if (-not (Test-Path $envExamplePath)) {
        Write-Warn "No .env.example found for $Project. Skipping environment setup."
        return
    }

    Write-Info "Setting up environment for $Project..."
    Write-Host ""
    Write-Host "Choose setup mode for $Project:" -ForegroundColor Cyan
    Write-Host "  1) Full Setup - Customize all variables"
    Write-Host "  2) Critical Only - Mandatory variables only (Auth0, encryption keys)"
    Write-Host ""

    $setupMode = Read-Host "Select mode (1 or 2)"

    if ($setupMode -eq "1") {
        Write-Info "Full Setup mode for $Project"
        Copy-Item -Path $envExamplePath -Destination $envOutputPath -Force
        Write-Info "Copied .env.example to .env"
        Write-Warn "Please edit $envOutputPath and fill in all required variables."
        Write-Warn "Critical variables include: Auth0 domain, client ID, encryption keys."
    }
    else {
        Write-Info "Critical Only mode for $Project"
        Copy-Item -Path $envExamplePath -Destination $envOutputPath -Force

        # Read the .env.example file to check for critical variables
        $envContent = Get-Content $envExamplePath -Raw

        # Prompt for API encryption key (critical for data security)
        # This key encrypts sensitive data at rest in the database.
        if ($envContent -match "ENCRYPTION_KEY") {
            Write-Host ""
            Write-Warn "ENCRYPTION_KEY is required for data security."
            $encryptionKey = Read-Host "Enter a 32-byte encryption key (or press Enter to generate one)"
            
            if (-not $encryptionKey) {
                # Generate a random 32-byte hex string using .NET cryptography
                $bytes = New-Object byte[] 32
                [System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
                $encryptionKey = [System.BitConverter]::ToString($bytes) -replace '-', ''
                Write-Info "Generated encryption key: $encryptionKey"
            }
            
            (Get-Content $envOutputPath) -replace "ENCRYPTION_KEY=.*", "ENCRYPTION_KEY=$encryptionKey" | Set-Content $envOutputPath
        }

        Write-Success ".env file created for $Project with defaults"
    }

    Apply-Auth0Env -EnvPath $envOutputPath

    if ($Project -eq "api") {
        Apply-ApiEnvDefaults -EnvPath $envOutputPath
    }
    Write-Host ""
}

function Convert-ToEnvValue {
    param([string]$Value)

    $escaped = $Value -replace '\\', '\\\\'
    $escaped = $escaped -replace '"', '\\"'
    $escaped = $escaped -replace "`r`n|`n|`r", "\\n"
    return "\"$escaped\""
}

function Set-EnvValue {
    param(
        [string]$EnvPath,
        [string]$Key,
        [string]$Value
    )

    $pattern = "^$Key="
    $content = Get-Content $EnvPath
    $updated = $false

    $newContent = $content | ForEach-Object {
        if ($_ -match $pattern) {
            $updated = $true
            "$Key=$Value"
        }
        else {
            $_
        }
    }

    if (-not $updated) {
        $newContent += "$Key=$Value"
    }

    Set-Content -Path $EnvPath -Value $newContent
}

function Read-MultilineSecret {
    param([string]$Prompt)

    Write-Info $Prompt
    Write-Info "Paste the value, then type END on its own line and press Enter."
    $lines = @()

    while ($true) {
        $line = Read-Host
        if ($line -eq "END") {
            break
        }
        $lines += $line
    }

    return ($lines -join "`n")
}

function Apply-Auth0Env {
    param([string]$EnvPath)

    $envContent = Get-Content $EnvPath -Raw

    if ($envContent -match "AUTH0_DOMAIN|VITE_AUTH0_DOMAIN") {
        Write-Host ""
        Write-Warn "Auth0 is required. Please provide your Auth0 credentials."
        Write-Warn "If you have a certificate from the Auth0 dashboard, paste it into the relevant field when prompted."
        
        $auth0Domain = Read-Host "Auth0 Domain (e.g., your-domain.auth0.com)"
        if ($auth0Domain) {
            (Get-Content $EnvPath) -replace "VITE_AUTH0_DOMAIN=.*", "VITE_AUTH0_DOMAIN=$auth0Domain" | Set-Content $EnvPath
            (Get-Content $EnvPath) -replace "AUTH0_DOMAIN=.*", "AUTH0_DOMAIN=$auth0Domain" | Set-Content $EnvPath
        }

        $auth0ClientId = Read-Host "Auth0 Client ID"
        if ($auth0ClientId) {
            (Get-Content $EnvPath) -replace "VITE_AUTH0_CLIENT_ID=.*", "VITE_AUTH0_CLIENT_ID=$auth0ClientId" | Set-Content $EnvPath
            (Get-Content $EnvPath) -replace "AUTH0_CLIENT_ID=.*", "AUTH0_CLIENT_ID=$auth0ClientId" | Set-Content $EnvPath
        }

        $auth0Audience = Read-Host "Auth0 Audience (e.g., https://your.audience/api)"
        if ($auth0Audience) {
            (Get-Content $EnvPath) -replace "VITE_AUTH0_AUDIENCE=.*", "VITE_AUTH0_AUDIENCE=$auth0Audience" | Set-Content $EnvPath
            (Get-Content $EnvPath) -replace "AUTH0_AUDIENCE=.*", "AUTH0_AUDIENCE=$auth0Audience" | Set-Content $EnvPath
        }
    }
}

function Apply-ApiEnvDefaults {
    param([string]$EnvPath)

    $envContent = Get-Content $EnvPath -Raw

    if ($envContent -match "JWT_SECRET") {
        $jwtSecret = ""
        while (-not $jwtSecret) {
            Write-Host ""
            Write-Warn "JWT_SECRET is required for API authentication."
            $useMultiline = Read-Host "Use multiline input? (y/n)"
            if ($useMultiline -eq "y" -or $useMultiline -eq "Y") {
                $jwtSecret = Read-MultilineSecret -Prompt "Paste JWT_SECRET"
            }
            else {
                $jwtSecret = Read-Host "JWT_SECRET (single line)"
            }

            if (-not $jwtSecret) {
                Write-Warn "JWT_SECRET cannot be empty."
            }
        }

        Set-EnvValue -EnvPath $EnvPath -Key "JWT_SECRET" -Value (Convert-ToEnvValue -Value $jwtSecret)
    }

    if ($envContent -match "ENCRYPTION_KEY") {
        Write-Host ""
        Write-Warn "ENCRYPTION_KEY is required for data security."
        $encryptionKey = Read-Host "Enter a 32-byte encryption key (or press Enter to generate one)"

        if (-not $encryptionKey) {
            $bytes = New-Object byte[] 32
            [System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
            $encryptionKey = [System.BitConverter]::ToString($bytes) -replace '-', ''
            Write-Info "Generated encryption key: $encryptionKey"
        }

        Set-EnvValue -EnvPath $EnvPath -Key "ENCRYPTION_KEY" -Value (Convert-ToEnvValue -Value $encryptionKey)
    }

    Set-EnvValue -EnvPath $EnvPath -Key "JWT_MAPPINGS" -Value "'$JWT_MAPPINGS_JSON'"

    $dbConnection = "http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@127.0.0.1:5984"
    Set-EnvValue -EnvPath $EnvPath -Key "DB_CONNECTION_STRING" -Value (Convert-ToEnvValue -Value $dbConnection)

    Set-EnvValue -EnvPath $EnvPath -Key "S3_ENDPOINT" -Value "127.0.0.1"
    Set-EnvValue -EnvPath $EnvPath -Key "S3_PORT" -Value "9000"
    Set-EnvValue -EnvPath $EnvPath -Key "S3_USE_SSL" -Value "false"
    Set-EnvValue -EnvPath $EnvPath -Key "S3_ACCESS_KEY" -Value (Convert-ToEnvValue -Value $MINIO_USER)
    Set-EnvValue -EnvPath $EnvPath -Key "S3_SECRET_KEY" -Value (Convert-ToEnvValue -Value $MINIO_PASSWORD)
    Set-EnvValue -EnvPath $EnvPath -Key "S3_IMG_BUCKET" -Value (Convert-ToEnvValue -Value "luminary-images")
}

function Prompt-ServiceCredentials {
    Write-Host ""
    $couchdbUserInput = Read-Host "CouchDB admin username [$COUCHDB_USER]"
    if ($couchdbUserInput) {
        $global:COUCHDB_USER = $couchdbUserInput
    }

    $couchdbPasswordInput = Read-Host "CouchDB admin password (hidden input not supported)"
    if ($couchdbPasswordInput) {
        $global:COUCHDB_PASSWORD = $couchdbPasswordInput
    }

    $minioUserInput = Read-Host "MinIO root user [$MINIO_USER]"
    if ($minioUserInput) {
        $global:MINIO_USER = $minioUserInput
    }

    $minioPasswordInput = Read-Host "MinIO root password (hidden input not supported)"
    if ($minioPasswordInput) {
        $global:MINIO_PASSWORD = $minioPasswordInput
    }
}

# ============================================================
# GIT HOOK SETUP
# ============================================================

# Install the post-checkout git hook to the .git\hooks directory.
# This hook rebuilds the shared library when developers switch branches,
# preventing version mismatches between app/cms and shared library.
function Setup-GitHooks {
    $hookSource = Join-Path $LUMINARY_ROOT "scripts" "post-checkout"
    $hooksDir = Join-Path $LUMINARY_ROOT ".git" "hooks"
    $hookDest = Join-Path $hooksDir "post-checkout"

    if (-not (Test-Path $hookSource)) {
        Write-Warn "post-checkout hook not found at $hookSource. Skipping git hooks setup."
        return
    }

    Write-Info "Installing git hook (post-checkout)..."
    
    if (-not (Test-Path $hooksDir)) {
        New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
    }

    Copy-Item -Path $hookSource -Destination $hookDest -Force
    Write-Success "Git hook installed."
    Write-Warn "Note: On Windows, git hooks must be executable. This is handled automatically by Git."
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
function Test-PortAvailability {
    $requiredPorts = @(3000, 4174, 4175, 5984, 9000, 9001)
    $inUse = @()

    Write-Warn "Checking for port availability..."

    foreach ($port in $requiredPorts) {
        try {
            $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($connection) {
                $inUse += $port
            }
        }
        catch {
            # Port not in use
        }
    }

    if ($inUse.Count -gt 0) {
        Write-Warn "The following ports are already in use: $($inUse -join ', ')"
        Write-Warn "Please close any applications using these ports before continuing."
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Error-Custom "Setup cancelled. Please free up the ports and try again."
            exit 1
        }
    }
    else {
        Write-Success "All required ports are available."
    }
}

# ============================================================
# DOCKER-BASED DATABASE SETUP
# ============================================================

# Start CouchDB via Docker container.
# CouchDB is the primary database for all Luminary data.
# Runs on port 5984 with credentials from environment variables.
function Setup-CouchDBDocker {
    Write-Info "Starting CouchDB container..."
    
    # Check if container exists
    $containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^luminary-couchdb$" -ErrorAction SilentlyContinue

    if ($containerExists) {
        Write-Warn "CouchDB container already exists."
        
        # Check if it's running
        $isRunning = docker ps --format "{{.Names}}" | Select-String -Pattern "^luminary-couchdb$" -ErrorAction SilentlyContinue
        if (-not $isRunning) {
            Write-Info "Starting existing CouchDB container..."
            docker start luminary-couchdb | Out-Null
        }
        else {
            Write-Info "CouchDB container is already running."
        }
    }
    else {
        Write-Info "Creating new CouchDB container..."
        docker run -d `
            --name luminary-couchdb `
            -p 5984:5984 `
            -e "COUCHDB_USER=$COUCHDB_USER" `
            -e "COUCHDB_PASSWORD=$COUCHDB_PASSWORD" `
            couchdb:latest | Out-Null
    }

    Write-Success "CouchDB running at http://localhost:5984"
}

# Start MinIO via Docker container.
# MinIO provides S3-compatible object storage for media uploads.
# Runs on port 9000 (API) and 9001 (Console UI).
function Setup-MinIODocker {
    Write-Info "Starting MinIO container..."
    
    # Check if container exists
    $containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^luminary-storage$" -ErrorAction SilentlyContinue

    if ($containerExists) {
        Write-Warn "MinIO container already exists."
        
        # Check if it's running
        $isRunning = docker ps --format "{{.Names}}" | Select-String -Pattern "^luminary-storage$" -ErrorAction SilentlyContinue
        if (-not $isRunning) {
            Write-Info "Starting existing MinIO container..."
            docker start luminary-storage | Out-Null
        }
        else {
            Write-Info "MinIO container is already running."
        }
    }
    else {
        Write-Info "Creating new MinIO container..."
        docker run -d `
            -p 9000:9000 `
            -p 9001:9001 `
            --name luminary-storage `
            -e "MINIO_ROOT_USER=$MINIO_USER" `
            -e "MINIO_ROOT_PASSWORD=$MINIO_PASSWORD" `
            quay.io/minio/minio:latest server /data --console-address ":9001" | Out-Null
    }

    Write-Success "MinIO running at http://localhost:9001 (Console)"
}

# ============================================================
# NATIVE DATABASE SETUP (Windows fallback)
# ============================================================

# Install CouchDB on Windows using the official MSI installer.
# This provides a local database instance for developers without Docker.
# Warning: Native installations are single-machine only and not ideal for team development.
function Setup-CouchDBNative {
    Write-Info "Setting up CouchDB via native Windows installation..."

    # Check if CouchDB is already installed by checking the registry
    $couchdbPath = "C:\Program Files\Apache CouchDB"
    
    if (Test-Path $couchdbPath) {
        Write-Info "CouchDB is already installed at $couchdbPath"
        Write-Info "Attempting to start CouchDB service..."
        $service = Get-Service couchdb -ErrorAction SilentlyContinue
        if ($service) {
            Start-Service couchdb -ErrorAction SilentlyContinue
            Write-Success "CouchDB service started"
        }
        else {
            Write-Warn "CouchDB service not found. You may need to install CouchDB manually."
        }
    }
    else {
        Write-Warn "CouchDB is not installed."
        Write-Warn "Please download and install from: https://couchdb.apache.org/download.html"
        Write-Warn "Choose the Windows installer (.msi)"
        Write-Warn "After installation, CouchDB should automatically start on port 5984"
        
        $response = Read-Host "Open download page? (y/n)"
        if ($response -eq "y" -or $response -eq "Y") {
            Start-Process "https://couchdb.apache.org/download.html"
        }
    }

    Write-Success "CouchDB running at http://localhost:5984"
}

# Install MinIO on Windows using the official executable or winget.
# MinIO is simpler than CouchDB to install natively on Windows.
function Setup-MinIONative {
    Write-Info "Setting up MinIO via native Windows installation..."

    # Try to find MinIO in common locations
    $minioPaths = @(
        "C:\Program Files\minio\minio.exe",
        "C:\Program Files (x86)\minio\minio.exe",
        "$env:USERPROFILE\AppData\Local\Programs\minio\minio.exe"
    )

    $minioFound = $false
    foreach ($path in $minioPaths) {
        if (Test-Path $path) {
            Write-Info "MinIO found at: $path"
            $minioFound = $true
            break
        }
    }

    if (-not $minioFound) {
        Write-Warn "MinIO is not installed."
        Write-Warn "Install via one of these methods:"
        Write-Warn "  1. Download from: https://min.io/download#/windows"
        Write-Warn "  2. Using chocolatey: choco install minio"
        Write-Warn "  3. Using scoop: scoop install minio"
        
        $response = Read-Host "Open download page? (y/n)"
        if ($response -eq "y" -or $response -eq "Y") {
            Start-Process "https://min.io/download#/windows"
        }
    }
    else {
        Write-Success "MinIO is installed"
    }

    Write-Warn "To start MinIO manually, run:"
    Write-Warn "  minio.exe server C:\minio-data --console-address :9001"
    Write-Warn "Or create a batch script to automate this."
}

function Install-MinIOClient {
    if (Get-Command mc -ErrorAction SilentlyContinue) {
        Write-Success "MinIO client (mc) is already installed."
        return
    }

    Write-Info "Installing MinIO client (mc)..."
    $userBin = Join-Path $env:USERPROFILE "bin"
    if (-not (Test-Path $userBin)) {
        New-Item -ItemType Directory -Path $userBin -Force | Out-Null
    }

    $mcPath = Join-Path $userBin "mc.exe"
    $mcUrl = "https://dl.min.io/client/mc/release/windows-amd64/mc.exe"

    Invoke-WebRequest -Uri $mcUrl -OutFile $mcPath
    Write-Success "MinIO client installed at $mcPath"
    Write-Warn "Add $userBin to your PATH to use mc globally."
    $env:Path = "$userBin;$env:Path"
}

# ============================================================
# NPM CACHE RECOVERY
# ============================================================

# On Windows, npm can sometimes fail with "ENOENT" errors due to corrupted cache
# or incomplete module installations. This function clears the cache and performs
# a clean reinstall to recover from such issues.
function Repair-NpmCache {
    param(
        [string]$ProjectPath
    )

    Write-Warn "Attempting to repair npm cache for $ProjectPath..."
    Set-Location $ProjectPath
    
    # Clear npm cache (removes potentially corrupted metadata)
    Write-Info "Clearing npm cache..."
    npm cache clean --force | Out-Null
    
    # Remove node_modules and lock files (forces fresh download of all dependencies)
    Write-Info "Removing node_modules and lock files..."
    Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
    Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue | Out-Null
    
    Write-Success "npm cache repaired. Ready for fresh install."
}

# ============================================================
# PROJECT BUILD & INITIALIZATION
# ============================================================

# Install dependencies and build all subprojects.
# Order matters: shared must be built first (it's a dependency of app/cms).
# Then install app and cms with --install-links to use the local shared build.
# Finally, seed the API database with initial data.
function Setup-Projects {
    Write-Info "Installing and building all Luminary subprojects..."
    
    Set-Location $LUMINARY_ROOT

    # Build shared library first (used by app and cms)
    Write-Info "Building shared library..."
    $sharedPath = Join-Path $LUMINARY_ROOT "shared"
    Set-Location $sharedPath
    
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "npm ci failed. Attempting npm install..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm install failed. Attempting cache repair..."
            Repair-NpmCache -ProjectPath $sharedPath
            npm install
        }
    }
    
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to build shared library"
        exit 1
    }
    Write-Success "Shared library built"

    # Install and link app (uses shared as dependency)
    Write-Info "Installing app with shared library link..."
    $appPath = Join-Path $LUMINARY_ROOT "app"
    Set-Location $appPath
    npm ci --install-links
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "npm ci failed. Attempting npm install..."
        npm install --install-links
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm install failed. Attempting cache repair..."
            Repair-NpmCache -ProjectPath $appPath
            npm install --install-links
        }
    }
    Write-Success "App installed"

    # Install and link cms (uses shared as dependency)
    Write-Info "Installing cms with shared library link..."
    $cmsPath = Join-Path $LUMINARY_ROOT "cms"
    Set-Location $cmsPath
    npm ci --install-links
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "npm ci failed. Attempting npm install..."
        npm install --install-links
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm install failed. Attempting cache repair..."
            Repair-NpmCache -ProjectPath $cmsPath
            npm install --install-links
        }
    }
    Write-Success "CMS installed"

    # Install API and seed database with initial data
    Write-Info "Installing API..."
    $apiPath = Join-Path $LUMINARY_ROOT "api"
    Set-Location $apiPath
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "npm ci failed. Attempting npm install..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm install failed. Attempting cache repair..."
            Repair-NpmCache -ProjectPath $apiPath
            npm install
        }
    }

    # Only seed if .env exists (created during environment setup)
    $envFile = Join-Path $LUMINARY_ROOT "api" ".env"
    if (Test-Path $envFile) {
        Write-Info "Seeding database..."
        npm run seed
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Database seeding failed. You may need to seed manually later."
        }
    }

    Write-Success "All subprojects installed and built."
}

# ============================================================
# SERVICE MANAGEMENT
# ============================================================

# Start all services in the background: API server + dev servers for CMS and App.
# API runs on 3000, CMS on 4175, App on 4174.
function Start-AllServices {
    Write-Info "Starting all services..."
    Write-Info "This will open new terminal windows for each service."
    
    # Start API in new window
    Start-Process -WindowStyle Normal -WorkingDirectory (Join-Path $LUMINARY_ROOT "api") `
        -ArgumentList "-NoExit", "-Command", "npm run start:dev"

    # Start CMS in new window
    Start-Process -WindowStyle Normal -WorkingDirectory (Join-Path $LUMINARY_ROOT "cms") `
        -ArgumentList "-NoExit", "-Command", "npm run dev"

    # Start App in new window
    Start-Process -WindowStyle Normal -WorkingDirectory (Join-Path $LUMINARY_ROOT "app") `
        -ArgumentList "-NoExit", "-Command", "npm run dev"

    Write-Success "Services starting:"
    Write-Success "  API    → http://localhost:3000"
    Write-Success "  CMS    → http://localhost:4175"
    Write-Success "  App    → http://localhost:4174"
}

# ============================================================
# HELP & USAGE
# ============================================================

function Show-Usage {
    $usageText = @"
Luminary Setup Wizard - Windows PowerShell Edition
====================================================

USAGE:
  powershell -ExecutionPolicy Bypass -File setup-windows.ps1 [COMMAND]

COMMANDS:

  setup               Complete setup: prerequisites, environment, git hooks,
                      database services, and project builds

  start               Start all services (API, CMS, App) in separate terminal windows

ENVIRONMENT VARIABLES (optional):

  LUMINARY_ROOT       Override the project root directory

EXAMPLES:

  # Full setup from scratch
  powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 setup

  # Start all services
  powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 start

NOTES:

  - This script requires Windows PowerShell 5.0+ or PowerShell Core
  - Run as Administrator if you need to install services (CouchDB)
  - Docker Desktop must be installed separately if using Docker mode
  - Auth0 credentials are mandatory - you will be prompted for them

"@
    Write-Host $usageText
}

# ============================================================
# MAIN ENTRY POINT
# ============================================================

function Main {
    param(
        [string]$Command
    )

    switch ($Command) {
        "setup" {
            Write-Info "Starting Luminary setup wizard..."
            
            Test-NodeInstalled
            $dockerAvailable = Test-DockerInstalled
            Test-PortAvailability

            Write-Host ""
            $setupDatabases = Read-Host "Would you like to set up CouchDB and MinIO? (y/n)"
            
            if ($setupDatabases -eq "y" -or $setupDatabases -eq "Y") {
                Prompt-ServiceCredentials
                if ($dockerAvailable) {
                    $useDocker = Read-Host "Use Docker for databases (recommended)? (y/n)"
                    
                    if ($useDocker -eq "y" -or $useDocker -eq "Y") {
                        Setup-CouchDBDocker
                        Setup-MinIODocker
                        Install-MinIOClient
                    }
                    else {
                        Setup-CouchDBNative
                        Setup-MinIONative
                        Install-MinIOClient
                    }
                }
                else {
                    Write-Warn "Using native installation (Docker not available)..."
                    Setup-CouchDBNative
                    Setup-MinIONative
                    Install-MinIOClient
                }
            }

            # Environment setup for all subprojects
            foreach ($project in @("api", "cms", "app")) {
                Setup-EnvironmentWizard -Project $project
            }

            Setup-GitHooks
            Setup-Projects

            Write-Success "Luminary setup complete!"
            Write-Info "Next steps:"
            Write-Info "  1. Verify .env files in api\, cms\, and app\ folders"
            Write-Info "  2. Run: powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 start"
            Write-Info "  3. Access: API (3000), CMS (4175), App (4174)"
        }

        "start" {
            Start-AllServices
        }

        default {
            Show-Usage
        }
    }
}

# Execute main with command-line argument
Main $args[0]
