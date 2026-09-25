const { spawn, exec } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false, ...opts });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (err += d.toString()));
    p.on("error", () => resolve({ ok: false, out, err: "not found" }));
    p.on("close", (code) => resolve({ ok: code === 0, out, err }));
  });
}

async function checkDockerInstalled() {
  const r = await run("docker", ["--version"]);
  return r.ok;
}

async function checkDockerRunning() {
  const r = await run("docker", ["info"]);
  return r.ok;
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = (u) =>
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total && onProgress) onProgress(Math.round((received / total) * 100));
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(dest)));
      }).on("error", reject);
    req(url);
  });
}

// Docker Desktop / Docker Engine cannot be installed with zero OS prompts —
// Windows shows UAC, Mac asks for your password once (Gatekeeper), Linux
// needs a privilege-escalation dialog for the package manager. This code
// automates everything around those unavoidable OS security prompts.
async function installDocker(platform, onStatus) {
  const tmp = os.tmpdir();

  if (platform === "win32") {
    const dest = path.join(tmp, "DockerDesktopInstaller.exe");
    onStatus("Downloading Docker Desktop...");
    await downloadFile(
      "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe",
      dest,
      (pct) => onStatus(`Downloading Docker Desktop... ${pct}%`)
    );
    onStatus("Launching Docker Desktop installer — approve the Windows prompt if asked.");
    await run(dest, ["install", "--quiet", "--accept-license"]);
    onStatus("Docker Desktop installed. Waiting for it to start...");
    return true;
  }

  if (platform === "darwin") {
    const arch = os.arch() === "arm64" ? "arm64" : "amd64";
    const dest = path.join(tmp, "Docker.dmg");
    onStatus("Downloading Docker Desktop...");
    await downloadFile(
      `https://desktop.docker.com/mac/main/${arch}/Docker.dmg`,
      dest,
      (pct) => onStatus(`Downloading Docker Desktop... ${pct}%`)
    );
    onStatus("Mounting installer...");
    await run("hdiutil", ["attach", dest, "-nobrowse"]);
    onStatus("Installing to Applications — you may see a permissions prompt.");
    await run("cp", ["-R", "/Volumes/Docker/Docker.app", "/Applications/"]);
    await run("hdiutil", ["detach", "/Volumes/Docker"]);
    onStatus("Starting Docker Desktop...");
    await run("open", ["-a", "Docker"]);
    return true;
  }

  // Linux: no single silent path across distros. Best effort via the
  // official convenience script, run through a graphical privilege prompt
  // if one is available.
  onStatus("Installing Docker via get.docker.com (you'll be asked for your password)...");
  const hasPkexec = (await run("which", ["pkexec"])).ok;
  const script = "curl -fsSL https://get.docker.com | sh";
  if (hasPkexec) {
    await run("pkexec", ["sh", "-c", script]);
  } else {
    await run("sh", ["-c", `sudo ${script}`]);
  }
  return true;
}

async function waitForDockerRunning(onStatus, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkDockerRunning()) return true;
    onStatus("Waiting for Docker to finish starting...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

function writeDeployFiles(dir, envContents, composeContents) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".env"), envContents);
  fs.writeFileSync(path.join(dir, "docker-compose.yml"), composeContents);
}

function runCompose(dir, args, onLine) {
  return new Promise((resolve) => {
    const p = spawn("docker", ["compose", ...args], { cwd: dir });
    p.stdout.on("data", (d) => onLine(d.toString()));
    p.stderr.on("data", (d) => onLine(d.toString()));
    p.on("close", (code) => resolve(code === 0));
    p.on("error", (e) => {
      onLine(String(e));
      resolve(false);
    });
  });
}

async function waitForHealthy(url, onStatus, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    onStatus("Waiting for the app to respond...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

module.exports = {
  checkDockerInstalled,
  checkDockerRunning,
  installDocker,
  waitForDockerRunning,
  writeDeployFiles,
  runCompose,
  waitForHealthy,
};
