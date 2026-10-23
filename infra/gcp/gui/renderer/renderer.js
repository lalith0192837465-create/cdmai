"use strict";
const $ = (id) => document.getElementById(id);
const folderButton = $("folderButton"), startButton = $("startButton"), folderPath = $("folderPath");
const promptCard = $("promptCard"), answerForm = $("answerForm"), answerInput = $("answerInput");
let selectedFolder = "", activePrompt = null, started = false, finished = false;
function addLog(text, style="") {
  const log = $("log"); const empty = log.querySelector(".empty"); if (empty) empty.remove();
  const line = document.createElement("div"); line.className = `log-line ${style}`;
  const parts = String(text).split(/(https:\/\/[^\s<>"']+)/g);
  for (const part of parts) {
    if (/^https:\/\//i.test(part)) {
      const link = document.createElement("button"); link.type = "button"; link.className = "link"; link.textContent = part;
      link.addEventListener("click", () => window.cdm.openLink(part)); line.appendChild(link);
    } else line.appendChild(document.createTextNode(part));
  }
  log.appendChild(line); log.scrollTop = log.scrollHeight;
}
function setStatus(text) { $("liveText").textContent = text; }
function renderPrompt(event) {
  activePrompt = event; promptCard.classList.remove("hidden");
  $("promptTitle").textContent = event.kind === "plan" ? "Review before creating a plan" : event.kind === "apply" ? "Final deployment confirmation" : event.label;
  $("promptType").textContent = event.kind === "plan" ? "PLAN REVIEW" : event.kind === "apply" ? "FINAL APPROVAL" : event.secret ? "PRIVATE INPUT" : "SETUP QUESTION";
  $("answerLabel").textContent = event.label;
  $("promptHelp").textContent = event.kind === "apply" ? "This is the only step that applies resources. Read the Terraform plan above, confirm costs and resources, then type the exact phrase shown." : event.secret ? "This value is sent only to the local setup process and is not displayed in the activity log." : event.kind === "plan" ? "This creates local setup files and runs Terraform to prepare a review plan. It does not apply cloud changes." : event.defaultValue ? `Press Continue to use the suggested value: ${event.defaultValue}` : "Enter your answer to continue.";
  answerInput.type = event.secret ? "password" : "text"; answerInput.value = event.defaultValue || ""; answerInput.placeholder = event.defaultValue || "";
  answerInput.required = event.kind !== "apply" && !event.defaultValue && !event.label.includes("(leave blank if unused)");
  $("answerButton").textContent = event.kind === "apply" ? "Confirm and apply" : event.kind === "plan" ? "Prepare review plan" : "Continue";
  $("answerButton").className = event.kind === "apply" ? "button primary" : "button primary";
  answerInput.focus();
}
folderButton.addEventListener("click", async () => {
  const result = await window.cdm.chooseFolder(); if (!result?.path) return;
  selectedFolder = result.path; folderPath.textContent = selectedFolder; startButton.disabled = false;
});
startButton.addEventListener("click", async () => {
  if (!selectedFolder || started) return;
  started = true; startButton.disabled = true; folderButton.disabled = true; $("setupCard").querySelector("h2").textContent = "Setup is running";
  setStatus("RUNNING"); addLog(`Saving generated files under: ${selectedFolder}`);
  const result = await window.cdm.start(); if (!result?.ok) { addLog(result?.error || "Could not start setup.", "error"); started = false; }
});
answerForm.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!activePrompt) return;
  const current = activePrompt; const value = answerInput.value;
  if (current.kind === "apply" && value !== current.label.match(/Type (APPLY .*) to apply/)?.[1]) {
    addLog("Apply not confirmed: type the exact APPLY phrase shown in the question.", "warning"); return;
  }
  $("answerButton").disabled = true;
  const result = await window.cdm.answer(current.id, value);
  $("answerButton").disabled = false;
  if (!result?.ok) { addLog(result?.error || "That answer could not be sent. The setup may have stopped.", "error"); return; }
  if (current.secret) answerInput.value = "";
  activePrompt = null; promptCard.classList.add("hidden");
  if (current.kind === "apply") { setStatus("APPLYING"); addLog("Exact project-specific APPLY confirmation received. Keep this window open until Terraform finishes.", "warning"); }
  else if (current.kind === "plan") { setStatus("PREPARING PLAN"); addLog("Preparing the local setup and Terraform review plan. No apply has been approved."); }
});
window.cdm.onEvent((event) => {
  if (event.type === "log") {
    const line = event.text || ""; const lower = line.toLowerCase();
    const style = lower.includes("error") || lower.includes("failed") || lower.includes("stopped") ? "error" : lower.includes("nothing was changed") || lower.includes("can incur") || lower.includes("review") ? "warning" : "";
    addLog(line, style);
    const progress = line.match(/(\d{1,3})%\s*[—-]\s*(.*)/); if (progress) setStatus(`${progress[1]}%`);
    if (/Missing required tools|Nothing was changed/i.test(line)) setStatus("NEEDS TOOLS");
  } else if (event.type === "prompt") renderPrompt(event);
  else if (event.type === "status") { setStatus("RUNNING"); if (event.text) addLog(event.text); }
  else if (event.type === "fatal") { addLog(event.text, "error"); setStatus("ERROR"); }
  else if (event.type === "applying") { setStatus("APPLYING"); }
  else if (event.type === "finished") {
    finished = true; setStatus(event.code === 0 ? "COMPLETE" : "STOPPED");
    $("finishCard").classList.remove("hidden"); $("finishTitle").textContent = event.code === 0 ? "Setup finished" : "Setup stopped safely"; $("finishText").textContent = event.text;
    addLog(event.text, event.code === 0 ? "success" : "warning"); startButton.textContent = "Close setup"; startButton.disabled = false; startButton.onclick = () => window.close();
  }
});
