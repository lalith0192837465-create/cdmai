const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const crypto = require("crypto");
const dockerSetup = require("./docker-setup");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 640,
    height: 720,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function send(status) {
  win?.webContents.send("status", status);
}

ipcMain.handle("check-docker", async () => {
  const installed = await dockerSetup.checkDockerInstalled();
  const running = installed ? await dockerSetup.checkDockerRunning() : false;
  return { installed, running };
});

ipcMain.handle("install-and-launch", async (event, config) => {
  try {
    let installed = await dockerSetup.checkDockerInstalled();
    if (!installed) {
      send("Docker not found — installing...");
      await dockerSetup.installDocker(process.platform, send);
    }

    send("Waiting for Docker to be ready...");
    const running = await dockerSetup.waitForDockerRunning(send);
    if (!running) {
      return {
        ok: false,
        error:
          "Docker didn't finish starting. Open Docker Desktop manually, wait for it to say 'running', then click Retry.",
      };
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const pgPass = crypto.randomBytes(16).toString("hex");
    const domain = config.domain || "http://localhost:3000";
    const port = config.port || "3000";

    const envContents = `APP_PORT=${port}
POSTGRES_PASSWORD=${pgPass}
DATABASE_URL="postgresql://cdm:${pgPass}@db:5432/cdm"
NEXTAUTH_URL="${domain}"
NEXTAUTH_SECRET="${secret}"
GOOGLE_CLIENT_ID="${config.gid || ""}"
GOOGLE_CLIENT_SECRET="${config.gsecret || ""}"
ANTHROPIC_API_KEY="${config.anthropic || ""}"
RECALL_API_KEY="${config.recall || ""}"
RECALL_REGION="${config.region || "us-west-2"}"
SLACK_WEBHOOK_URL="${config.slack || ""}"
NODE_ENV="production"
`;

    const composeContents = `version: "3.9"
services:
  app:
    image: ${config.image || "ghcr.io/lalith0192837465-create/cdm:latest"}
    ports:
      - "${port}:3000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: cdm
      POSTGRES_PASSWORD: ${pgPass}
      POSTGRES_DB: cdm
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cdm"]
      interval: 5s
      timeout: 5s
      retries: 10
    volumes:
      - cdm_pgdata:/var/lib/postgresql/data
    restart: unless-stopped
volumes:
  cdm_pgdata:
`;

    const deployDir = path.join(app.getPath("userData"), "deploy");
    dockerSetup.writeDeployFiles(deployDir, envContents, composeContents);

    send("Pulling the CDM image...");
    const pulled = await dockerSetup.runCompose(deployDir, ["pull"], send);
    if (!pulled) return { ok: false, error: "Failed to pull the app image. Check your internet connection." };

    send("Starting the database and app...");
    const started = await dockerSetup.runCompose(deployDir, ["up", "-d"], send);
    if (!started) return { ok: false, error: "Failed to start the containers." };

    send("Waiting for the schema to sync...");
    await new Promise((r) => setTimeout(r, 8000));
    await dockerSetup.runCompose(
      deployDir,
      ["exec", "-T", "app", "npx", "prisma", "db", "push", "--skip-generate"],
      send
    );

    const localUrl = `http://localhost:${port}`;
    send("Waiting for CDM to respond...");
    const healthy = await dockerSetup.waitForHealthy(`${localUrl}/api/health`, send);
    if (healthy) {
      shell.openExternal(localUrl);
    }

    return { ok: true, url: localUrl };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
