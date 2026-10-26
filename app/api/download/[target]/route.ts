import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const RELEASES_BASE = "https://github.com/lalith0192837465-create/cdmai/releases/latest/download";
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks — safely below Cloud Run's 32 MB response cap

const TARGETS: Record<string, { file: string; contentType: string }> = {
  win: { file: "CDM-Setup-Windows.exe", contentType: "application/octet-stream" },
  mac: { file: "CDM-Setup-Mac.dmg", contentType: "application/octet-stream" },
  aws: { file: "CDM-AWS-Setup.zip", contentType: "application/zip" },
  gcp: { file: "CDM-GCP-Setup.exe", contentType: "application/octet-stream" },
};

let gcpBuildPromise: Promise<{ path: string; size: number; sha256: string } | null> | null = null;
let cachedGcpInfo: { mtimeMs: number; size: number; sha256: string } | null = null;

function computeSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function ensureFreshGcpExecutable(): Promise<{ path: string; size: number; sha256: string } | null> {
  const cliPath = path.join(process.cwd(), "infra", "gcp", "gcp-cli.js");
  const assetsPath = path.join(process.cwd(), "infra", "gcp", "gcp-assets.js");
  const outPath = "/tmp/CDM-GCP-Setup.exe";

  if (!fs.existsSync(cliPath)) return null;

  try {
    if (fs.existsSync(outPath)) {
      const outStat = fs.statSync(outPath);
      const cliMtime = fs.statSync(cliPath).mtimeMs;
      const assetsMtime = fs.existsSync(assetsPath) ? fs.statSync(assetsPath).mtimeMs : 0;
      if (outStat.size > 10_000_000 && outStat.mtimeMs >= Math.max(cliMtime, assetsMtime)) {
        if (!cachedGcpInfo || cachedGcpInfo.mtimeMs !== outStat.mtimeMs || cachedGcpInfo.size !== outStat.size) {
          cachedGcpInfo = {
            mtimeMs: outStat.mtimeMs,
            size: outStat.size,
            sha256: computeSha256(outPath),
          };
        }
        return { path: outPath, size: outStat.size, sha256: cachedGcpInfo.sha256 };
      }
    }
  } catch {
    // Rebuild if check fails
  }

  if (!gcpBuildPromise) {
    gcpBuildPromise = (async () => {
      try {
        const tmpBuild = `/tmp/CDM-GCP-Setup.${Date.now()}.exe`;
        await execFileAsync(
          "npx",
          [
            "--yes",
            "@yao-pkg/pkg@6.23.0",
            "--target",
            "node22-win-x64",
            "--output",
            tmpBuild,
            "--public-packages",
            "*",
            cliPath,
          ],
          { cwd: process.cwd(), timeout: 120_000 }
        );
        if (!fs.existsSync(tmpBuild)) return null;
        fs.renameSync(tmpBuild, outPath);
        const stat = fs.statSync(outPath);
        const sha256 = computeSha256(outPath);
        cachedGcpInfo = { mtimeMs: stat.mtimeMs, size: stat.size, sha256 };
        return { path: outPath, size: stat.size, sha256 };
      } catch (err) {
        console.warn("[Download] Local GCP executable build unavailable:", err);
        return null;
      } finally {
        gcpBuildPromise = null;
      }
    })();
  }

  return gcpBuildPromise;
}

async function resolveDirectGithubAssetUrl(file: string): Promise<string | null> {
  let url = `${RELEASES_BASE}/${file}`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "CDM-Download-Resolver/1.0" },
    });
    const location = res.headers.get("location");
    if (location) {
      url = new URL(location, url).toString();
      continue;
    }
    if (res.ok) return url;
    return null;
  }
  return url;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ target: string }> }
) {
  const { target } = await context.params;
  const item = TARGETS[target];

  if (!item) {
    return NextResponse.json({ ok: false, error: "Unknown download target" }, { status: 404 });
  }

  const search = req.nextUrl.searchParams;
  const isMeta = search.get("meta") === "1";

  if (target === "gcp") {
    const built = await ensureFreshGcpExecutable();
    if (built && fs.existsSync(built.path)) {
      if (isMeta) {
        return NextResponse.json({
          ok: true,
          mode: "chunked",
          filename: item.file,
          size: built.size,
          chunkSize: CHUNK_SIZE,
          sha256: built.sha256,
        });
      }

      const startParam = search.get("start");
      const endParam = search.get("end");
      if (startParam !== null && endParam !== null) {
        const start = Math.max(0, Number(startParam));
        const end = Math.min(built.size - 1, Number(endParam));
        if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end - start + 1 > 16 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: "Invalid byte range" }, { status: 400 });
        }
        const length = end - start + 1;
        const buffer = Buffer.allocUnsafe(length);
        const fd = fs.openSync(built.path, "r");
        try {
          const bytesRead = fs.readSync(fd, buffer, 0, length, start);
          return new Response(buffer.subarray(0, bytesRead), {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(bytesRead),
              "Cache-Control": "no-store",
            },
          });
        } finally {
          fs.closeSync(fd);
        }
      }
    }
  }

  // Fallback / GitHub Release resolution (resolves github.com 302s server-side so iframe never hits X-Frame-Options: deny)
  try {
    const directUrl = await resolveDirectGithubAssetUrl(item.file);
    if (!directUrl) {
      return NextResponse.json(
        { ok: false, error: `Release asset ${item.file} is unavailable.` },
        { status: 502 }
      );
    }
    if (isMeta) {
      return NextResponse.json({
        ok: true,
        mode: "direct",
        filename: item.file,
        directUrl,
      });
    }
    return NextResponse.redirect(directUrl, 302);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Download resolution failed" },
      { status: 502 }
    );
  }
}
