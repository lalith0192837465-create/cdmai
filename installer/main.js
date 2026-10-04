const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const crypto = require("crypto");
const dockerSetup = require("./docker-setup");
const RELEASES = "https://github.com/lalith0192837465-create/cdmai/releases/latest/download";
let win;
function createWindow() { win = new BrowserWindow({ width: 680, height: 780, resizable: false, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } }); win.setMenuBarVisibility(false); win.loadFile(path.join(__dirname, "renderer", "index.html")); }
app.whenReady().then(createWindow); app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
function send(status) { win?.webContents.send("status", status); }
ipcMain.handle("open-cloud-package", async (_event, target) => { const file = target === "aws" ? "CDM-AWS-Setup.zip" : "CDM-Google-Cloud-Setup.zip"; await shell.openExternal(`${RELEASES}/${file}`); return { ok: true }; });
ipcMain.handle("check-docker", async () => { const installed = await dockerSetup.checkDockerInstalled(); return { installed, running: installed ? await dockerSetup.checkDockerRunning() : false }; });
ipcMain.handle("install-and-launch", async (_event, config) => {
  try {
    let installed = await dockerSetup.checkDockerInstalled();
    if (!installed) { send("Docker not found — installing..."); await dockerSetup.installDocker(process.platform, send); }
    send("Waiting for Docker to be ready..."); if (!(await dockerSetup.waitForDockerRunning(send))) return { ok: false, error: "Docker did not finish starting. Open Docker Desktop, wait until it is running, then click Retry." };
    const secret = crypto.randomBytes(32).toString("hex"); const pgPass = crypto.randomBytes(16).toString("hex");
    const domain = config.domain || "http://localhost:3000"; const port = config.port || "3000";
    const envContents = `APP_PORT=${port}
POSTGRES_PASSWORD=${pgPass}
DATABASE_URL="postgresql://cdm:${pgPass}@db:5432/cdm"
NEXTAUTH_URL="${domain}"
APP_URL="${domain}"
NEXTAUTH_SECRET="${secret}"
GOOGLE_CLIENT_ID="${config.gid || ""}"
GOOGLE_CLIENT_SECRET="${config.gsecret || ""}"
ANTHROPIC_API_KEY="${config.anthropic || ""}"
SKRIBBY_API_KEY="${config.skribby || ""}"
SKRIBBY_BASE_URL="${config.skribbyBase || "https://platform.skribby.io/api/v1"}"
WEBHOOK_SECRET="${config.webhook || ""}"
SLACK_WEBHOOK_URL="${config.slack || ""}"
TEST_CALL_ENABLED="true"
NODE_ENV="production"
`;
    const composeContents = `services:
  app:
    image: ghcr.io/lalith0192837465-create/cdmai:latest
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
    const deployDir = path.join(app.getPath("userData"), "deploy"); dockerSetup.writeDeployFiles(deployDir, envContents, composeContents);
    send("Downloading the current CDM app image..."); if (!(await dockerSetup.runCompose(deployDir, ["pull"], send))) return { ok: false, error: "Could not download the current CDM image." };
    send("Starting CDM and PostgreSQL..."); if (!(await dockerSetup.runCompose(deployDir, ["up", "-d"], send))) return { ok: false, error: "Could not start CDM." };
    send("Applying the current database schema..."); await new Promise((r) => setTimeout(r, 8000)); await dockerSetup.runCompose(deployDir, ["exec", "-T", "app", "npx", "prisma", "db", "push", "--skip-generate"], send);
    const localUrl = `http://localhost:${port}`; send("Checking that CDM is responding..."); const healthy = await dockerSetup.waitForHealthy(`${localUrl}/api/health`, send); if (healthy) shell.openExternal(localUrl);
    return { ok: healthy, url: localUrl, error: healthy ? undefined : "CDM started but did not respond to its health check." };
  } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
});
