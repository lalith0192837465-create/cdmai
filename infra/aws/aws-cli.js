#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { stdin, stdout } = require('node:process');
const { spawn, spawnSync } = require('node:child_process');

let embedded = {};
try { embedded = require('./aws-assets.js'); } catch (_) { embedded = {}; }

const ASSET_NAMES = ['main.tf', 'variables.tf', 'outputs.tf', 'versions.tf'];
const REGIONS = [
  { id: 'us-east-1', label: 'US East — N. Virginia (us-east-1)' },
  { id: 'us-east-2', label: 'US East — Ohio (us-east-2)' },
  { id: 'us-west-2', label: 'US West — Oregon (us-west-2)' },
  { id: 'eu-west-1', label: 'Europe — Ireland (eu-west-1)' },
  { id: 'eu-central-1', label: 'Europe — Frankfurt (eu-central-1)' },
  { id: 'ap-southeast-1', label: 'Asia Pacific — Singapore (ap-southeast-1)' },
  { id: 'ap-northeast-1', label: 'Asia Pacific — Tokyo (ap-northeast-1)' },
  { id: 'ap-south-1', label: 'Asia Pacific — Mumbai (ap-south-1)' }
];

function randomSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

function randomAlphanumeric(length = 32) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function tfString(value) {
  return JSON.stringify(String(value ?? ''));
}

function hasCommand(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true
  });
  return probe.status === 0 && Boolean(probe.stdout && probe.stdout.trim());
}

function getAppDataBase() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'CDM');
  }
  return path.join(os.homedir(), '.cdm');
}

function downloadBufferHttps(url, onProgress) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'CDM-Installer/2.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(downloadBufferHttps(nextUrl, onProgress));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      const chunks = [];
      let received = 0;
      let lastReportedBucket = -1;
      res.on('data', (chunk) => {
        chunks.push(chunk);
        received += chunk.length;
        if (total > 0 && onProgress) {
          const pct = Math.floor((received / total) * 100);
          const bucket = Math.floor(pct / 25);
          if (bucket > lastReportedBucket) {
            lastReportedBucket = bucket;
            onProgress(Math.min(100, bucket * 25));
          }
        }
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// Pure built-in Node.js ZIP single-file extractor (zero PowerShell / curl / unzip needed)
function extractSingleFileFromZip(zipBuf, targetFileName) {
  let eocd = -1;
  const minOffset = Math.max(0, zipBuf.length - 65557);
  for (let i = zipBuf.length - 22; i >= minOffset; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Downloaded archive is not a valid ZIP file.');
  const totalEntries = zipBuf.readUInt16LE(eocd + 10);
  let ptr = zipBuf.readUInt32LE(eocd + 16);

  for (let i = 0; i < totalEntries; i++) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('Corrupt ZIP central directory.');
    }
    const method = zipBuf.readUInt16LE(ptr + 10);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(ptr + 42);
    const entryName = zipBuf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    if (entryName === targetFileName || entryName.endsWith('/' + targetFileName)) {
      if (zipBuf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Corrupt ZIP local file header.');
      }
      const lfhNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
      const lfhExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
      const compData = zipBuf.slice(dataStart, dataStart + compSize);
      const out = method === 0 ? compData : method === 8 ? zlib.inflateRawSync(compData) : null;
      if (!out) throw new Error(`Unsupported ZIP compression method: ${method}`);
      if (out.length !== uncompSize) throw new Error('Extracted binary size mismatch.');
      return out;
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${targetFileName} not found inside downloaded archive.`);
}

async function ensureCloudEngine(log = console.log) {
  if (hasCommand('terraform')) {
    log('✓ Cloud deployment engine ready.');
    return;
  }
  const binDir = path.join(getAppDataBase(), 'bin');
  const exeName = process.platform === 'win32' ? 'terraform.exe' : 'terraform';
  const localExe = path.join(binDir, exeName);

  if (fs.existsSync(localExe) && fs.statSync(localExe).size > 10_000_000) {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
    log('✓ Cloud deployment engine ready (cached).');
    return;
  }

  fs.mkdirSync(binDir, { recursive: true });
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const url = `https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_${osName}_${arch}.zip`;

  log('Downloading cloud deployment engine...');
  const zipBuf = await downloadBufferHttps(url, (pct) => {
    log(`  Downloading engine... ${pct}%`);
  });
  log('Extracting cloud deployment engine...');
  const binary = extractSingleFileFromZip(zipBuf, exeName);
  const tmpExe = `${localExe}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpExe, binary, { mode: 0o755 });
  fs.renameSync(tmpExe, localExe);
  try { fs.chmodSync(localExe, 0o755); } catch (_) {}

  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  log('✓ Cloud deployment engine installed.');
}

function loadAssets() {
  const sourceDir = path.dirname(process.argv[1] || __dirname);
  const assets = {};
  for (const name of ASSET_NAMES) {
    if (embedded[name]) {
      assets[name] = Buffer.from(embedded[name]);
    } else {
      assets[name] = fs.readFileSync(path.join(sourceDir, name));
    }
    if (!assets[name] || assets[name].length === 0) {
      throw new Error(`Installer bundle is missing ${name}.`);
    }
  }
  return assets;
}

function prepareWorkspace(raw) {
  const accessKeyId = String(raw.aws_access_key_id || '').trim();
  const secretAccessKey = String(raw.aws_secret_access_key || '').trim();
  const sessionToken = String(raw.aws_session_token || '').trim();
  if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(accessKeyId)) {
    throw new Error('Enter a valid AWS Access Key ID (starts with AKIA or ASIA, 20 characters).');
  }
  if (secretAccessKey.length < 20) {
    throw new Error('Enter your AWS Secret Access Key.');
  }

  const region = String(raw.aws_region || 'us-east-1').trim();
  if (!/^[a-z]{2}-[a-z]+-[0-9]+$/.test(region)) {
    throw new Error('Choose a valid AWS region (for example: us-east-1).');
  }

  const projectName = String(raw.project_name || 'cdm').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,22}[a-z0-9]$/.test(projectName)) {
    throw new Error('Stack name must be 3–24 lowercase letters, numbers, or hyphens (for example: cdm-prod).');
  }

  const adminEmail = String(raw.admin_email || '').trim().toLowerCase();
  const adminPassword = String(raw.admin_password || '');
  const googleClientId = String(raw.google_client_id || '').trim();
  const googleClientSecret = String(raw.google_client_secret || '').trim();
  const geminiApiKey = String(raw.gemini_api_key || '').trim();
  if (!adminEmail || !adminEmail.includes('@')) throw new Error('Enter a valid Workspace Admin Email.');
  if (adminPassword.length < 8) throw new Error('Workspace Admin Password must be at least 8 characters.');
  if (!geminiApiKey) throw new Error('Gemini API Key is required.');

  const workDir = path.join(getAppDataBase(), 'aws-deployments', `${region}-${projectName}`);
  fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(workDir, '.gitignore'),
    '.terraform/\n*.tfstate*\n*.tfvars\nsecrets-meta.json\n',
    { mode: 0o600 }
  );

  let existingSecrets = {};
  const secretsMetaPath = path.join(workDir, 'secrets-meta.json');
  if (fs.existsSync(secretsMetaPath)) {
    try { existingSecrets = JSON.parse(fs.readFileSync(secretsMetaPath, 'utf8')); } catch (_) {}
  }
  const dbPassword = existingSecrets.db_password || randomAlphanumeric(28);
  const nextauthSecret = existingSecrets.nextauth_secret || randomSecret();
  const webhookSecret = existingSecrets.webhook_secret || randomSecret();
  fs.writeFileSync(
    secretsMetaPath,
    JSON.stringify({ db_password: dbPassword, nextauth_secret: nextauthSecret, webhook_secret: webhookSecret }),
    { mode: 0o600 }
  );

  const assets = loadAssets();
  for (const name of ASSET_NAMES) {
    fs.writeFileSync(path.join(workDir, name), assets[name], { mode: 0o600 });
  }

  const settings = {
    aws_region: region,
    project_name: projectName,
    image_uri: String(raw.image_uri || 'ghcr.io/lalith0192837465-create/cdmai:latest').trim(),
    db_password: dbPassword,
    deletion_protection: false,
    nextauth_secret: nextauthSecret,
    nextauth_url: String(raw.nextauth_url || '').trim(),
    admin_email: adminEmail,
    admin_password: adminPassword,
    google_client_id: googleClientId,
    google_client_secret: googleClientSecret,
    gemini_api_key: geminiApiKey,
    anthropic_api_key: String(raw.anthropic_api_key || '').trim(),
    skribby_api_key: String(raw.skribby_api_key || '').trim(),
    slack_webhook_url: String(raw.slack_webhook_url || '').trim(),
    webhook_secret: webhookSecret
  };

  writeTfvars(workDir, settings);

  const awsEnv = {
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region
  };
  if (sessionToken) {
    awsEnv.AWS_SESSION_TOKEN = sessionToken;
  }

  return { workDir, settings, awsEnv };
}

function writeTfvars(workDir, settings) {
  const lines = Object.entries(settings).map(([k, v]) =>
    `${k} = ${typeof v === 'boolean' || typeof v === 'number' ? v : tfString(v)}`
  );
  fs.writeFileSync(path.join(workDir, 'terraform.tfvars'), lines.join('\n') + '\n', { mode: 0o600 });
}

function runStreaming(command, args, cwd, extraEnv, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      shell: process.platform === 'win32',
      windowsHide: true
    });
    let outputText = '';
    const forward = (chunk) => {
      const text = chunk.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
      outputText += text;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', (err) => reject(new Error(`${command} could not start: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(outputText.trim());
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function waitForHealth(url, maxWaitMs = 55000) {
  const deadline = Date.now() + maxWaitMs;
  const client = url.startsWith('https://') ? https : http;
  return new Promise((resolve) => {
    const attempt = () => {
      if (Date.now() > deadline) return resolve(false);
      const req = client.get(`${url.replace(/\/$/, '')}/api/health`, { timeout: 6000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else setTimeout(attempt, 3500);
      });
      req.on('error', () => setTimeout(attempt, 3500));
      req.on('timeout', () => { req.destroy(); setTimeout(attempt, 3500); });
    };
    attempt();
  });
}

async function deployCdmApplication(rawConfig, onEvent) {
  const emit = (progress, status, line) => onEvent({ progress, status, line });

  emit(8, 'Preparing cloud deployment engine...', 'Step 1/4: Checking cloud engine...');
  await ensureCloudEngine((msg) => emit(12, 'Preparing cloud deployment engine...', msg));

  emit(18, 'Configuring AWS workspace...', 'Step 2/4: Preparing CDM configuration...');
  const { workDir, awsEnv } = prepareWorkspace(rawConfig);

  emit(24, 'Connecting to AWS...', 'Initializing AWS cloud providers...');
  await runStreaming('terraform', ['init', '-input=false', '-no-color'], workDir, awsEnv, (l) => {
    if (/Initializing|installed|reusing/i.test(l)) emit(30, 'Connecting to AWS...', l);
  });

  emit(
    38,
    'Creating RDS PostgreSQL database & deploying CDM on ECS Fargate (takes ~6–10 mins on first install)...',
    'Step 3/4: Provisioning VPC, RDS PostgreSQL 16, Secrets Manager, Load Balancer & ECS Fargate...'
  );
  let currentPct = 38;
  await runStreaming('terraform', ['apply', '-input=false', '-auto-approve', '-no-color'], workDir, awsEnv, (l) => {
    if (/Creating\.\.\.|Still creating\.\.\.|Creation complete|Modifying\.\.\.|Apply complete/i.test(l)) {
      currentPct = Math.min(88, currentPct + 2);
      emit(currentPct, 'Deploying CDM & database to AWS...', l);
    } else if (/Error:|InvalidClientTokenId|AccessDenied|SignatureDoesNotMatch/i.test(l)) {
      emit(currentPct, 'AWS reported an issue...', l);
    }
  });

  emit(92, 'Reading live AWS Load Balancer URL...', 'Step 4/4: Reading deployed CDM URL...');
  const serviceUrl = (
    await runStreaming('terraform', ['output', '-raw', 'application_url'], workDir, awsEnv, () => {})
  ).trim();

  emit(96, 'Verifying CDM is online...', 'Checking live CDM health endpoint...');
  await waitForHealth(serviceUrl, 50000);
  emit(100, 'CDM is live on AWS!', `✓ CDM is live at: ${serviceUrl}`);
  return serviceUrl;
}

function openWindowsDefaultBrowser(url) {
  const r = spawnSync('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true });
  if (r.status === 0) return true;
  const c = spawnSync('cmd.exe', ['/c', 'start', '', `"${url}"`], { windowsHide: true });
  return c.status === 0;
}

function openExternalUrl(url, appWindowMode = false, hooks = {}) {
  if (process.platform === 'win32') {
    if (appWindowMode) {
      const candidates = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
      ];
      for (const browserExe of candidates) {
        if (browserExe && fs.existsSync(browserExe)) {
          try {
            const profileDir = path.join(getAppDataBase(), 'ui-profile-aws');
            fs.mkdirSync(profileDir, { recursive: true });
            const launchedAt = Date.now();
            const child = spawn(
              browserExe,
              [
                `--app=${url}`,
                '--window-size=760,840',
                `--user-data-dir=${profileDir}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-features=msImplicitSignin,msEdgeSidebarV2'
              ],
              { detached: true, stdio: 'ignore', windowsHide: false }
            );
            child.on('error', () => {
              openWindowsDefaultBrowser(url);
            });
            child.on('close', () => {
              const livedMs = Date.now() - launchedAt;
              if (hooks.isUiLoaded && !hooks.isUiLoaded() && livedMs < 3000) {
                openWindowsDefaultBrowser(url);
              } else if (hooks.onAppWindowClosed && livedMs >= 3000) {
                hooks.onAppWindowClosed();
              }
            });
            child.unref();
            return true;
          } catch (_) {}
        }
      }
    }
    return openWindowsDefaultBrowser(url);
  }
  if (process.platform === 'darwin') {
    return spawnSync('open', [url]).status === 0;
  }
  if (hasCommand('xdg-open')) {
    return spawnSync('xdg-open', [url]).status === 0;
  }
  return false;
}

function buildInstallerHtml(sessionToken) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Install CDM on AWS</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0B0B0F; --panel: #131316; --panel-2: #1A1A1F; --border: #26262C;
    --text: #F2F2F5; --muted: #8F8F98; --accent: #6E7BF2; --accent-2: #5E6AD2;
    --ok: #30A46C; --err: #E5484D;
  }
  body {
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.5; padding: 28px 32px;
  }
  .wrap { max-width: 660px; margin: 0 auto; }
  .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .brand { font-weight: 600; font-size: 17px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--accent); }
  .wprog { display: flex; gap: 6px; margin-bottom: 24px; }
  .wprog i { flex: 1; height: 3px; background: var(--border); border-radius: 2px; transition: background 0.2s; }
  .wprog i.on { background: var(--accent); }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
  h2 { font-size: 1.18rem; margin-bottom: 6px; }
  .lede { color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 0.82rem; color: var(--muted); margin-bottom: 6px; }
  input, select {
    width: 100%; background: var(--panel-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px; color: var(--text); font: inherit; font-size: 0.9rem;
  }
  input:focus, select:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .file-box {
    background: var(--panel-2); border: 1px dashed var(--border); border-radius: 9px;
    padding: 13px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .file-status { font-size: 0.84rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-status.loaded { color: #6BD99E; font-weight: 500; }
  .btn {
    font: inherit; font-weight: 600; font-size: 0.9rem; padding: 10px 18px;
    border-radius: 10px; border: 1px solid transparent; cursor: pointer; white-space: nowrap;
  }
  .btn-primary { background: var(--accent-2); color: #fff; }
  .btn-primary:hover { background: var(--accent); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: var(--panel-2); border-color: var(--border); color: var(--text); }
  .nav-row { display: flex; justify-content: space-between; align-items: center; margin-top: 22px; }
  .bar-bg { width: 100%; height: 8px; background: var(--panel-2); border-radius: 99px; overflow: hidden; margin-bottom: 10px; }
  .bar-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.35s ease; }
  .status-line { font-size: 0.88rem; font-weight: 500; margin-bottom: 14px; color: var(--text); }
  .log {
    background: #08080B; border: 1px solid var(--border); border-radius: 10px;
    padding: 13px; height: 220px; overflow-y: auto; font-size: 0.79rem; color: var(--muted);
    font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap;
  }
  .alert { border-radius: 10px; padding: 12px 14px; font-size: 0.85rem; margin-bottom: 16px; display: none; }
  .alert-err { background: rgba(229, 72, 77, 0.12); border: 1px solid var(--err); color: #FF8B8E; }
  .done-box {
    background: rgba(48, 164, 108, 0.1); border: 1px solid var(--ok); border-radius: 10px;
    padding: 16px; margin-top: 16px; display: none;
  }
  .done-box h3 { font-size: 1rem; color: #6BD99E; margin-bottom: 6px; }
  .copy-row { display: flex; gap: 8px; margin-top: 8px; }
  .opt-details {
    margin-top: 6px; margin-bottom: 14px; border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; background: #0E0E12;
  }
  .opt-details summary {
    cursor: pointer; font-size: 0.83rem; color: var(--muted); font-weight: 500; user-select: none;
  }
  .opt-details[open] summary { margin-bottom: 12px; color: var(--text); }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand"><span class="dot"></span> CDM Installer — AWS</div>
    <button class="btn btn-ghost" style="padding:6px 12px;font-size:0.78rem" onclick="quitInstaller()">Close</button>
  </div>

  <div class="wprog">
    <i id="p1" class="on"></i>
    <i id="p2"></i>
    <i id="p3"></i>
  </div>

  <div id="errBox" class="alert alert-err"></div>

  <!-- STEP 1 -->
  <div id="step1" class="card">
    <h2>Connect your AWS account</h2>
    <p class="lede">Upload your IAM Access Keys CSV (or paste your keys below) and choose the AWS region for CDM.</p>

    <div class="field">
      <label>AWS IAM Access Keys CSV (optional quick-fill)</label>
      <div class="file-box">
        <span id="csvStatus" class="file-status">Upload credentials .csv downloaded from AWS IAM</span>
        <label class="btn btn-ghost" style="padding:7px 14px;font-size:0.82rem;margin:0;color:var(--text)">
          Choose .csv file
          <input id="csvFile" type="file" accept=".csv,text/csv" style="display:none" onchange="handleCsvUpload(this)">
        </label>
      </div>
    </div>

    <div class="grid2">
      <div class="field">
        <label>AWS Access Key ID *</label>
        <input id="aws_access_key_id" placeholder="AKIA...">
      </div>
      <div class="field">
        <label>AWS Secret Access Key *</label>
        <input id="aws_secret_access_key" type="password" placeholder="Secret access key">
      </div>
    </div>

    <div class="grid2">
      <div class="field">
        <label>AWS Region *</label>
        <select id="aws_region">
          ${REGIONS.map((r) => `<option value="${r.id}">${r.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Stack Name</label>
        <input id="project_name" value="cdm" placeholder="cdm">
      </div>
    </div>

    <div class="field">
      <label>AWS Session Token (optional — only for temporary SSO keys starting with ASIA)</label>
      <input id="aws_session_token" type="password" placeholder="Leave blank for standard IAM keys">
    </div>

    <div class="nav-row">
      <span style="font-size:0.78rem;color:var(--muted)">Sets up ECS Fargate + RDS PostgreSQL 16 + ALB automatically</span>
      <button class="btn btn-primary" onclick="goStep(2)">Next →</button>
    </div>
  </div>

  <!-- STEP 2 -->
  <div id="step2" class="card hidden">
    <h2>Create your admin login &amp; keys</h2>
    <p class="lede">Sign in immediately with your email and password once deployed. Everything is stored encrypted inside your own AWS Secrets Manager.</p>

    <div class="grid2">
      <div class="field">
        <label>Workspace Admin Email *</label>
        <input id="admin_email" type="email" placeholder="admin@company.com">
      </div>
      <div class="field">
        <label>Workspace Admin Password * (8+ chars)</label>
        <input id="admin_password" type="password" placeholder="Create a strong password">
      </div>
    </div>

    <div class="field">
      <label>Gemini API Key *</label>
      <input id="gemini_api_key" type="password" placeholder="AIza...">
    </div>

    <div class="grid2">
      <div class="field">
        <label>Skribby Bot Key (optional)</label>
        <input id="skribby_api_key" type="password" placeholder="For Meet, Zoom &amp; Teams bot">
      </div>
      <div class="field">
        <label>Slack Webhook URL (optional)</label>
        <input id="slack_webhook_url" type="password" placeholder="https://hooks.slack.com/...">
      </div>
    </div>

    <details class="opt-details">
      <summary>Optional: Enable Google Sign-In (SSO)</summary>
      <div class="grid2">
        <div class="field" style="margin-bottom:0">
          <label>Google Client ID (optional)</label>
          <input id="google_client_id" placeholder="xxxx.apps.googleusercontent.com">
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Google Client Secret (optional)</label>
          <input id="google_client_secret" type="password" placeholder="GOCSPX-...">
        </div>
      </div>
    </details>

    <div class="nav-row">
      <button class="btn btn-ghost" onclick="goStep(1)">← Back</button>
      <button class="btn btn-primary" onclick="startInstall()">Install &amp; Launch CDM →</button>
    </div>
  </div>

  <!-- STEP 3 -->
  <div id="step3" class="card hidden">
    <h2 id="step3Title">Installing CDM on AWS</h2>
    <p class="lede">Setting up your VPC, RDS PostgreSQL 16 database, Secrets Manager, Load Balancer, and ECS Fargate service (~6–10 minutes on first install).</p>

    <div class="bar-bg"><div id="barFill" class="bar-fill"></div></div>
    <div id="statusText" class="status-line">Starting...</div>
    <div id="logBox" class="log"></div>

    <div id="doneBox" class="done-box">
      <h3>CDM is live on AWS!</h3>
      <p style="font-size:0.84rem;color:var(--muted);margin-bottom:8px">
        Open your workspace and sign in with your Workspace Admin Email and Password.
      </p>
      <div id="oauthHint" class="hidden" style="margin-top:10px;margin-bottom:6px">
        <p style="font-size:0.82rem;color:var(--muted);margin-bottom:6px">
          Since you added Google SSO keys, add this Authorized Redirect URI in Google Cloud:
        </p>
        <div class="copy-row">
          <input id="callbackUrl" readonly>
          <button class="btn btn-ghost" onclick="copyCallback()">Copy</button>
        </div>
      </div>
      <div class="nav-row" style="margin-top:14px">
        <span style="font-size:0.82rem;color:var(--muted)" id="liveUrlLabel"></span>
        <button class="btn btn-primary" onclick="openLiveApp()">Open CDM App →</button>
      </div>
    </div>

    <div id="retryRow" class="nav-row hidden">
      <button class="btn btn-ghost" onclick="goStep(2)">← Edit Keys</button>
      <button class="btn btn-primary" onclick="startInstall()">Retry Install</button>
    </div>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(sessionToken)};
let liveAppUrl = '';
let pollTimer = null;
let logOffset = 0;

function showErr(msg) {
  const b = document.getElementById('errBox');
  b.textContent = msg || '';
  b.style.display = msg ? 'block' : 'none';
}

function parseAwsCsv(text) {
  const lines = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const values = lines[1].split(',').map((v) => v.replace(/^"|"$/g, '').trim());
  const idIdx = headers.findIndex((h) => h.includes('access key id') || h === 'aws_access_key_id');
  const secIdx = headers.findIndex((h) => h.includes('secret access key') || h === 'aws_secret_access_key');
  if (idIdx >= 0 && secIdx >= 0 && values[idIdx] && values[secIdx]) {
    return { accessKeyId: values[idIdx], secretAccessKey: values[secIdx] };
  }
  return null;
}

function handleCsvUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseAwsCsv(String(reader.result || ''));
    if (!parsed) {
      showErr('Could not find AWS Access Key ID and Secret Access Key columns in that CSV file.');
      return;
    }
    showErr('');
    document.getElementById('aws_access_key_id').value = parsed.accessKeyId;
    document.getElementById('aws_secret_access_key').value = parsed.secretAccessKey;
    const st = document.getElementById('csvStatus');
    st.textContent = '✓ Loaded ' + file.name + ' (' + parsed.accessKeyId + ')';
    st.classList.add('loaded');
  };
  reader.readAsText(file);
}

function goStep(n) {
  showErr('');
  if (n === 2) {
    const ak = document.getElementById('aws_access_key_id').value.trim();
    const sk = document.getElementById('aws_secret_access_key').value.trim();
    const pn = document.getElementById('project_name').value.trim().toLowerCase();
    if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(ak)) {
      showErr('Enter a valid AWS Access Key ID (starts with AKIA or ASIA, 20 characters).');
      return;
    }
    if (sk.length < 20) {
      showErr('Enter your AWS Secret Access Key.');
      return;
    }
    if (!/^[a-z][a-z0-9-]{1,22}[a-z0-9]$/.test(pn)) {
      showErr('Stack name must be 3–24 lowercase letters, numbers, or hyphens (for example: cdm).');
      return;
    }
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById('step' + i).classList.toggle('hidden', i !== n);
    document.getElementById('p' + i).classList.toggle('on', i <= n);
  }
}

async function postApi(route, payload) {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CDM-Token': TOKEN },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

async function startInstall() {
  showErr('');
  const payload = {
    aws_access_key_id: document.getElementById('aws_access_key_id').value.trim(),
    aws_secret_access_key: document.getElementById('aws_secret_access_key').value.trim(),
    aws_session_token: document.getElementById('aws_session_token').value.trim(),
    aws_region: document.getElementById('aws_region').value,
    project_name: document.getElementById('project_name').value.trim().toLowerCase(),
    admin_email: document.getElementById('admin_email').value.trim(),
    admin_password: document.getElementById('admin_password').value,
    google_client_id: document.getElementById('google_client_id').value.trim(),
    google_client_secret: document.getElementById('google_client_secret').value.trim(),
    gemini_api_key: document.getElementById('gemini_api_key').value.trim(),
    skribby_api_key: document.getElementById('skribby_api_key').value.trim(),
    slack_webhook_url: document.getElementById('slack_webhook_url').value.trim()
  };

  if (!payload.admin_email || !payload.admin_email.includes('@')) {
    showErr('Please enter a valid Workspace Admin Email.');
    return;
  }
  if (!payload.admin_password || payload.admin_password.length < 8) {
    showErr('Workspace Admin Password must be at least 8 characters.');
    return;
  }
  if (!payload.gemini_api_key) {
    showErr('Please enter your Gemini API Key.');
    return;
  }

  const res = await postApi('/api/install', payload);
  if (!res.ok) {
    showErr(res.error || 'Could not start installation.');
    return;
  }

  logOffset = 0;
  document.getElementById('logBox').textContent = '';
  document.getElementById('barFill').style.width = '5%';
  document.getElementById('doneBox').style.display = 'none';
  document.getElementById('retryRow').classList.add('hidden');
  document.getElementById('step3Title').textContent = 'Installing CDM on AWS';
  goStep(3);

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollStatus, 600);
}

async function pollStatus() {
  try {
    const res = await fetch('/api/status?offset=' + logOffset, { headers: { 'X-CDM-Token': TOKEN } });
    const data = await res.json();
    if (data.statusText) document.getElementById('statusText').textContent = data.statusText;
    if (typeof data.progress === 'number') {
      document.getElementById('barFill').style.width = data.progress + '%';
    }
    if (data.lines && data.lines.length) {
      const log = document.getElementById('logBox');
      log.textContent += data.lines.join('\\n') + '\\n';
      log.scrollTop = log.scrollHeight;
      logOffset = data.nextOffset;
    }
    if (!data.running) {
      clearInterval(pollTimer);
      pollTimer = null;
      if (data.error) {
        showErr(data.error);
        document.getElementById('retryRow').classList.remove('hidden');
      } else if (data.serviceUrl) {
        liveAppUrl = data.serviceUrl;
        document.getElementById('step3Title').textContent = 'CDM Installed Successfully';
        const hasG = Boolean(document.getElementById('google_client_id').value.trim());
        document.getElementById('oauthHint').classList.toggle('hidden', !hasG);
        document.getElementById('callbackUrl').value = liveAppUrl.replace(/\\/$/, '') + '/api/auth/callback/google';
        document.getElementById('liveUrlLabel').textContent = liveAppUrl;
        document.getElementById('doneBox').style.display = 'block';
      }
    }
  } catch (_) {}
}

function copyCallback() {
  const input = document.getElementById('callbackUrl');
  navigator.clipboard.writeText(input.value);
}

function openLiveApp() {
  if (liveAppUrl) postApi('/api/open-url', { url: liveAppUrl });
}

async function quitInstaller() {
  try { await postApi('/api/quit', {}); } catch (_) {}
  window.close();
}
</script>
</body>
</html>`;
}

function startInstallerGui() {
  const token = crypto.randomBytes(24).toString('hex');
  const html = buildInstallerHtml(token);
  const state = {
    uiLoaded: false,
    running: false,
    progress: 0,
    statusText: 'Ready',
    logs: [],
    error: null,
    serviceUrl: null
  };

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'GET' && parsed.pathname === '/') {
      if (parsed.searchParams.get('token') !== token) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      state.uiLoaded = true;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    if (req.headers['x-cdm-token'] !== token) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
      return;
    }

    if (req.method === 'GET' && parsed.pathname === '/api/status') {
      const offset = Math.max(0, Number(parsed.searchParams.get('offset') || 0));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        running: state.running,
        progress: state.progress,
        statusText: state.statusText,
        lines: state.logs.slice(offset),
        nextOffset: state.logs.length,
        error: state.error,
        serviceUrl: state.serviceUrl
      }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { if (body.length < 262144) body += chunk.toString('utf8'); });
    req.on('end', () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch (_) {}

      if (parsed.pathname === '/api/open-url') {
        const u = String(json.url || '');
        if (u.startsWith('http://') || u.startsWith('https://')) {
          openExternalUrl(u, false);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (parsed.pathname === '/api/quit') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        setTimeout(() => process.exit(0), 200);
        return;
      }

      if (parsed.pathname === '/api/install') {
        if (state.running) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Installation is already in progress.' }));
          return;
        }
        state.running = true;
        state.progress = 5;
        state.statusText = 'Starting installation...';
        state.logs = [];
        state.error = null;
        state.serviceUrl = null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        deployCdmApplication(json, ({ progress, status, line }) => {
          if (typeof progress === 'number') state.progress = progress;
          if (status) state.statusText = status;
          if (line) {
            state.logs.push(line);
            console.log(line);
          }
        })
          .then((url) => {
            state.serviceUrl = url;
            state.progress = 100;
            state.statusText = 'CDM is live!';
          })
          .catch((err) => {
            state.error = err.message || 'Installation stopped.';
            state.statusText = 'Installation stopped';
            state.logs.push(`✗ ${state.error}`);
          })
          .finally(() => {
            state.running = false;
          });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${addr.port}/?token=${token}`;
      console.log('\nCDM — AWS Installer');
      console.log('Opening installer window... (keep this background process running until install finishes)');
      const opened = openExternalUrl(url, true, {
        isUiLoaded: () => state.uiLoaded,
        onAppWindowClosed: () => {
          if (!state.running) {
            setTimeout(() => process.exit(0), 250);
          }
        }
      });
      if (!opened) {
        server.close(() => resolve(false));
      } else {
        resolve(true);
      }
    });
  });
}

async function runDirectCli() {
  const rl = require('node:readline').createInterface({ input: stdin, output: stdout });
  const ask = (q, def = '') => new Promise((r) => rl.question(def ? `${q} [${def}]: ` : `${q}: `, (a) => r(a.trim() || def)));
  try {
    console.log('\n=== CDM — Install on AWS ===\n');
    const aws_access_key_id = await ask('AWS Access Key ID (AKIA...)');
    const aws_secret_access_key = await ask('AWS Secret Access Key');
    const aws_session_token = await ask('AWS Session Token (optional, press Enter to skip)');
    const aws_region = await ask('AWS Region', 'us-east-1');
    const project_name = await ask('Stack Name', 'cdm');
    const admin_email = await ask('Workspace Admin Email (e.g. admin@company.com)');
    const admin_password = await ask('Workspace Admin Password (8+ chars)');
    const gemini_api_key = await ask('Gemini API Key');
    const skribby_api_key = await ask('Skribby API Key (optional)');
    const slack_webhook_url = await ask('Slack Webhook URL (optional)');
    const google_client_id = await ask('Google Sign-In Client ID (optional)');
    const google_client_secret = google_client_id ? await ask('Google Sign-In Client Secret') : '';
    rl.close();

    const liveUrl = await deployCdmApplication(
      {
        aws_access_key_id,
        aws_secret_access_key,
        aws_session_token,
        aws_region,
        project_name,
        admin_email,
        admin_password,
        google_client_id,
        google_client_secret,
        gemini_api_key,
        skribby_api_key,
        slack_webhook_url
      },
      ({ line }) => { if (line) console.log(line); }
    );
    console.log(`\n✓ CDM is live on AWS: ${liveUrl}`);
    if (google_client_id) {
      console.log(`Add this Google OAuth Redirect URI: ${liveUrl}/api/auth/callback/google`);
    }
  } finally {
    rl.close();
  }
}

function pauseAndExit(code = 0) {
  process.exitCode = code;
  if (process.platform === 'win32' && !process.env.CI && process.env.CDM_AWS_NO_PAUSE !== '1') {
    try {
      stdout.write('\nPress Enter to close...');
      const buf = Buffer.alloc(1);
      fs.readSync(0, buf, 0, 1, null);
    } catch (_) {}
  }
  process.exit(code);
}

process.on('uncaughtException', (err) => {
  console.error('\nUnexpected error:', err && err.message ? err.message : err);
  pauseAndExit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('\nUnexpected error:', err && err.message ? err.message : err);
  pauseAndExit(1);
});

if (process.argv.includes('--self-test')) {
  const missing = ASSET_NAMES.filter((name) => !embedded[name] && !fs.existsSync(path.join(__dirname, name)));
  const html = buildInstallerHtml('test-token');
  if (missing.length || !html.includes('CDM Installer — AWS')) {
    console.error(`Bundle self-test failed: missing ${missing.join(', ')}`);
    process.exitCode = 2;
  } else {
    console.log(`Bundle self-test passed: CDM AWS Installer and ${ASSET_NAMES.length} support files are present.`);
  }
} else if (process.argv.includes('--deploy-json')) {
  const idx = process.argv.indexOf('--deploy-json');
  const configFile = process.argv[idx + 1];
  (async () => {
    if (!configFile || !fs.existsSync(configFile)) {
      throw new Error('Deployment configuration file was not provided.');
    }
    const rawConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    try { fs.unlinkSync(configFile); } catch (_) {}
    const serviceUrl = await deployCdmApplication(rawConfig, (evt) => {
      stdout.write(`CDM_EVENT:${JSON.stringify(evt)}\n`);
    });
    stdout.write(`CDM_RESULT:${JSON.stringify({ ok: true, serviceUrl })}\n`);
  })().catch((e) => {
    stdout.write(`CDM_RESULT:${JSON.stringify({ ok: false, error: e.message || String(e) })}\n`);
    process.exit(1);
  });
} else if (process.argv.includes('--cli')) {
  runDirectCli()
    .then(() => pauseAndExit(0))
    .catch((e) => {
      console.error(`\nInstall stopped: ${e.message}`);
      pauseAndExit(1);
    });
} else {
  startInstallerGui()
    .then((opened) => {
      if (!opened) return runDirectCli().then(() => pauseAndExit(0));
    })
    .catch((e) => {
      console.error(`\nInstall stopped: ${e.message}`);
      pauseAndExit(1);
    });
}
