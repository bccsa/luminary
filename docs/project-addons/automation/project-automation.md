# Project automation Documentation

## Luminary Automation CLI

The `automate-luminary` script is a Bash-based CLI tool for automating setup and management of the Luminary project environment. It handles installation, service control, and database operations for local development.

### Features
- Cross-platform support (Linux, macOS, Windows)
- Self-installation for global CLI access
- Automated Docker, CouchDB, and MinIO setup
- Dependency installation and build for all subprojects
- Service management (start, restart, selective restart)
- CouchDB database reset and reseed

### Usage
Navigate to the script location and run:

```bash
./automate-luminary <command>
```

> **Note:** After running the self-install command, you can use the CLI globally as:
> ```bash
> luminary <command>
> ```
#### Available Commands
- `setup`        Install Docker, CouchDB, MinIO, build & seed all projects
- `start`        Start API, CMS, and App
- `restart`      Restart all services
- `restart-api`  Restart only API
- `restart-cms`  Restart only CMS
- `restart-app`  Restart only App
- `start-api`    Start only API
- `reset-db`     Delete, recreate, and reseed the CouchDB database

#### Environment Variables
Override defaults by setting these before running:
- `LUMINARY_COUCHDB_USER`      (default: admin)
- `LUMINARY_COUCHDB_PASSWORD`  (default: yourpassword)
- `LUMINARY_MINIO_ACCESS_KEY`  (default: minio)
- `LUMINARY_MINIO_SECRET_KEY`  (default: minio123)

#### Example
```bash
LUMINARY_COUCHDB_USER=myuser LUMINARY_COUCHDB_PASSWORD=mypass ./automate-luminary setup
```

#### Troubleshooting
- Ensure required commands (`docker`, `npm`, `git`, `curl`) are installed.
- For Docker installation on Windows/macOS, follow manual instructions.
- For more help, run:
  ```bash
  ./automate-luminary
  ```
