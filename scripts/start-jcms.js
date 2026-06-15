#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverEntry = path.join(rootDir, 'server.js');
const runtimeDir = path.join(rootDir, '.jcms-runtime');
const pidFile = path.join(runtimeDir, 'server.pid');
const stateFile = path.join(runtimeDir, 'state.json');

const PROCESS_NAME = 'jcms-api';
const RETRY_LIMIT = toPositiveInt(process.env.JCMS_START_RETRIES, 3);
const RETRY_WAIT_MS = 1800;
const NO_BROWSER = String(process.env.JCMS_NO_BROWSER || '').trim() === '1';
const PORT = resolvePort();
const healthUrl = `http://127.0.0.1:${PORT}/api/health`;
const appUrl = `http://127.0.0.1:${PORT}/JCMS.html`;

function toPositiveInt(v, fallbackValue) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallbackValue;
}

function resolvePort() {
  const direct = Number(process.env.JCMS_PORT || process.env.PORT);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^\s*PORT\s*=\s*(\d+)\s*(?:#.*)?$/m);
    if (match) return Number(match[1]);
  }
  return 3000;
}

function logStep(msg) {
  console.log(`[JCMS] ${msg}`);
}

function logErr(msg) {
  console.error(`[JCMS] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function readLastPid() {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

function writePid(pid) {
  ensureRuntimeDir();
  fs.writeFileSync(pidFile, String(pid), 'utf8');
}

function clearPidFile() {
  try {
    fs.unlinkSync(pidFile);
  } catch (_) {
    // ignore
  }
}

function writeState(state) {
  ensureRuntimeDir();
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function execCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: rootDir, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (error) => resolve({ ok: false, error, stdout, stderr, code: -1 }));
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

async function stopPm2ProcessIfPresent() {
  const pm2Js = path.join(rootDir, 'node_modules', 'pm2', 'bin', 'pm2');
  if (!fs.existsSync(pm2Js)) return;
  await execCommand(process.execPath, [pm2Js, 'stop', PROCESS_NAME]);
  await execCommand(process.execPath, [pm2Js, 'delete', PROCESS_NAME]);
}

async function stopKnownPid() {
  const pid = readLastPid();
  if (!pid || !isPidAlive(pid)) {
    clearPidFile();
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (_) {
    clearPidFile();
    return;
  }
  for (let i = 0; i < 12; i += 1) {
    if (!isPidAlive(pid)) {
      clearPidFile();
      return;
    }
    await sleep(200);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {
    // ignore
  }
  clearPidFile();
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(900);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function killPortListenersWindows(port) {
  const result = await execCommand('netstat', ['-ano']);
  if (!result.stdout) return;
  const lines = result.stdout.split(/\r?\n/);
  const pids = new Set();
  for (const line of lines) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const match = line.trim().match(/\s+(\d+)\s*$/);
    if (match) pids.add(Number(match[1]));
  }
  for (const pid of pids) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    await execCommand('taskkill', ['/PID', String(pid), '/F']);
  }
}

async function killPortListenersPosix(port) {
  const result = await execCommand('lsof', ['-ti', `tcp:${port}`]);
  if (!result.stdout) return;
  const pids = result.stdout
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {
      // ignore
    }
  }
}

async function ensurePortFree(port) {
  if (!(await isPortOpen(port))) return true;
  if (process.platform === 'win32') {
    await killPortListenersWindows(port);
  } else {
    await killPortListenersPosix(port);
  }
  for (let i = 0; i < 10; i += 1) {
    if (!(await isPortOpen(port))) return true;
    await sleep(250);
  }
  return !(await isPortOpen(port));
}

async function checkHealth(timeoutMs = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json && json.status === 'ok' && json.database === 'connected';
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealthy(seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  let nextLog = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await checkHealth(2000)) return true;
    if (Date.now() >= nextLog) {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      logStep(`waiting for DB-ready health (${left}s left) ...`);
      nextLog = Date.now() + 5000;
    }
    await sleep(900);
  }
  return false;
}

async function ensureDependencies() {
  if (fs.existsSync(path.join(rootDir, 'node_modules', 'express'))) return true;
  logStep('dependencies missing, running npm install ...');
  const installed = process.platform === 'win32'
    ? await execCommand('cmd', ['/d', '/s', '/c', 'npm install --no-fund --no-audit'])
    : await execCommand('npm', ['install', '--no-fund', '--no-audit']);
  return installed.ok;
}

function startBackendDetached() {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: rootDir,
    detached: true,
    windowsHide: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      JCMS_PORT: String(PORT),
    },
  });
  child.unref();
  return child.pid;
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

async function selfHeal(reason) {
  logErr(`self-heal triggered: ${reason}`);
  await stopKnownPid();
  await stopPm2ProcessIfPresent();
  await ensurePortFree(PORT);
  await ensureDependencies();
}

async function main() {
  logStep('==============================================');
  logStep(`launcher root: ${rootDir}`);
  logStep(`target port: ${PORT}`);
  logStep(`health check: ${healthUrl}`);
  logStep('==============================================');

  if (!fs.existsSync(serverEntry)) {
    logErr(`server.js not found at ${serverEntry}`);
    process.exitCode = 1;
    return;
  }

  const depsOk = await ensureDependencies();
  if (!depsOk) {
    logErr('npm install failed; abort.');
    process.exitCode = 1;
    return;
  }

  let success = false;
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
    logStep(`startup attempt ${attempt}/${RETRY_LIMIT}`);
    await selfHeal('pre-flight cleanup');

    if (!(await ensurePortFree(PORT))) {
      logErr(`port ${PORT} still busy`);
      writeState({ success: false, reason: 'port_busy', attempt });
      if (attempt < RETRY_LIMIT) await sleep(RETRY_WAIT_MS);
      continue;
    }

    const pid = startBackendDetached();
    writePid(pid);
    logStep(`backend spawned pid=${pid}`);

    const healthy = await waitForHealthy(120);
    if (healthy) {
      success = true;
      writeState({ success: true, pid, attempt, port: PORT, healthUrl, appUrl });
      break;
    }

    writeState({ success: false, reason: 'health_timeout', pid, attempt, healthUrl });
    await selfHeal('health check timeout / db not connected');
    if (attempt < RETRY_LIMIT) await sleep(RETRY_WAIT_MS);
  }

  if (!success) {
    logErr(`failed after ${RETRY_LIMIT} attempts. browser will NOT be opened.`);
    logErr(`check health manually: ${healthUrl}`);
    process.exitCode = 1;
    return;
  }

  if (NO_BROWSER) {
    logStep(`healthy. browser skipped by JCMS_NO_BROWSER=1 -> ${appUrl}`);
  } else {
    logStep(`healthy. opening ${appUrl}`);
    openBrowser(appUrl);
  }
  process.exitCode = 0;
}

main().catch((err) => {
  logErr(`fatal launcher error: ${err && err.message ? err.message : String(err)}`);
  process.exitCode = 1;
});
