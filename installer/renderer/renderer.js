function goStep(n) {
  for (const s of [1, 2, 3]) {
    document.getElementById("step" + s).style.display = s === n ? "" : "none";
    document.getElementById("p" + s).classList.toggle("on", s <= n);
  }
}

function val(id) {
  return document.getElementById(id).value.trim();
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
  document.getElementById("installBtn").disabled = true;
  document.getElementById("installBtn").textContent = "Installing...";
  document.getElementById("errorBox").style.display = "none";
  document.getElementById("log").innerHTML = "";
  logLine("Checking for Docker...");

  const config = {
    domain: val("domain"),
    port: val("port"),
    gid: val("gid"),
    gsecret: val("gsecret"),
    anthropic: val("anthropic"),
    recall: val("recall"),
    region: val("region"),
    slack: val("slack"),
  };

  const result = await window.api.installAndLaunch(config);
  installing = false;
  document.getElementById("installBtn").disabled = false;
  document.getElementById("installBtn").textContent = "Retry";

  if (result.ok) {
    logLine(`CDM is running at ${result.url}`);
    document.getElementById("installBtn").textContent = "Done — open CDM again";
    document.getElementById("installBtn").onclick = () => window.open(result.url);
  } else {
    const box = document.getElementById("errorBox");
    box.textContent = result.error;
    box.style.display = "block";
  }
}
