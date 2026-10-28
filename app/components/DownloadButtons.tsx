"use client";
import { useState } from "react";

type CloudTarget = "aws" | "gcp" | "azure";

const CLOUD_OPTIONS: { target: CloudTarget; label: string; filename: string }[] = [
  { target: "aws", label: "AWS", filename: "CDM-AWS-Setup.exe" },
  { target: "gcp", label: "Google Cloud", filename: "CDM-GCP-Setup.exe" },
  { target: "azure", label: "Azure", filename: "CDM-Azure-Setup.exe" },
];

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function DownloadButtons() {
  const [activeTarget, setActiveTarget] = useState<CloudTarget | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCloudDownload(target: CloudTarget, fallbackFilename: string, e: React.MouseEvent) {
    e.preventDefault();
    if (activeTarget) return;
    setErrorMsg(null);
    setActiveTarget(target);
    setStatusText("Preparing...");

    try {
      const metaRes = await fetch(`/api/download/${target}?meta=1`, { cache: "no-store" });
      const meta = await metaRes.json();
      if (!metaRes.ok || !meta?.ok) {
        throw new Error(meta?.error || "Could not prepare download.");
      }

      if (meta.mode === "direct" && meta.directUrl) {
        const a = document.createElement("a");
        a.href = meta.directUrl;
        a.download = meta.filename || fallbackFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatusText("");
        return;
      }

      if (meta.mode === "chunked") {
        const totalSize = Number(meta.size);
        const chunkSize = Number(meta.chunkSize);
        const parts: Uint8Array[] = [];
        let received = 0;

        for (let start = 0; start < totalSize; start += chunkSize) {
          const end = Math.min(totalSize - 1, start + chunkSize - 1);
          const pct = Math.round((received / totalSize) * 100);
          setStatusText(`Downloading ${pct}%...`);

          const chunkRes = await fetch(`/api/download/${target}?start=${start}&end=${end}`, {
            cache: "no-store",
          });
          if (!chunkRes.ok) {
            throw new Error(`Download failed at ${pct}% (HTTP ${chunkRes.status}).`);
          }
          const ab = await chunkRes.arrayBuffer();
          const bytes = new Uint8Array(ab);
          if (bytes.byteLength !== end - start + 1) {
            throw new Error("Incomplete chunk received — aborted to prevent corrupted file.");
          }
          if (start === 0 && (bytes[0] !== 0x4d || bytes[1] !== 0x5a)) {
            throw new Error("Invalid Windows executable header.");
          }
          parts.push(bytes);
          received += bytes.byteLength;
        }

        if (received !== totalSize) {
          throw new Error("File size mismatch.");
        }

        setStatusText("Verifying...");
        const blob = new Blob(parts as BlobPart[], { type: "application/octet-stream" });
        if (meta.sha256 && typeof crypto !== "undefined" && crypto.subtle) {
          const actualHash = await sha256Hex(blob);
          if (actualHash !== meta.sha256) {
            throw new Error("Checksum verification failed.");
          }
        }

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = meta.filename || fallbackFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        setStatusText("");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Download failed.");
      setStatusText("");
    } finally {
      setActiveTarget(null);
    }
  }

  return (
    <div>
      <div className="download-grid-3">
        {CLOUD_OPTIONS.map(({ target, label, filename }) => {
          const isBusy = activeTarget === target;
          const otherBusy = activeTarget !== null && !isBusy;
          const cardClass = [
            "download-card recommended",
            isBusy ? "busy-active" : "",
            otherBusy ? "busy-other" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <a
              key={target}
              href={`/api/download/${target}`}
              onClick={(e) => handleCloudDownload(target, filename, e)}
              className={cardClass}
            >
              <h3>{isBusy ? statusText || label : label}</h3>
              <span className="download-sub">
                {isBusy ? "Please keep this tab open" : "Download guided installer"}
              </span>
            </a>
          );
        })}
      </div>

      {errorMsg && <p className="download-error">{errorMsg}</p>}
    </div>
  );
}
