"use strict";

const $ = (id) => document.getElementById(id);
let liveAppUrl = "";

function showErr(msg) {
  const b = $("errBox");
  b.textContent = msg || "";
  b.style.display = msg ? "block" : "none";
}

function goStep(n) {
  showErr("");
  if (n === 2) {
    const ak = $("aws_access_key_id").value.trim();
    const sk = $("aws_secret_access_key").value.trim();
    const pn = $("project_name").value.trim().toLowerCase();
    if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(ak)) {
      showErr("Enter a valid AWS Access Key ID (starts with AKIA or ASIA, 20 characters).");
      return;
    }
    if (sk.length < 20) {
      showErr("Enter your AWS Secret Access Key.");
      return;
    }
    if (!/^[a-z][a-z0-9-]{1,22}[a-z0-9]$/.test(pn)) {
      showErr("Stack name must be 3–24 lowercase letters, numbers, or hyphens (for example: cdm).");
      return;
    }
  }
  for (let i = 1; i <= 3; i++) {
    $("step" + i).classList.toggle("hidden", i !== n);
    $("p" + i).classList.toggle("on", i <= n);
  }
}

$("pickCsvBtn").addEventListener("click", async () => {
  const res = await window.cdm.pickCsv();
  if (res?.canceled) return;
  if (!res?.ok) {
    showErr(res?.error || "Invalid CSV file.");
    return;
  }
  showErr("");
  $("aws_access_key_id").value = res.accessKeyId;
  $("aws_secret_access_key").value = res.secretAccessKey;
  $("csvStatus").textContent = `✓ ${res.fileName} (${res.accessKeyId})`;
  $("csvStatus").classList.add("loaded");
});

$("nextToStep2").addEventListener("click", () => goStep(2));
$("backToStep1").addEventListener("click", () => goStep(1));
$("editKeysBtn").addEventListener("click", () => goStep(2));

async function beginInstall() {
  showErr("");
  const payload = {
    aws_access_key_id: $("aws_access_key_id").value.trim(),
    aws_secret_access_key: $("aws_secret_access_key").value.trim(),
    aws_session_token: $("aws_session_token").value.trim(),
    aws_region: $("aws_region").value,
    project_name: $("project_name").value.trim().toLowerCase(),
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
  $("step3Title").textContent = "Installing CDM on AWS";
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
      $("statusText").textContent = "CDM is live on AWS!";
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
