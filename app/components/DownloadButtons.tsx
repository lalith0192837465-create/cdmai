"use client";

import { useEffect, useState } from "react";

const RELEASES_BASE =
  "https://github.com/lalith0192837465-create/cdmai/releases/latest/download";

const OPTIONS = [
  { id: "win", label: "Windows", file: "CDM-Setup-Windows.exe", description: "Desktop installer" },
  { id: "mac", label: "macOS", file: "CDM-Setup-Mac.dmg", description: "Desktop installer" },
  { id: "aws", label: "AWS", file: "CDM-AWS-Setup.zip", description: "Customer-cloud deployment package" },
];

function detectOS(): string {
  if (typeof navigator === "undefined") return "win";
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "mac";
  return "win";
}

export default function DownloadButtons() {
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => { setDetected(detectOS()); }, []);

  return (
    <div className="grid-3">
      {OPTIONS.map((opt) => (
        <a
          key={opt.id}
          href={`${RELEASES_BASE}/${opt.file}`}
          className={`download-card${detected === opt.id ? " recommended" : ""}`}
        >
          {detected === opt.id && <span className="tag">Recommended for you</span>}
          <h3>{opt.label}</h3>
          <p>{opt.description}</p>
        </a>
      ))}
    </div>
  );
}
