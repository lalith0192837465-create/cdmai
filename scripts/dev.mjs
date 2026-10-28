import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 3000;
const HOST = "0.0.0.0";
const lockPath = path.join(process.cwd(), ".next", "dev", "lock");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupStaleNextDev() {
  try {
    if (fs.existsSync(lockPath)) {
      const raw = fs.readFileSync(lockPath, "utf8");
      const parsed = JSON.parse(raw);
      const oldPid = Number(parsed?.pid);
      if (isAlive(oldPid)) {
        try {
          process.kill(oldPid, "SIGTERM");
        } catch {}
        for (let i = 0; i < 15 && isAlive(oldPid); i++) {
          await sleep(100);
        }
        if (isAlive(oldPid)) {
          try {
            process.kill(oldPid, "SIGKILL");
          } catch {}
          await sleep(150);
        }
      }
      fs.rmSync(lockPath, { force: true });
    }
  } catch {
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {}
  }
}

function checkPortFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => resolve(false));
    srv.listen({ port, host, exclusive: true }, () => {
      srv.close(() => resolve(true));
    });
  });
}

async function waitForPortFree(port, host, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkPortFree(port, host)) return true;
    await sleep(150);
  }
  return false;
}

await cleanupStaleNextDev();
await waitForPortFree(PORT, HOST);

const nextBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

const child = spawn(nextBin, ["dev", "-p", String(PORT), "-H", HOST], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

const forwardSignal = (sig) => {
  if (child && !child.killed) {
    try {
      child.kill(sig);
    } catch {}
  }
};

process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGHUP", () => forwardSignal("SIGHUP"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
