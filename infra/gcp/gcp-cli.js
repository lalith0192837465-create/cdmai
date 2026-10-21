#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { stdin, stdout } = require('node:process');
const { spawnSync } = require('node:child_process');

let embedded = {};
try { embedded = require('./gcp-assets.js'); } catch (_) { embedded = {}; }

// Shared line reader: one persistent queue so no typed input is ever dropped,
// whether answers arrive one chunk at a time or several lines in a single chunk.
let buffer = '';
const lineQueue = [];
const pending = [];
let stdinDone = false;
let hideInput = false;

function pushLine(line) {
  const waiter = pending.shift();
  if (waiter) waiter.resolve(line);
  else lineQueue.push(line);
}

let lastWasCR = false;
function onData(chunk) {
  const text = chunk.toString('utf8');
  for (const ch of text) {
    if (ch === '\r') { pushLine(buffer); buffer = ''; lastWasCR = true; if (stdin.isTTY) stdout.write('\n'); continue; }
    if (ch === '\n') { if (lastWasCR) { lastWasCR = false; continue; } pushLine(buffer); buffer = ''; if (stdin.isTTY) stdout.write('\n'); continue; }
    lastWasCR = false;
    if (ch === '\u0003') { while (pending.length) pending.shift().reject(new Error('Cancelled by the user.')); pushLine(null); }
    else if (ch === '\u007f' || ch === '\b') { buffer = buffer.slice(0, -1); if (stdin.isTTY && !hideInput) stdout.write('\b \b'); }
    else if (ch === '\u001b') continue;
    else if (ch < ' ') continue;
    else { buffer += ch; if (stdin.isTTY && !hideInput) stdout.write(ch); }
  }
}

function onEnd() {
  stdinDone = true;
  if (buffer.length) { pushLine(buffer); buffer = ''; }
  pushLine(null);
  while (pending.length) pending.shift().resolve(null);
}

let started = false;

function startReader() {
  if (started) return;
  started = true;
  if (stdin.isTTY) { try { stdin.setRawMode(true); } catch (_) {} }
  stdin.on('data', onData);
  stdin.on('end', onEnd);
  stdin.on('error', onEnd);
  stdin.resume();
}

function nextLine() {
  startReader();
  if (lineQueue.length) return Promise.resolve(lineQueue.shift());
  if (stdinDone) return Promise.resolve(null);
  return new Promise((resolve, reject) => pending.push({ resolve, reject }));
}

function readLine(promptText) {
  stdout.write(promptText);
  return nextLine().then((line) => {
    if (line === null) throw new Error('Input ended before the setup finished. Nothing was changed.');
    return line;
  });
}

async function ask(label, fallback = '') {
  const suffix = fallback ? ` [${fallback}]` : '';
  const value = await readLine(`${label}${suffix}: `);
  return value.trim() || fallback;
}

async function askSecret(label, optional = false) {
  const previous = hideInput;
  hideInput = true;
  let value;
  try {
    value = await readLine(`${label}${optional ? ' (leave blank if unused)' : ''}: `);
  } finally {
    hideInput = previous;
  }
  if (!value && !optional) throw new Error(`${label} is required.`);
  return value;
}

function run(command, args, cwd, extra = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', ...extra });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} stopped (exit ${result.status}). No further action was taken.`);
}

function showProgress(step, total, label) {
  const width = 20;
  const filled = Math.round((step / total) * width);
  console.log(`\n[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${Math.round((step / total) * 100)}% — ${label}`);
}

function tfString(value) { return JSON.stringify(value); }

function stopIfUnsupported(value) {
  console.log('\nThis package only configures its documented Cloud Run + NEW Cloud SQL design.');
  console.log('It does not set up an existing database, private-IP Cloud SQL, a customer VPC, or custom routing.');
  if (String(value).trim().toLowerCase() !== 'yes') {
    throw new Error('Your requirements need a different reviewed design. No Terraform was run.');
  }
}


function hasCommand(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  return probe.status === 0 && !!probe.stdout.trim();
}

function checkPrerequisites() {
  showProgress(1, 5, 'Checking required tools');
  const missing = [];
  if (!hasCommand('terraform')) missing.push('Terraform (https://developer.hashicorp.com/terraform/downloads)');
  if (!hasCommand('gcloud')) missing.push('Google Cloud CLI (https://cloud.google.com/sdk/docs/install)');
  if (missing.length) {
    console.log('\nMissing required tools:');
    for (const item of missing) console.log(`  - ${item}`);
    console.log('\nInstall them, then run this setup again. Nothing was changed.');
    const error = new Error('Required tools are not installed.');
    error.keepOpen = true;
    throw error;
  }
  console.log('Prerequisites found: Terraform and Google Cloud CLI.');
}

async function main() {
  console.log('\nCDM — Google Cloud setup');
  console.log('Starting the GCP setup check. This window will stay open if anything needs your attention.');
  console.log('This runs in your Google Cloud project. Review each answer and the Terraform plan.');
  console.log('The package only supports its documented Cloud Run + NEW Cloud SQL design.');
  console.log('No resources are created until you explicitly type APPLY and your project ID.');
  checkPrerequisites();
  showProgress(2, 5, 'Collecting project and deployment settings');

  const project = await ask('Google Cloud project ID');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error('That does not look like a valid Google Cloud project ID (must start with a letter, end with a letter or digit).');
  }
  const region = await ask('Cloud region', 'us-central1');
  if (!/^[a-z]+-[a-z0-9]+[0-9]$/.test(region)) throw new Error('Enter a region such as us-central1 or europe-west1.');
  const service = await ask('Cloud Run service name', 'cdm');
  if (!/^[a-z][a-z0-9-]{0,48}[a-z0-9]$/.test(service)) throw new Error('Use a lowercase service name: letters, numbers, and hyphens only.');
  const dbTier = await ask('Cloud SQL machine tier (confirm current price with your GCP admin)');
  if (!/^[a-z0-9-]+$/.test(dbTier)) throw new Error('Enter a valid-looking Cloud SQL tier.');
  const availability = (await ask('Database availability: ZONAL or REGIONAL', 'ZONAL')).toUpperCase();
  if (!['ZONAL', 'REGIONAL'].includes(availability)) throw new Error('Choose ZONAL or REGIONAL.');
  const disk = Number(await ask('Initial database disk size in GB', '10'));
  const maxInstances = Number(await ask('Maximum Cloud Run instances', '3'));
  if (!Number.isInteger(disk) || disk < 10 || disk > 65536) throw new Error('Disk size must be a whole number from 10 to 65536 GB.');
  if (!Number.isInteger(maxInstances) || maxInstances < 1 || maxInstances > 1000) throw new Error('Maximum instances must be a whole number from 1 to 1000.');
  const publicIngress = (await ask('Allow internet traffic to reach Cloud Run? yes/no', 'yes')).toLowerCase();
  if (!['yes','no'].includes(publicIngress)) throw new Error('Answer yes or no.');
  const unauth = (await ask('Allow unauthenticated Cloud Run requests? yes/no (review app access first)', 'no')).toLowerCase();
  if (!['yes','no'].includes(unauth)) throw new Error('Answer yes or no.');
  const network = await ask('Does the included public-IP Cloud SQL design meet your approved network/security requirements? yes/no', 'no');
  stopIfUnsupported(network);

  console.log('\nEnter the required application credentials (not echoed in a real terminal).');
  console.log('They are written ONLY to the local terraform.tfvars file and are never sent to CDM.');
  const secrets = {
    nextauth_secret: await askSecret('NextAuth secret'),
    google_client_id: await askSecret('Google OAuth client ID'),
    google_client_secret: await askSecret('Google OAuth client secret'),
    gemini_api_key: await askSecret('Gemini API key'),
    anthropic_api_key: await askSecret('Anthropic API key', true),
    skribby_api_key: await askSecret('Skribby API key', true),
    webhook_secret: await askSecret('Webhook verification secret')
  };

  const settings = {
    project_id: project, region, service_name: service,
    container_image: 'ghcr.io/lalith0192837465-create/cdmai:latest',
    app_url: '', database_version: 'POSTGRES_16', database_tier: dbTier,
    database_availability: availability, database_disk_gb: disk,
    max_instances: maxInstances, deletion_protection: true,
    allow_public_ingress: publicIngress === 'yes',
    allow_unauthenticated: unauth === 'yes', ...secrets
  };

  console.log('\n=== DEPLOYMENT SUMMARY ===');
  console.log(`  Project: ${project}`);
  console.log(`  Region: ${region}`);
  console.log(`  Cloud Run: ${service} (up to ${maxInstances} instances)`);
  console.log(`  Cloud SQL: PostgreSQL 16, ${dbTier}, ${availability}, ${disk} GB`);
  console.log(`  Internet ingress: ${publicIngress}`);
  console.log(`  Unauthenticated Cloud Run access: ${unauth}`);
  console.log('  Resources: APIs, runtime service account, Cloud SQL, Secret Manager, Cloud Run, IAM grants');
  console.log('\nThe terraform plan can incur GCP charges. The plan is shown before any apply.');

  const confirm = (await ask('Type PLAN to create the local setup and run terraform plan')).toUpperCase();
  if (confirm !== 'PLAN') throw new Error('Cancelled. No cloud changes were made.');

  const outputDir = path.join(process.cwd(), `cdm-gcp-${project}`);
  if (fs.existsSync(outputDir)) throw new Error(`Output folder already exists: ${outputDir}. Move it or choose another location; nothing was overwritten.`);
  const sourceDir = path.dirname(process.argv[1]);

  const assetNames = ['main.tf','variables.tf','outputs.tf','versions.tf','.gitignore'];
  const assets = {};
  for (const name of assetNames) {
    if (embedded[name]) { assets[name] = Buffer.from(embedded[name]); }
    else { const source = path.join(sourceDir, name); assets[name] = fs.readFileSync(source); }
  }
  for (const [name, buf] of Object.entries(assets)) {
    if (!buf || buf.length === 0) throw new Error(`The package is incomplete: ${name} is missing. Re-download the setup package.`);
  }

  fs.mkdirSync(outputDir, { mode: 0o700 });
  try {
    for (const name of assetNames) {
      fs.writeFileSync(path.join(outputDir, name), assets[name], { mode: 0o600, flag: 'wx' });
    }
    const lines = Object.entries(settings).map(([k,v]) => `${k} = ${typeof v === 'boolean' || typeof v === 'number' ? v : tfString(v)}`);
    fs.writeFileSync(path.join(outputDir,'terraform.tfvars'), lines.join('\n')+'\n', { mode: 0o600, flag: 'wx' });
    const readmeLines = [
      '# CDM Google Cloud setup',
      '',
      `Project: ${project}`,
      `Region: ${region}`,
      '',
      'This package provisions Cloud Run and a new Cloud SQL PostgreSQL database using the',
      'network model you reviewed during setup. Confirm your approved architecture, access,',
      'costs, OAuth callback URL, and billing with your cloud administrator before applying.',
      '',
      'terraform.tfvars and the Terraform state contain sensitive data. Keep this folder private.',
      '',
      '## Review and deploy',
      '1. Authenticate to the customer-owned project with your approved identity:',
      '   gcloud auth application-default login',
      `2. Select the project: gcloud config set project ${project}`,
      '3. Initialize: terraform init',
      '4. Plan: terraform plan -out=cdm.tfplan',
      '5. Review every resource and charge with your cloud administrator.',
      `6. Apply the reviewed plan: terraform apply cdm.tfplan`,
      '7. Configure the Google OAuth callback for the deployed URL, then verify health and sign-in.',
      '',
      'To let the CLI run these steps, type PLAN at its prompt. It never applies without',
      `you typing APPLY ${project} after reading the plan.`,
      ''
    ];
    fs.writeFileSync(path.join(outputDir,'README-CUSTOMER.md'), readmeLines.join('\n'), { mode: 0o600, flag: 'wx' });
  } catch (e) { fs.rmSync(outputDir, {recursive:true, force:true}); throw e; }

  showProgress(3, 5, `Setup files prepared in: ${outputDir}`);
  console.log('Terraform will now initialize and show a plan. It will NOT apply changes.');

  try {
    showProgress(4, 5, 'Initializing Terraform and creating a review plan');
    run('terraform', ['init','-input=false'], outputDir);
    run('terraform', ['plan','-input=false','-out=cdm.tfplan'], outputDir);
  } catch (e) {
    console.error(`\nPlan did not complete: ${e.message}`);
    console.error(`Your files remain in ${outputDir}. No apply was run.`);
    process.exitCode = 1;
    return;
  }

  showProgress(5, 5, 'Plan is ready for your review — nothing has been applied');
  const approval = await ask(`Type APPLY ${project} to apply exactly the plan you just reviewed`);
  if (approval !== `APPLY ${project}`) {
    console.log('\nNot applied. Your saved plan and setup files remain available for later review.');
    return;
  }
  try {
    run('terraform', ['apply','-input=false','cdm.tfplan'], outputDir);
    console.log('\nTerraform apply finished. Check the outputs above and verify the app health and sign-in.');
  } catch (e) {
    console.error(`\nApply did not complete: ${e.message}`);
    console.error(`Your files remain in ${outputDir}. Review the error and try again later.`);
    process.exitCode = 1;
  }
}
if (process.argv.includes('--self-test')) {
  const required = ['main.tf', 'variables.tf', 'outputs.tf', 'versions.tf', '.gitignore'];
  const missing = required.filter((name) => !embedded[name] && !fs.existsSync(path.join(__dirname, name)));
  if (missing.length) {
    console.error(`Bundle self-test failed: missing ${missing.join(', ')}`);
    process.exitCode = 2;
  } else {
    console.log(`Bundle self-test passed: CLI and ${required.length} Terraform support files are present.`);
  }
} else {
  main().catch((e) => {
    console.error(`\nSetup stopped: ${e.message}`);
    process.exitCode = 1;
    if (process.platform === 'win32' && !process.env.CI && process.env.CDM_GCP_NO_PAUSE !== '1') {
      console.error('\nPress any key to close this window.');
      spawnSync('cmd.exe', ['/c', 'pause'], { stdio: 'inherit', windowsHide: false });
    }
  });
}
