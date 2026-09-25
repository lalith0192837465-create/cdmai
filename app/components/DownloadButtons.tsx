"use client";

import { useEffect, useState } from "react";

const RELEASES_BASE =
  "https://github.com/lalith0192837465-create/cdm/releases/latest/download";

const OPTIONS = [
  { id: "win", label: "Windows", icon: "🪟", file: "CDM-Setup-Windows.exe" },
  { id: "mac", label: "macOS", icon: "🍎", file: "CDM-Setup-Mac.dmg" },
  { id: "linux", label: "Linux", icon: "🐧", file: "CDM-Setup-Linux.AppImage" },
];

function detectOS(): string {
  if (typeof navigator === "undefined") return "win";
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "mac";
  if (ua.includes("Linux") && !ua.includes("Android")) return "linux";
  return "win";
}

export default function DownloadButtons() {
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    setDetected(detectOS());
  }, []);

  return (
    <div className="grid-3">
      {OPTIONS.map((opt) => (
        <a
          key={opt.id}
          href={`${RELEASES_BASE}/${opt.file}`}
          className={`download-card${detected === opt.id ? " recommended" : ""}`}
        >
          {detected === opt.id && <span className="tag">Recommended for you</span>}
          <div className="os-icon">{opt.icon}</div>
          <h3>{opt.label}</h3>
          <p>Download installer</p>
        </a>
      ))}
    </div>
  );
}
