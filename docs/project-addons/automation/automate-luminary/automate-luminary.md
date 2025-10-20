# Luminary Automation CLI Documentation

## Overview

The `automate-luminary` script is a cross-platform Bash CLI tool for setting up, managing, and automating the Luminary project environment. It streamlines installation, service management, and database operations for local development.

## Features
- **OS Detection:** Automatically adapts to Linux, macOS, and Windows environments.
- **Self-Installation:** Installs the CLI globally for easy access.
- **Environment Variables:** Supports runtime overrides for CouchDB and MinIO credentials.
- **Requirements Check:** Ensures required tools (`docker`, `npm`, `git`, `curl`) are installed.
- **Docker Management:** Installs Docker (Linux only) and manages CouchDB/MinIO containers.
- **Project Setup:** Installs dependencies and builds Luminary subprojects (`shared`, `cms`, `app`, `api`).
- **Service Control:** Start, restart, or selectively restart API, CMS, and App services.
- **Database Reset:** Deletes, recreates, and seeds the CouchDB database.
- **Help:** Displays usage instructions and available commands.

## Usage

Run the script with one of the following commands:

```bash
./automate-luminary <command>
```

### Commands
- `setup`        Install Docker, CouchDB, MinIO, build & seed all projects
- `start`        Start API, CMS, and App
- `restart`      Restart all services
- `restart-api`  Restart only API
- `restart-cms`  Restart only CMS
- `restart-app`  Restart only App
- `start-api`    Start only API
- `reset-db`     Delete, recreate, and reseed the CouchDB database

### Environment Variables
You can override defaults by setting these variables before running the script:
- `LUMINARY_COUCHDB_USER`      (default: admin)
- `LUMINARY_COUCHDB_PASSWORD`  (default: yourpassword)
- `LUMINARY_MINIO_ACCESS_KEY`  (default: minio)
- `LUMINARY_MINIO_SECRET_KEY`  (default: minio123)

### Example
```bash
LUMINARY_COUCHDB_USER=myuser LUMINARY_COUCHDB_PASSWORD=mypass ./automate-luminary setup
```

## Notes
- The script must be run with sufficient privileges for installation steps (e.g., `sudo` for global install or Docker setup).
- For Windows and macOS, Docker must be installed manually.
- The script locates the `luminary` folder automatically; ensure it exists in your project or home directory.

## Troubleshooting
- If required commands are missing, install them using your OS package manager.
- If Docker containers fail to start, check for port conflicts or existing containers.
- For more help, run:
  ```bash
  ./automate-luminary
  ```
