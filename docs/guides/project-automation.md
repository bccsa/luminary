# Project automation Documentation

## Git hooks

> Git hooks are scripts that run automatically every time a particular event occurs in a Git repository. They let you customize Git's internal behavior and trigger customizable actions at key points in the development life cycle.

### Types of hooks

- pre-rebase --> Runs before you rebase anything and can halt the process by exiting non-zero
- post-rewrite --> run by commands that replace commits, such as git commit --amend and git rebase (though not by git filter-branch). Its single argument is which command triggered the rewrite, and it receives a list of rewrites on stdin
- pre-commit --> Runs before typing commit message
- post-commit --> Runs after a commit has been made
- pre-checkout --> Runs before checkout to another branch
- post-checkout --> Runs after checkout to another branch

### Setting up your own git-hooks

To add your own git-hooks, try doing the following:

1. Navigate into the hidden `.git` folder for your local repository.
2. Navigate into the `hooks` folder.
3. Create a file using any of the compatible git-hook command names.
4. Add your **bash** script to this file.
5. Make the file `executable`.

### Using the premade script/s

To use the premade scripts designed for luminary, try doing the following:

1. Navigate into luminary/docs/project-addons/automation
2. Copy the script/file you want to use.
3. Navigate into the hidden `.git` folder for your local repository.
4. Navigate into the `hooks` folder.
5. Paste the file.
6. Ensure the file is flagged as `executable` for your OS.

For more information on git-hooks you can visit this [site](https://git-scm.com/book/ms/v2/Customizing-Git-Git-Hooks).

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
