"use strict";

const $ = (id) => document.getElementById(id);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let liveAppUrl = "";

function showErr(msg) {
  const b = $("errBox");
  b.textContent = msg || "";
  b.style.display = msg ? "block" : "none";
}

function goStep(n) {
  showErr("");
  if (n === 2) {
    const sub = $("azure_subscription_id").value.trim();
    const ten = $("azure_tenant_id").value.trim();
    const cid = $("azure_client_id").value.trim();
    const sec = $("azure_client_secret").value.trim();
    const pn = $("project_name").value.trim().toLowerCase();

    if (!UUID_RE.test(sub)) {
      showErr("Enter a valid Azure Subscription ID (UUID format).");
      return;
    }
    if (!UUID_RE.test(ten)) {
      showErr("Enter a valid Azure Tenant ID (UUID format).");
      return;
    }
    if (!UUID_RE.test(cid)) {
      showErr("Enter a valid Service Principal Client ID / App ID (UUID format).");
      return;
    }
    if (sec.length < 8) {
      showErr("Enter your Service Principal Client Secret.");
      return;
    }
    if (!/^[a-z][a-z0-9-]{1,16}[a-z0-9]$/.test(pn)) {
      showErr("Stack name must be 3–18 lowercase letters, numbers, or hyphens (for example: cdm).");
      return;
    }
  }
  for (let i = 1; i <= 3; i++) {
    $("step" + i).classList.toggle("hidden", i !== n);
    $("p" + i).classList.toggle("on", i <= n);
  }
}

$("pickJsonBtn").addEventListener("click", async () => {
  const res = await window.cdm.pickSpJson();
  if (res?.canceled) return;
  if (!res?.ok) {
    showErr(res?.error || "Invalid JSON credentials file.");
    return;
  }
  showErr("");
  if (res.subscriptionId) $("azure_subscription_id").value = res.subscriptionId;
  $("azure_tenant_id").value = res.tenantId;
  $("azure_client_id").value = res.clientId;
  $("azure_client_secret").value = res.clientSecret;
  $("jsonStatus").textContent =
    `✓ ${res.fileName}` +
    (res.subscriptionId ? ` (${res.subscriptionId.slice(0, 8)}...)` : " (enter Subscription ID)");
  $("jsonStatus").classList.add("loaded");
});

$("nextToStep2").addEventListener("click", () => goStep(2));
$("backToStep1").addEventListener("click", () => goStep(1));
$("editKeysBtn").addEventListener("click", () => goStep(2));

async function beginInstall() {
  showErr("");
  const payload = {
    azure_subscription_id: $("azure_subscription_id").value.trim(),
    azure_tenant_id: $("azure_tenant_id").value.trim(),
    azure_client_id: $("azure_client_id").value.trim(),
    azure_client_secret: $("azure_client_secret").value.trim(),
    azure_region: $("azure_region").value,
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
  $("step3Title").textContent = "Installing CDM on Azure";
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
  setTimeout(() => {
    $("copyBtn").textContent = "Copy";
  }, 1500);
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
      $("statusText").textContent = "CDM is live on Azure!";
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
