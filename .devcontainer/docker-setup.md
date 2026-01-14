# Docker Development Environment Setup

This guide explains how to run the Luminary project using Docker. This approach is recommended for all developers, especially those on Windows, as it provides a consistent environment with all dependencies pre-configured.

## Prerequisites

- **Docker Desktop**: Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop).
- **VS Code**: Install [Visual Studio Code](https://code.visualstudio.com/).
- **Dev Containers Extension**: Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension in VS Code.

## Quick Start (Terminal)

If you just want to run the application (API, App, CMS, Database, Storage) without VS Code integration:

1. Open a terminal in the project root.
2. Run the following command:

   ```bash
   docker compose up
   ```

   _Note: On the first run, this may take a while to download images and install dependencies._

3. Access the services:

   - **App (Frontend)**: [http://localhost:4174](http://localhost:4174)
   - **CMS**: [http://localhost:4175](http://localhost:4175)
   - **API**: [http://localhost:3000](http://localhost:3000)
   - **MinIO Console**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`)

4. To stop the environment, press `Ctrl+C` in the terminal.

## Developing with VS Code (Recommended)

To write code with full IntelliSense, linting, and terminal access inside the container:

1. Open the project folder in VS Code.
2. A popup should appear: "Reopen in Container". Click it.
   - If not, press `F1`, type **"Dev Containers: Reopen in Container"**, and select it.
3. VS Code will build the containers and connect. This acts as your full development environment.
4. The terminal inside VS Code is now running in the container.
   - You can run `npm install`, `npm run dev`, etc., directly in this terminal.

## Source Code & Live Reloading

- The project files are mounted into the container. Any change you make in VS Code (or on your host machine) is instantly reflected in the container.
- **Hot Module Replacement (HMR)** is configured. Saving a file in `app` or `cms` should automatically update your browser.
- **API Auto-restart**: Saving a file in `api` will restart the NestJS server.

## Environment Variables

The setup uses default values for development, but you can override them using environment variables.

### Option 1: Create a `.env` file (Recommended)

The easiest way to configure these is to copy the example file:

```bash
cp .env.example .env
```

This file contains all the available configuration options. You can then edit `.env` if you need to change anything (e.g., secrets).
Docker Compose will automatically read this file.

### Option 2: Command Line

You can pass environment variables directly when starting the containers:

```bash
JWT_SECRET=my-secret docker compose up
```

## Troubleshooting

### `node_modules` issues

We use Docker volumes to store `node_modules` to prevent OS compatibility issues (Windows vs Linux).

- If you delete `node_modules` on your host, it won't affect the container.
- If you need to wipe dependencies, you must remove the docker volumes:
  ```bash
  docker compose down -v
  ```

### Ports already in use

If you see an error that port 3000, 4174, etc., is already in use, make sure you don't have another instance of the app running (locally or in another container).

### Shared Library Updates

The `shared` library is linked. If you make changes to `shared` and they aren't picked up, try restarting the dev server in the container.
