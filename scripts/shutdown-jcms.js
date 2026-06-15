#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const runtimeDir = path.join(rootDir, '.jcms-runtime');
const pidFile = path.join(runtimeDir, 'server.pid');

const PROCESS_NAME = 'jcms-api';
const PORT = resolvePort();
const healthUrl = `http://127.0.0.1:${PORT}/api/health`;

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

function readLastPid() {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

function clearPidFile() {
  try {
    fs.unlinkSync(pidFile);
  } catch (_) {
    // ignore
  }
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
  if (!fs.existsSync(pm2Js)) return false;
  const stop = await execCommand(process.execPath, [pm2Js, 'stop', PROCESS_NAME]);
  const del = await execCommand(process.execPath, [pm2Js, 'delete', PROCESS_NAME]);
  return stop.ok || del.ok;
}

async function stopKnownPid() {
  const pid = readLastPid();
  if (!pid) return false;
  if (!isPidAlive(pid)) {
    clearPidFile();
    return false;
  }
  logStep(`stopping recorded pid=${pid} ...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (_) {
    clearPidFile();
    return false;
  }
  for (let i = 0; i < 12; i += 1) {
    if (!isPidAlive(pid)) {
      clearPidFile();
      return true;
    }
    await sleep(200);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {
    // ignore
  }
  clearPidFile();
  return true;
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
  if (!result.stdout) return [];
  const lines = result.stdout.split(/\r?\n/);
  const pids = new Set();
  for (const line of lines) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const match = line.trim().match(/\s+(\d+)\s*$/);
    if (match) pids.add(Number(match[1]));
  }
  const killed = [];
  for (const pid of pids) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    logStep(`stopping listener on port ${port} (pid=${pid}) ...`);
    await execCommand('taskkill', ['/PID', String(pid), '/F']);
    killed.push(pid);
  }
  return killed;
}

async function killPortListenersPosix(port) {
  const result = await execCommand('lsof', ['-ti', `tcp:${port}`]);
  if (!result.stdout) return [];
  const pids = result.stdout
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
  for (const pid of pids) {
    logStep(`stopping listener on port ${port} (pid=${pid}) ...`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {
      // ignore
    }
  }
  return pids;
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

async function checkHealth(timeoutMs = 2000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json && json.status === 'ok';
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  logStep('==============================================');
  logStep(`shutdown root: ${rootDir}`);
  logStep(`target port: ${PORT}`);
  logStep('==============================================');

  const wasHealthy = await checkHealth(1500);
  const stoppedPid = await stopKnownPid();
  const stoppedPm2 = await stopPm2ProcessIfPresent();
  const killedOnPort = process.platform === 'win32'
    ? await killPortListenersWindows(PORT)
    : await killPortListenersPosix(PORT);
  const portFree = await ensurePortFree(PORT);
  const stillHealthy = await checkHealth(1500);

  if (!wasHealthy && !stoppedPid && !stoppedPm2 && killedOnPort.length === 0) {
    logStep(`JCMS does not appear to be running (port ${PORT} is free).`);
    process.exitCode = 0;
    return;
  }

  if (portFree && !stillHealthy) {
    logStep(`JCMS stopped. Port ${PORT} is free.`);
    process.exitCode = 0;
    return;
  }

  logErr(`JCMS may still be running on port ${PORT}. Check Task Manager or run: netstat -ano | findstr :${PORT}`);
  process.exitCode = 1;
}

main().catch((err) => {
  logErr(`fatal shutdown error: ${err && err.message ? err.message : String(err)}`);
  process.exitCode = 1;
});
