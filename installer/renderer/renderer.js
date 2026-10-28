function goStep(n) {
  for (const id of ["step1", "step2", "step3", "gcpStep1", "gcpStep2", "gcpStep3", "gcpStep4"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  document.getElementById("step" + n).style.display = "";
  for (let i = 1; i <= 3; i++) {
    document.getElementById("p" + i).classList.toggle("on", i <= n);
  }
}

function val(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function chooseTarget(target) {
  const note = document.getElementById("cloudNote");
  if (note) note.style.display = "none";
  if (target === "local") {
    goStep(2);
    return;
  }
  if (target === "gcp") {
    goGcp(1);
    return;
  }
  if (target !== "aws" && target !== "azure") return;

  const isAzure = target === "azure";
  const providerName = isAzure ? "Azure" : "AWS";
  const exeName = isAzure ? "CDM-Azure-Setup.exe" : "CDM-AWS-Setup.exe";

  note.style.display = "block";
  note.replaceChildren();

  const text = document.createElement("p");
  text.style.marginBottom = "10px";
  text.textContent = `${providerName} guided installer (${exeName}) selected. Download it to connect your ${providerName} credentials and deploy CDM directly.`;
  note.append(text);

  const b = document.createElement("button");
  b.className = "btn btn-primary";
  b.textContent = `Download ${providerName} setup`;
  b.onclick = async () => {
    const r = await window.api.openCloudPackage(target);
    if (r && !r.ok) {
      text.textContent = r.error || `Could not open the ${providerName} setup download.`;
    } else {
      text.textContent = `${providerName} setup download opened (${exeName}). Run it to complete your ${providerName} deployment.`;
    }
  };
  note.append(b);
}

function goGcp(n) {
  for (const id of ["step1", "step2", "step3", "gcpStep1", "gcpStep2", "gcpStep3", "gcpStep4"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  document.getElementById("gcpStep" + n).style.display = "";
  for (let i = 1; i <= 3; i++) {
    document.getElementById("p" + i).classList.toggle("on", i <= Math.min(n, 3));
  }
}

function gcpNext(n) {
  if (n === 2 && !val("gcpProject")) {
    alert("Enter the customer’s Google Cloud project ID to continue.");
    return;
  }
  if (n === 3 && !val("gcpRegion")) {
    alert("Enter a preferred Google Cloud region to continue.");
    return;
  }
  goGcp(n);
}

function gcpData() {
  return {
    project_id: val("gcpProject"),
    region: val("gcpRegion"),
    network_setup: document.getElementById("gcpVpc").value,
    preferred_domain: val("gcpDomain") || "Not provided",
    deployment_authorization: document.getElementById("gcpCred").value,
    audit_log_destination: document.getElementById("gcpAudit").value,
  };
}

function gcpReview() {
  if (!val("gcpProject") || !val("gcpRegion")) {
    goGcp(1);
    alert("Project ID and region are required.");
    return;
  }
  const d = gcpData();
  const lines = [
    "CDM — Google Cloud setup handoff",
    "",
    "Project ID: " + d.project_id,
    "Preferred region: " + d.region,
    "VPC / private service access: " + d.network_setup,
    "Preferred app domain: " + d.preferred_domain,
    "Deployment authorization: " + d.deployment_authorization,
    "Audit log destination: " + d.audit_log_destination,
    "",
    "Next: customer cloud/platform team reviews the included GCP README and confirms network, database, IAM, cost, OAuth, and secrets requirements before applying infrastructure.",
    "No credentials or API keys are included. This installer does not provision resources.",
  ];
  document.getElementById("gcpSummary").textContent = lines.join("\n");
  goGcp(4);
}

async function saveGcpPlan() {
  const out = await window.api.saveGcpPlan(gcpData());
  if (out?.ok) {
    const e = document.getElementById("gcpSuccess");
    e.textContent = "Setup summary saved on this computer.";
    e.style.display = "block";
  } else if (!out?.cancelled) {
    const e = document.getElementById("gcpError");
    e.textContent = out?.error || "Could not save the setup summary.";
    e.style.display = "block";
  }
}

async function downloadGcp() {
  const r = await window.api.openCloudPackage("gcp");
  if (!r?.ok) {
    const e = document.getElementById("gcpError");
    e.textContent = r?.error || "Could not open the GCP setup download.";
    e.style.display = "block";
  } else {
    const e = document.getElementById("gcpSuccess");
    e.textContent = "GCP guided setup download opened. Save the setup summary and run CDM-GCP-Setup.exe when ready.";
    e.style.display = "block";
  }
}

function logLine(text) {
  const log = document.getElementById("log");
  const line = document.createElement("div");
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

window.api.onStatus((status) => logLine(status));
let installing = false;

async function startInstall() {
  if (installing) return;
  installing = true;
  const btn = document.getElementById("installBtn");
  btn.disabled = true;
  btn.textContent = "Installing...";
  document.getElementById("errorBox").style.display = "none";
  document.getElementById("log").innerHTML = "";
  logLine("Checking Docker...");
  const result = await window.api.installAndLaunch({
    port: val("port"),
    adminEmail: val("adminEmail"),
    adminPassword: document.getElementById("adminPassword")?.value || "",
    gid: val("gid"),
    gsecret: val("gsecret"),
    gemini: val("gemini"),
    anthropic: val("anthropic"),
    skribby: val("skribby"),
    webhook: val("webhook"),
    slack: val("slack"),
  });
  installing = false;
  btn.disabled = false;
  btn.textContent = result.ok ? "Open CDM again" : "Retry";
  if (result.ok) {
    logLine(`CDM is running at ${result.url}`);
    btn.onclick = () => window.api.openUrl ? window.api.openUrl(result.url) : window.open(result.url);
  } else {
    const box = document.getElementById("errorBox");
    box.textContent = result.error;
    box.style.display = "block";
  }
}
