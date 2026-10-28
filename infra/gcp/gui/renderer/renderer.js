"use strict";

const $ = (id) => document.getElementById(id);
let serviceAccountJson = "";
let liveAppUrl = "";

function showErr(msg) {
  const b = $("errBox");
  b.textContent = msg || "";
  b.style.display = msg ? "block" : "none";
}

function goStep(n) {
  showErr("");
  if (n === 2) {
    const pid = $("project_id").value.trim();
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(pid)) {
      showErr("Enter your Google Cloud Project ID (for example: my-company-prod).");
      return;
    }
  }
  for (let i = 1; i <= 3; i++) {
    $("step" + i).classList.toggle("hidden", i !== n);
    $("p" + i).classList.toggle("on", i <= n);
  }
}

$("pickKeyBtn").addEventListener("click", async () => {
  const res = await window.cdm.pickKey();
  if (res?.canceled) return;
  if (!res?.ok) {
    showErr(res?.error || "Invalid key file.");
    return;
  }
  showErr("");
  serviceAccountJson = res.rawJson;
  $("keyStatus").textContent = `✓ ${res.fileName} (${res.clientEmail})`;
  $("keyStatus").classList.add("loaded");
  if (res.projectId && !$("project_id").value.trim()) {
    $("project_id").value = res.projectId;
  }
});

$("nextToStep2").addEventListener("click", () => goStep(2));
$("backToStep1").addEventListener("click", () => goStep(1));
$("editKeysBtn").addEventListener("click", () => goStep(2));

async function beginInstall() {
  showErr("");
  const payload = {
    project_id: $("project_id").value.trim(),
    region: $("region").value,
    service_account_json: serviceAccountJson,
    admin_email: $("admin_email").value.trim(),
    admin_password: $("admin_password").value,
    google_client_id: $("google_client_id").value.trim(),
    google_client_secret: $("google_client_secret").value.trim(),
    gemini_api_key: $("gemini_api_key").value.trim(),
    skribby_api_key: $("skribby_api_key").value.trim(),
    slack_webhook_url: $("slack_webhook_url").value.trim(),
  };

  if (!payload.admin_email || !payload.admin_email.includes("@")) {
    showErr("Please enter a valid Workspace Admin Email.");
    return;
  }
  if (!payload.admin_password || payload.admin_password.length < 8) {
    showErr("Workspace Admin Password must be at least 8 characters.");
    return;
  }
  if (!payload.gemini_api_key) {
    showErr("Please enter your Gemini API Key.");
    return;
  }

  $("logBox").textContent = "";
  $("barFill").style.width = "5%";
  $("statusText").textContent = "Starting installation...";
  $("doneBox").style.display = "none";
  $("retryRow").classList.add("hidden");
  $("step3Title").textContent = "Installing CDM on Google Cloud";
  goStep(3);

  const res = await window.cdm.install(payload);
  if (!res?.ok) {
    showErr(res?.error || "Could not start installation.");
    $("retryRow").classList.remove("hidden");
  }
}

$("installBtn").addEventListener("click", beginInstall);
$("retryBtn").addEventListener("click", beginInstall);

$("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("callbackUrl").value);
  $("copyBtn").textContent = "Copied!";
  setTimeout(() => { $("copyBtn").textContent = "Copy"; }, 1500);
});

$("openAppBtn").addEventListener("click", () => {
  if (liveAppUrl) window.cdm.openUrl(liveAppUrl);
});

window.cdm.onEvent((evt) => {
  if (evt.kind === "progress") {
    if (typeof evt.progress === "number") $("barFill").style.width = `${evt.progress}%`;
    if (evt.status) $("statusText").textContent = evt.status;
    if (evt.line) {
      $("logBox").textContent += evt.line + "\n";
      $("logBox").scrollTop = $("logBox").scrollHeight;
    }
  } else if (evt.kind === "result") {
    if (evt.ok && evt.serviceUrl) {
      liveAppUrl = evt.serviceUrl;
      $("barFill").style.width = "100%";
      $("statusText").textContent = "CDM is live!";
      $("step3Title").textContent = "CDM Installed Successfully";
      $("oauthHint").classList.toggle("hidden", !Boolean($("google_client_id").value.trim()));
      $("callbackUrl").value = liveAppUrl.replace(/\/$/, "") + "/api/auth/callback/google";
      $("liveUrlLabel").textContent = liveAppUrl;
      $("doneBox").style.display = "block";
    } else {
      showErr(evt.error || "Installation stopped.");
      $("statusText").textContent = "Installation stopped";
      $("retryRow").classList.remove("hidden");
    }
  } else if (evt.kind === "closed" && !liveAppUrl) {
    $("retryRow").classList.remove("hidden");
  }
});
