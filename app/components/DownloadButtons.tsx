"use client";
import { useEffect, useState } from "react";

const OPTIONS = [
  { id: "aws", label: "AWS", file: "CDM-AWS-Setup.zip" },
  { id: "gcp", label: "Google Cloud", file: "CDM-GCP-Setup.exe" },
];

function detectOS(): string {
  if (typeof navigator === "undefined") return "win";
  return navigator.userAgent.includes("Mac") ? "mac" : "win";
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function DownloadButtons() {
  const [detected, setDetected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDetected(detectOS());
  }, []);

  async function handleDownload(e: React.MouseEvent, opt: (typeof OPTIONS)[number]) {
    e.preventDefault();
    if (busyId) return;
    setErrorMsg(null);
    setBusyId(opt.id);
    setStatusMap((prev) => ({ ...prev, [opt.id]: "Preparing..." }));

    try {
      const metaRes = await fetch(`/api/download/${opt.id}?meta=1`, { cache: "no-store" });
      const meta = await metaRes.json();
      if (!metaRes.ok || !meta?.ok) {
        throw new Error(meta?.error || "Could not prepare download.");
      }

      if (meta.mode === "direct" && meta.directUrl) {
        const a = document.createElement("a");
        a.href = meta.directUrl;
        a.download = opt.file;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatusMap((prev) => ({ ...prev, [opt.id]: "" }));
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
          setStatusMap((prev) => ({ ...prev, [opt.id]: `Downloading ${pct}%...` }));

          const chunkRes = await fetch(`/api/download/${opt.id}?start=${start}&end=${end}`, {
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

        setStatusMap((prev) => ({ ...prev, [opt.id]: "Verifying..." }));
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
        a.download = meta.filename || opt.file;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        setStatusMap((prev) => ({ ...prev, [opt.id]: "" }));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Download failed.");
      setStatusMap((prev) => ({ ...prev, [opt.id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="grid-4">
        {OPTIONS.map((opt) => (
          <a
            key={opt.id}
            href={`/api/download/${opt.id}`}
            onClick={(e) => handleDownload(e, opt)}
            className={`download-card${detected === opt.id ? " recommended" : ""}`}
            style={{ opacity: busyId && busyId !== opt.id ? 0.6 : 1 }}
          >
            {detected === opt.id && <span className="tag">Recommended for you</span>}
            <h3>{statusMap[opt.id] || opt.label}</h3>
          </a>
        ))}
      </div>
      {errorMsg && (
        <p style={{ color: "#E5484D", fontSize: "0.85rem", marginTop: "12px", textAlign: "center" }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
