/**
 * Test helpers: start a real Trellis server on a free port with a fresh,
 * temporary data folder, sign in, call the API.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASSWORD = 'test-password-123';
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const tmpDir = (prefix = 'trellis-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Start a server. Resolves once /api/health answers.
 * @param {{ env?: Record<string, string>, dataDir?: string }} [options]
 */
export async function startServer({ env = {}, dataDir = tmpDir() } = {}) {
  const port = await freePort();
  const log = [];
  const child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, TRELLIS_ENV_FILE: 'none', ADMIN_PASSWORD: PASSWORD, BACKUP: 'off', NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Server exited:\n${log.join('')}`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`Server didn't start:\n${log.join('')}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  const adminPath = fs.readFileSync(path.join(dataDir, 'admin-path'), 'utf8').trim();
  const server = {
    url,
    port,
    dataDir,
    adminPath,
    log,
    /** fetch relative to the server, with a browser-like User-Agent. */
    fetch: (p, init = {}) => fetch(url + p, { redirect: 'manual', ...init, headers: { 'User-Agent': UA, ...init.headers } }),
    /** Sign in; resolves to headers for editor API calls (cookie + CSRF header). */
    async login({ password = PASSWORD, code } = {}) {
      const res = await server.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'trellis' },
        body: JSON.stringify({ password, path: adminPath, ...(code && { code }) }),
      });
      const body = await res.json();
      if (!res.ok) return Object.assign(new Error(body.error), { status: res.status, body });
      return { 'Content-Type': 'application/json', 'X-Requested-With': 'trellis', Cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
    },
    /** JSON API call: resolves to { status, body, headers }. */
    async api(method, p, { headers = {}, json } = {}) {
      const res = await server.fetch(p, { method, headers: { ...(json !== undefined && { 'Content-Type': 'application/json' }), ...headers }, body: json !== undefined ? JSON.stringify(json) : undefined });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: res.status, body, headers: res.headers };
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    },
  };
  return server;
}

/** A Chromium/Chrome for browser tests, or null (the tests are then skipped). */
export async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return null;
  }
  const candidates = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    { channel: 'chrome' },
    fs.existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' },
    fs.existsSync('/Applications/Google Chrome.app') && { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { channel: 'msedge' },
  ].filter(Boolean);
  for (const options of candidates) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch {
      /* try the next one */
    }
  }
  return null;
}
